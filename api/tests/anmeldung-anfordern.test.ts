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
 * Reicht alles an den echten Pool durch, außer das Schreiben des Magic
 * Links — das scheitert, wie es eine gestörte Datenbank auch täte. Steht
 * für N2: Die Absicherung gegen das Mitgliedschafts-Orakel muss auch diesen
 * Schreibzugriff abdecken, nicht nur den Mailversand danach.
 */
function poolMitScheiterndemMagicLinkSchreiben(echterPool: pg.Pool): pg.Pool {
  return {
    query: (text: unknown, werte?: unknown) => {
      if (typeof text === 'string' && text.includes('INSERT INTO magic_link')) {
        return Promise.reject(new Error('Die Datenbank antwortet gerade nicht.'));
      }
      return (echterPool.query as (text: unknown, werte?: unknown) => unknown)(text, werte);
    },
  } as unknown as pg.Pool;
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
    }
    await app.warteAufHintergrundarbeit();

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

    const anfordern = () =>
      app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org' },
      });

    const erste = await anfordern();
    // Ohne dieses Warten liefe die zweite Anfrage der Begrenzung davon: Sie
    // schaut in `magic_link` nach, und ohne Garantie, dass die erste Anfrage
    // dort schon geschrieben hat, wäre offen, ob die Begrenzung überhaupt
    // greift — ein Wettrennen, kein verlässlicher Test.
    await app.warteAufHintergrundarbeit();
    const zweite = await anfordern();
    await app.warteAufHintergrundarbeit();

    // Gleicher Code, gleicher Text — der Unterschied steckt nur darin, ob
    // eine Mail entstand.
    expect(zweite.statusCode).toBe(erste.statusCode);
    expect(zweite.json()).toEqual(erste.json());
    expect(mailer.versendet).toHaveLength(1);
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
