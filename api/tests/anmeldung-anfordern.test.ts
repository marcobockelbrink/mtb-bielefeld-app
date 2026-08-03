import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer, NichtEingerichteterMailer, type Mailer } from '../src/mailer.ts';
import { GemerktesProtokoll } from '../src/protokoll.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

/** Steht für eine vorübergehend gestörte Mailstrecke. */
class ScheiterderMailer implements Mailer {
  async sende(): Promise<void> {
    throw new Error('Der Mailanbieter antwortet gerade nicht.');
  }
}

/**
 * Bleibt im Versand stehen, bis der Test freigibt.
 *
 * Damit lässt sich Überlast ohne Zeitannahmen herstellen: Solange der erste
 * Vorgang hier hängt, ist er nachweislich noch am Laufen — ein Test, der
 * stattdessen darauf setzt, dass die nächste Anfrage schon eintrifft, bevor
 * die Datenbank geantwortet hat, wäre ein Wettrennen mit sich selbst.
 */
class AnhaltenderMailer implements Mailer {
  readonly angekommen: string[] = [];
  /** Erfüllt sich, sobald der erste Versand wirklich angefangen hat. */
  readonly begonnen: Promise<void>;
  readonly #freigabe: Promise<void>;
  #meldeBeginn!: () => void;
  #freigeben!: () => void;

  constructor() {
    this.begonnen = new Promise((erfuellen) => {
      this.#meldeBeginn = erfuellen;
    });
    this.#freigabe = new Promise((erfuellen) => {
      this.#freigeben = erfuellen;
    });
  }

  gibFrei(): void {
    this.#freigeben();
  }

  async sende(an: string): Promise<void> {
    this.angekommen.push(an);
    this.#meldeBeginn();
    await this.#freigabe;
  }
}

/**
 * Reicht alles an den echten Pool durch, außer das Schreiben des Magic
 * Links — das scheitert, wie es eine gestörte Datenbank auch täte. Steht
 * für N2: Die Absicherung gegen das Mitgliedschafts-Orakel muss auch diesen
 * Schreibzugriff abdecken, nicht nur den Mailversand danach.
 *
 * Auch `connect` wird durchgereicht: Das Anlegen läuft seit K1 in einer
 * Transaktion auf einer eigenen Verbindung, und BEGIN, Sperre, Zählung und
 * ROLLBACK sollen dabei echt sein — nur das INSERT scheitert.
 */
function poolMitScheiterndemMagicLinkSchreiben(echterPool: pg.Pool): pg.Pool {
  const gestoert = (text: unknown): boolean =>
    typeof text === 'string' && text.includes('INSERT INTO magic_link');

  const frage = (
    ziel: { query: (text: unknown, werte?: unknown) => unknown },
    text: unknown,
    werte?: unknown,
  ): unknown =>
    gestoert(text)
      ? Promise.reject(new Error('Die Datenbank antwortet gerade nicht.'))
      : ziel.query(text, werte);

  return {
    query: (text: unknown, werte?: unknown) =>
      frage(echterPool as unknown as { query: (t: unknown, w?: unknown) => unknown }, text, werte),
    connect: async () => {
      const verbindung = await echterPool.connect();
      return {
        query: (text: unknown, werte?: unknown) =>
          frage(
            verbindung as unknown as { query: (t: unknown, w?: unknown) => unknown },
            text,
            werte,
          ),
        release: () => verbindung.release(),
      };
    },
  } as unknown as pg.Pool;
}

/**
 * Legt Verbindungen im Pool an, bevor es losgeht.
 *
 * Ohne das sind gleichzeitige Anfragen gar nicht wirklich gleichzeitig: Die
 * erste greift sich die einzige bereitliegende Verbindung und ist mit allen
 * Datenbankumläufen durch, während die übrigen noch TCP und Anmeldung hinter
 * sich bringen. Ein Test für einen Wettlauf, der von selbst keiner ist,
 * belegt nichts.
 */
async function waermePoolAuf(anzahl: number): Promise<void> {
  await Promise.all(Array.from({ length: anzahl }, () => pool.query('SELECT 1')));
}

/**
 * Wartet, bis eine bestimmte Adresse beim `AnhaltenderMailer` angekommen
 * ist — als Beleg, dass ein Hintergrundvorgang wirklich angefangen hat, und
 * nicht nur, dass die Antwort des Endpunkts das nahelegt.
 */
async function warteAufAnkunft(
  mailer: AnhaltenderMailer,
  adresse: string,
  hoechstensMs = 2_000,
): Promise<void> {
  const start = Date.now();
  while (!mailer.angekommen.includes(adresse)) {
    if (Date.now() - start > hoechstensMs) {
      throw new Error(`„${adresse}" ist nicht innerhalb von ${hoechstensMs}ms angekommen.`);
    }
    await new Promise((erfuellen) => setTimeout(erfuellen, 5));
  }
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /anmeldung/anfordern', () => {
  it('verschickt bei gültigem Code eine Mail mit Link', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(1);
    expect(mailer.versendet[0]?.an).toBe('malte@example.org');
    await app.close();
  });

  it('verbraucht den Code beim Anfordern nicht', async () => {
    const mailer = new GemerkterMailer();
    // Die Uhr rückt je Versuch um fünf Minuten vor: Drei Anforderungen zur
    // exakt gleichen Sekunde würde die Begrenzung aus Aufgabe 2 zu Recht
    // abweisen — hier geht es aber um den Einladungscode, nicht um sie.
    let momentan = jetzt;
    const app = baueApp({ pool, mailer, jetzt: () => momentan });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    for (let i = 0; i < 3; i++) {
      momentan = new Date(jetzt.getTime() + i * 5 * 60 * 1000);
      await app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org', einladungscode: code },
      });
      // Hier ist das Warten richtig: Gemeint sind drei **nacheinander**
      // abgeschickte Anforderungen mit fünf Minuten Abstand. Ohne das Warten
      // liefen sie gleichzeitig, und die Begrenzung würde sie zu Recht in
      // beliebiger Reihenfolge durch die Sperre lassen — eine davon mit einem
      // früheren Zeitpunkt als die schon geschriebene, also am Mindestabstand
      // gescheitert. Der Test geht aber um den Einladungscode, nicht um sie.
      await app.warteAufHintergrundarbeit();
    }

    // Wer den ersten Link liegen lässt, darf einen neuen anfordern können.
    // Würde der Code hier verbraucht, wäre er nach dem ersten Versuch
    // dauerhaft ausgesperrt.
    expect(mailer.versendet).toHaveLength(3);
    const { rows } = await pool.query<{ eingeloest_am: Date | null }>(
      'SELECT eingeloest_am FROM einladung',
    );
    expect(rows[0]?.eingeloest_am).toBeNull();
    await app.close();
  });

  it('verschickt an ein bestehendes Mitglied auch ohne Code', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
    });
    await app.warteAufHintergrundarbeit();

    // Die Eintrittskarte ist verbraucht, die Mitgliedschaft besteht — die
    // Adresse genügt. Sonst käme niemand auf ein zweites Gerät.
    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(1);
    await app.close();
  });

  it('verschickt an eine unbekannte Adresse ohne Code nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org' },
    });
    await app.warteAufHintergrundarbeit();

    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(0);
    await app.close();
  });

  it('antwortet bei gültigem Code aber falscher Adresse genauso, verschickt aber nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    // Der Code ist an malte@example.org gebunden — ein weitergereichter Code
    // darf nicht mit jeder beliebigen Adresse funktionieren.
    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(0);
    await app.close();
  });

  it('antwortet bei falschem Code genauso, verschickt aber nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });
    await app.warteAufHintergrundarbeit();

    // Gleiche Antwort wie im Erfolgsfall — sonst ließe sich damit erraten,
    // wer Mitglied ist.
    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(0);
    await app.close();
  });

  it('verrät im Text nicht, woran es lag', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });
    await app.warteAufHintergrundarbeit();

    const text = JSON.stringify(antwort.json());
    expect(text).not.toMatch(/unbekannt|verbraucht|abgelaufen|falsche-adresse|adresse/i);
    await app.close();
  });

  it('verrät im Text auch bei falscher Adresse nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    const text = JSON.stringify(antwort.json());
    expect(text).not.toMatch(/unbekannt|verbraucht|abgelaufen|falsche-adresse|adresse/i);
    await app.close();
  });

  it('antwortet für Mitglied und Nichtmitglied Zeichen für Zeichen gleich', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");

    const mitglied = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
    });
    const fremd = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org' },
    });
    await app.warteAufHintergrundarbeit();

    expect(mitglied.statusCode).toBe(fremd.statusCode);
    expect(mitglied.body).toBe(fremd.body);
    await app.close();
  });

  it('bleibt bei scheiterndem Mailversand von außen ununterscheidbar', async () => {
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool,
      mailer: new ScheiterderMailer(),
      jetzt: () => jetzt,
      protokoll,
    });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    // Richtiger Code, aber der Versand scheitert.
    const echt = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    // Falscher Code — hier wird gar nicht erst verschickt.
    const falsch = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });
    await app.warteAufHintergrundarbeit();

    // Genau dieser Unterschied wäre die Auskunft, wer Mitglied ist.
    expect(echt.statusCode).toBe(202);
    expect(echt.statusCode).toBe(falsch.statusCode);
    expect(echt.body).toBe(falsch.body);
    await app.close();
  });

  it('protokolliert den gescheiterten Versand, statt ihn zu verschlucken', async () => {
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool,
      mailer: new ScheiterderMailer(),
      jetzt: () => jetzt,
      protokoll,
    });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    // Der Fehler verschwindet nicht, er wechselt nur den Empfänger.
    expect(protokoll.fehler).toHaveLength(1);
    expect(protokoll.fehler[0]?.daten).toMatchObject({ an: 'malte@example.org' });
    expect(String(protokoll.fehler[0]?.daten.fehler)).toMatch(/antwortet gerade nicht/);
    await app.close();
  });

  it('bleibt bei scheiterndem Schreiben des Magic Links von außen ununterscheidbar', async () => {
    const protokoll = new GemerktesProtokoll();
    const mailer = new GemerkterMailer();
    const app = baueApp({
      pool: poolMitScheiterndemMagicLinkSchreiben(pool),
      mailer,
      jetzt: () => jetzt,
      protokoll,
    });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    // Richtiger Code, aber das Schreiben des Magic Links scheitert.
    const echt = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    // Falscher Code — hier wird gar nicht erst geschrieben.
    const falsch = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });
    await app.warteAufHintergrundarbeit();

    // Genau dieser Unterschied wäre die Auskunft, wer Mitglied ist — er darf
    // bei einer gestörten Datenbank so wenig entstehen wie bei einer
    // gestörten Mailstrecke.
    expect(echt.statusCode).toBe(202);
    expect(echt.statusCode).toBe(falsch.statusCode);
    expect(echt.body).toBe(falsch.body);
    expect(mailer.versendet).toHaveLength(0);
    await app.close();
  });

  it('protokolliert das gescheiterte Schreiben des Magic Links, statt es zu verschlucken', async () => {
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool: poolMitScheiterndemMagicLinkSchreiben(pool),
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      protokoll,
    });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    expect(protokoll.fehler).toHaveLength(1);
    expect(protokoll.fehler[0]?.daten).toMatchObject({ an: 'malte@example.org' });
    expect(String(protokoll.fehler[0]?.daten.fehler)).toMatch(/antwortet gerade nicht/);
    await app.close();
  });

  it('verrät auch mit dem nicht eingerichteten Mailer nichts', async () => {
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool,
      mailer: new NichtEingerichteterMailer(),
      jetzt: () => jetzt,
      protokoll,
    });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    await app.warteAufHintergrundarbeit();

    expect(antwort.statusCode).toBe(202);
    expect(protokoll.fehler).toHaveLength(1);
    await app.close();
  });

  it('antwortet auch bei greifender Begrenzung mit 202', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    await waermePoolAuf(8);

    const anfordern = () =>
      app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org' },
      });

    // Bewusst **ohne** Warten zwischen den beiden Anfragen: Ein Test, der
    // hier erst die Hintergrundarbeit abwartet, prüft eine Bedingung, die im
    // Betrieb nie gilt. Seit Prüfung und Einfügen eine Transaktion sind,
    // braucht es das Warten auch nicht mehr.
    const erste = await anfordern();
    const zweite = await anfordern();
    await app.warteAufHintergrundarbeit();

    // Gleicher Code, gleicher Text — der Unterschied steckt nur darin, ob
    // eine Mail entstand.
    expect(zweite.statusCode).toBe(erste.statusCode);
    expect(zweite.json()).toEqual(erste.json());
    expect(mailer.versendet).toHaveLength(1);
    await app.close();
  });

  it('lässt bei gleichzeitigen Anfragen für dieselbe Adresse nur eine Mail entstehen', async () => {
    // Der entscheidende Test für K1: fünf Anfragen ohne jedes Warten
    // dazwischen — so, wie jemand sie abfeuern würde, der ein Postfach
    // fluten will. Waren Prüfung und Einfügen getrennt, kamen alle fünf
    // durch: Jede las den Zählstand, bevor eine andere geschrieben hatte.
    const mailer = new GemerkterMailer();
    // Echte Uhr, weil es hier gerade um die Gleichzeitigkeit geht.
    const app = baueApp({ pool, mailer });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    await waermePoolAuf(8);

    const antworten = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/anmeldung/anfordern',
          payload: { email: 'malte@example.org' },
        }),
      ),
    );
    await app.warteAufHintergrundarbeit();

    // Alle fünf treffen praktisch zur selben Sekunde ein, also greift der
    // Mindestabstand von einer Minute: genau eine Mail, genau eine Zeile.
    expect(antworten.map((antwort) => antwort.statusCode)).toEqual([202, 202, 202, 202, 202]);
    expect(mailer.versendet).toHaveLength(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('hält die Höchstzahl auch bei gleichzeitigen Anfragen ein', async () => {
    const mailer = new GemerkterMailer();
    // Jede Anfrage bekommt einen eigenen Zeitpunkt im Abstand von fünf
    // Minuten. Damit ist nicht der Mindestabstand die Bremse, sondern die
    // Höchstzahl je Stunde — und die muss auch dann halten, wenn alle sechs
    // Anfragen gleichzeitig unterwegs sind.
    const start = new Date('2026-08-02T12:00:00Z');
    let wievielte = 0;
    const app = baueApp({
      pool,
      mailer,
      jetzt: () => new Date(start.getTime() + wievielte++ * 5 * 60 * 1000),
    });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    await waermePoolAuf(8);

    const antworten = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/anmeldung/anfordern',
          payload: { email: 'malte@example.org' },
        }),
      ),
    );
    await app.warteAufHintergrundarbeit();

    expect(antworten.map((antwort) => antwort.statusCode)).toEqual([202, 202, 202, 202, 202, 202]);
    // Höchstens drei — die Grenze. Nicht genau drei: In welcher Reihenfolge
    // die Sperre die sechs durchlässt, ist offen, und eine Anfrage mit einem
    // früheren Zeitpunkt als die schon geschriebene fällt zusätzlich über den
    // Mindestabstand. Weniger als drei ist erlaubt, mehr nie.
    expect(mailer.versendet.length).toBeLessThanOrEqual(3);
    expect(mailer.versendet.length).toBeGreaterThanOrEqual(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows.length).toBe(mailer.versendet.length);
    await app.close();
  });

  it('antwortet bei Überlast unverändert und verwirft die Arbeit laut', async () => {
    // Der entscheidende Test für W4. Seit die Antwort der Arbeit vorausgeht,
    // bremst nichts mehr den Anfragenden: Ohne Obergrenze wüchsen die Menge
    // der laufenden Vorgänge und die Warteschlange des Pools mit der
    // Anfragerate. Die Grenze steht hier auf eins, damit Überlast ohne
    // Dutzende Anfragen entsteht.
    const mailer = new AnhaltenderMailer();
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool,
      mailer,
      jetzt: () => jetzt,
      protokoll,
      hoechstensGleichzeitig: 1,
    });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");

    const anfordern = (email: string) =>
      app.inject({ method: 'POST', url: '/anmeldung/anfordern', payload: { email } });

    const erste = await anfordern('malte@example.org');
    // Ab hier steht der erste Vorgang nachweislich im Mailer — die Grenze ist
    // erreicht, ohne dass der Test auf eine Reihenfolge hoffen muss.
    await mailer.begonnen;

    const zweite = await anfordern('malte@example.org');
    const dritte = await anfordern('fremd@example.org');

    // Das Entscheidende: Von außen ist Überlast nicht zu erkennen. Wäre sie
    // es, wäre die Antwort wieder ein Orakel — verworfen wird unabhängig
    // davon, ob die Adresse zum Verein gehört, und genau das muss sie auch
    // bleiben.
    expect(erste.statusCode).toBe(202);
    expect(zweite.statusCode).toBe(erste.statusCode);
    expect(zweite.body).toBe(erste.body);
    expect(dritte.statusCode).toBe(erste.statusCode);
    expect(dritte.body).toBe(erste.body);

    // Verworfen, aber nicht still — sonst wäre die Grenze ein stiller
    // Fehlschlag mit Obergrenze.
    expect(protokoll.fehler).toHaveLength(2);
    expect(protokoll.fehler[0]?.nachricht).toMatch(/verworfen/);
    expect(protokoll.fehler[0]?.daten).toMatchObject({ laufend: 1, grenze: 1 });

    // Und die verworfene Arbeit hat auch wirklich nicht angefangen: keine
    // zweite Mail, keine zweite Zeile.
    mailer.gibFrei();
    await app.warteAufHintergrundarbeit();
    expect(mailer.angekommen).toEqual(['malte@example.org']);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('nimmt nach dem Ende eines Vorgangs wieder Arbeit an', async () => {
    // Die Grenze ist eine Obergrenze für gleichzeitige Vorgänge, kein
    // dauerhafter Riegel: Ist der laufende fertig, ist wieder Platz.
    const mailer = new GemerkterMailer();
    const protokoll = new GemerktesProtokoll();
    let momentan = jetzt;
    const app = baueApp({
      pool,
      mailer,
      jetzt: () => momentan,
      protokoll,
      hoechstensGleichzeitig: 1,
    });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");

    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
    });
    await app.warteAufHintergrundarbeit();

    // Fünf Minuten später — sonst bremste der Mindestabstand der Begrenzung
    // statt der Obergrenze, und der Test bewiese das Falsche.
    momentan = new Date(jetzt.getTime() + 5 * 60 * 1000);
    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
    });
    await app.warteAufHintergrundarbeit();

    expect(mailer.versendet).toHaveLength(2);
    expect(protokoll.fehler).toHaveLength(0);
    await app.close();
  });

  it('gibt den Platz eines hängenden Vorgangs nach der Zeitschranke frei', async () => {
    // B aus der Nachprüfung: Eine Obergrenze, deren Plätze nur im
    // `.finally()` der Arbeit selbst frei werden, setzt sich dauerhaft zu,
    // sobald ein Vorgang hängt. Hier hält der erste Vorgang absichtlich für
    // immer im Mailer fest — die Zeitschranke muss den Platz trotzdem
    // freigeben, ohne dass der erste Vorgang selbst je fertig wird.
    const mailer = new AnhaltenderMailer();
    const protokoll = new GemerktesProtokoll();
    const app = baueApp({
      pool,
      mailer,
      jetzt: () => jetzt,
      protokoll,
      hoechstensGleichzeitig: 1,
      hintergrundZeitschrankeMs: 20,
    });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    await pool.query("INSERT INTO mitglied (email) VALUES ('anna@example.org')");

    const erste = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
    });
    // Ab hier hält der erste Vorgang den einzigen Platz und wird ihn nie
    // von selbst freigeben — er hängt im Mailer, bis der Test freigibt.
    await mailer.begonnen;

    // Auf die Zeitschranke warten (real, sie ist mit 20ms knapp bemessen).
    await new Promise((erfuellen) => setTimeout(erfuellen, 200));

    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'anna@example.org' },
    });

    expect(erste.statusCode).toBe(202);
    expect(zweite.statusCode).toBe(202);

    // Das Entscheidende: Der zweite Vorgang hat wirklich angefangen — nicht
    // nur, dass die Antwort gleich aussieht, sondern dass er tatsächlich bis
    // zum Mailer kam. Das wäre unmöglich geblieben, hätte der erste, ewig
    // hängende Vorgang den einzigen Platz für immer behalten.
    await warteAufAnkunft(mailer, 'anna@example.org');

    // Und der Zeitüberlauf des ersten Vorgangs wurde laut protokolliert,
    // statt still zu bleiben.
    expect(
      protokoll.fehler.some((eintrag) => eintrag.nachricht.includes('Zeitschranke')),
    ).toBe(true);

    // Aufräumen: beide hängenden Sende-Aufrufe freigeben, damit die
    // Hintergrundarbeit dieses Tests nicht in den nächsten hineinläuft.
    mailer.gibFrei();
    await new Promise((erfuellen) => setTimeout(erfuellen, 50));
    await app.close();
  });

  it('weist eine fehlende E-Mail mit 400 ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { einladungscode: 'egal' },
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });

  it('weist einen Einladungscode vom falschen Typ mit 400 ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: 42 },
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });
});
