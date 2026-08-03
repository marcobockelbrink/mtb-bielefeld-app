import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fordereMagicLinkAn } from '../src/anmeldung.ts';
import { raeumeAuf } from '../src/aufraeumen.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { GemerktesProtokoll, type Protokoll } from '../src/protokoll.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

/**
 * Ein Protokoll, das nichts tut — hier wird nichts davon geprüft.
 */
const stillesProtokoll: Protokoll = {
  error: () => {},
};

const start = new Date('2026-08-03T12:00:00Z');

/** Legt ein Mitglied an, damit kein Einladungscode nötig ist. */
async function mitgliedAnlegen(): Promise<void> {
  await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
}

/**
 * Legt Verbindungen im Pool an, bevor es losgeht.
 *
 * Ohne das sind gleichzeitige Anforderungen gar nicht wirklich gleichzeitig:
 * Die erste greift sich die einzige bereitliegende Verbindung und ist mit
 * allen drei Datenbankumläufen durch, während die übrigen noch TCP und
 * Anmeldung hinter sich bringen. Ein Test für einen Wettlauf, der von selbst
 * keiner ist, belegt nichts.
 */
async function waermePoolAuf(anzahl: number): Promise<void> {
  await Promise.all(Array.from({ length: anzahl }, () => pool.query('SELECT 1')));
}

/** Fordert an und gibt zurück, wie viele Mails insgesamt verschickt wurden. */
async function fordere(mailer: GemerkterMailer, jetzt: Date): Promise<number> {
  await fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'malte@example.org', undefined, jetzt);
  return mailer.versendet.length;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('Begrenzung je Adresse', () => {
  it('lässt die erste Anforderung durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    expect(await fordere(mailer, start)).toBe(1);
  });

  it('lehnt eine zweite Anforderung innerhalb einer Minute ab', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachDreissigSekunden = new Date(start.getTime() + 30 * 1000);

    expect(await fordere(mailer, nachDreissigSekunden)).toBe(1);
  });

  it('lässt nach einer Minute wieder eine durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachZweiMinuten = new Date(start.getTime() + 2 * 60 * 1000);

    expect(await fordere(mailer, nachZweiMinuten)).toBe(2);
  });

  it('lässt höchstens drei je Stunde durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    // Drei im Abstand von je fünf Minuten: alle erlaubt.
    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Die vierte innerhalb derselben Stunde nicht mehr.
    const anzahl = await fordere(mailer, new Date(start.getTime() + 15 * 60 * 1000));

    expect(anzahl).toBe(3);
  });

  it('zählt das Fenster gleitend, nicht je voller Stunde', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Gut eine Stunde nach der ersten: Die erste ist aus dem Fenster
    // gefallen, also ist wieder Platz.
    const spaeter = new Date(start.getTime() + 61 * 60 * 1000);

    expect(await fordere(mailer, spaeter)).toBe(4);
  });

  it('begrenzt je Adresse, nicht insgesamt', async () => {
    await mitgliedAnlegen();
    await pool.query("INSERT INTO mitglied (email) VALUES ('anna@example.org')");
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'anna@example.org',
      undefined,
      new Date(start.getTime() + 1000),
    );

    expect(mailer.versendet).toHaveLength(2);
  });

  it('lässt von gleichzeitigen Anforderungen nur eine durch', async () => {
    // Der entscheidende Test für K1, hier ohne Endpunkt und ohne Uhr
    // dazwischen: fünf Anforderungen zur selben Sekunde, alle gleichzeitig
    // unterwegs. Waren Prüfung und Einfügen getrennt, las jede den Zählstand,
    // bevor eine andere geschrieben hatte — und alle fünf kamen durch.
    await mitgliedAnlegen();
    await waermePoolAuf(8);
    const mailer = new GemerkterMailer();

    await Promise.all(
      Array.from({ length: 5 }, () =>
        fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'malte@example.org', undefined, start),
      ),
    );

    expect(mailer.versendet).toHaveLength(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
  });

  it('lässt auch bei gleichzeitigen Anforderungen höchstens drei je Stunde durch', async () => {
    // Wie oben, nur mit fünf Minuten Abstand je Anforderung: Damit ist nicht
    // der Mindestabstand die Bremse, sondern die Höchstzahl.
    await mitgliedAnlegen();
    await waermePoolAuf(8);
    const mailer = new GemerkterMailer();

    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        fordereMagicLinkAn(
          pool,
          mailer,
          stillesProtokoll,
          'malte@example.org',
          undefined,
          new Date(start.getTime() + i * 5 * 60 * 1000),
        ),
      ),
    );

    // Höchstens drei — die Grenze. Nicht genau drei: In welcher Reihenfolge
    // die Sperre die sechs durchlässt, ist offen, und wer mit einem früheren
    // Zeitpunkt als die schon geschriebene Zeile ankommt, fällt zusätzlich
    // über den Mindestabstand. Weniger ist erlaubt, mehr nie.
    expect(mailer.versendet.length).toBeLessThanOrEqual(3);
    expect(mailer.versendet.length).toBeGreaterThanOrEqual(1);
  });

  it('sperrt nur je Adresse, nicht über alle hinweg', async () => {
    // Die Sperre soll Anfragen für dieselbe Adresse aufreihen — und
    // verschiedene Adressen ungebremst nebeneinander durchlassen.
    await mitgliedAnlegen();
    await pool.query("INSERT INTO mitglied (email) VALUES ('anna@example.org')");
    const mailer = new GemerkterMailer();

    await Promise.all([
      fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'malte@example.org', undefined, start),
      fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'anna@example.org', undefined, start),
    ]);

    expect(mailer.versendet).toHaveLength(2);
  });

  it('unterscheidet Groß- und Kleinschreibung nicht', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'MALTE@example.org',
      undefined,
      new Date(start.getTime() + 30 * 1000),
    );

    expect(mailer.versendet).toHaveLength(1);
  });
});

/**
 * A aus der Nachprüfung: Ohne Zeitschranke wartet `pg_advisory_xact_lock`
 * unbegrenzt, falls die Sperre schon gehalten wird — und blockiert dabei
 * eine Poolverbindung auf unbestimmte Zeit. Bei zehn Verbindungen im Pool
 * reicht das, um jede weitere Anfrage lahmzulegen, auch solche, die mit der
 * hängenden Adresse gar nichts zu tun haben.
 */
describe('Zeitschranke der Sperre', () => {
  it('gibt bei einer hängenden Sperre auf, statt endlos zu warten, und meldet es laut', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();
    const protokoll = new GemerktesProtokoll();

    // Eine zweite, echte Verbindung hält die Sperre für dieselbe Adresse
    // offen, bevor die Anforderung überhaupt beginnt. Damit ist das Warten
    // in `legeAnWennDieBegrenzungEsZulaesst` kein Wettlauf, sondern
    // garantiert — `lock_timeout` muss die Anforderung von selbst beenden.
    const haeltDieSperre = await pool.connect();
    await haeltDieSperre.query('BEGIN');
    await haeltDieSperre.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [
      'malte@example.org',
    ]);

    try {
      // Wirft nach außen nicht: Ein Zeitüberlauf beim Sperren wird wie eine
      // greifende Begrenzung behandelt, siehe `fordereMagicLinkAn`.
      await expect(
        fordereMagicLinkAn(pool, mailer, protokoll, 'malte@example.org', undefined, start),
      ).resolves.toBeUndefined();

      // Kein Link, keine Mail — wie bei einer greifenden Begrenzung.
      expect(mailer.versendet).toHaveLength(0);
      const { rows } = await pool.query('SELECT id FROM magic_link');
      expect(rows).toHaveLength(0);

      // Anders als bei einer normal greifenden Begrenzung (die bleibt
      // stumm) ist ein Zeitüberlauf ein echter Fehler und geht laut ins
      // Protokoll, damit der Betreiber ihn sieht.
      expect(protokoll.fehler).toHaveLength(1);
      expect(protokoll.fehler[0]?.daten).toMatchObject({ an: 'malte@example.org' });
      expect(protokoll.fehler[0]?.nachricht).toMatch(/nicht angelegt/);
      // lock_timeout und statement_timeout stehen auf denselben Wert und
      // starten praktisch gleichzeitig — welcher der beiden zuerst abbricht,
      // ist offen, entscheidend ist nur, dass einer von beiden es tut.
      expect(String(protokoll.fehler[0]?.daten.fehler)).toMatch(/timeout/i);
    } finally {
      await haeltDieSperre.query('ROLLBACK');
      haeltDieSperre.release();
    }
  }, 10_000);
});

/**
 * Begrenzung und Aufräumen greifen auf dieselben Zeilen zu — geprüft wird
 * das deshalb hier zusammen und nicht in zwei Dateien, die sich nie
 * begegnen. Genau daran ist es schon einmal vorbeigelaufen: Beide Seiten
 * waren für sich richtig, gemeinsam hob das Aufräumen die Begrenzung auf.
 */
describe('Begrenzung und Aufräumen zusammen', () => {
  it('überlebt das Aufräumen, das inzwischen gelaufen ist', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    // Drei Anforderungen in zwanzig Minuten — das Kontingent der Stunde.
    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));
    expect(mailer.versendet).toHaveLength(3);

    // Der Zeitgeber räumt alle fünfzehn Minuten auf. Nach einer halben Stunde
    // sind alle drei Links abgelaufen (sie gelten fünfzehn Minuten) — die
    // Begrenzung zählt aber noch eine ganze Stunde auf ihnen.
    const bilanz = await raeumeAuf(pool, new Date(start.getTime() + 30 * 60 * 1000));
    expect(bilanz.magicLinks).toBe(0);

    // Also bleibt es dabei: kein vierter Link innerhalb der Stunde.
    const nachDemAufraeumen = await fordere(mailer, new Date(start.getTime() + 35 * 60 * 1000));
    expect(nachDemAufraeumen).toBe(3);
  });

  it('räumt weg, sobald das Zählfenster vorbei ist', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);

    // Gut eine Stunde später zählt die Zeile nicht mehr — jetzt darf sie weg,
    // und die nächste Anforderung geht wieder durch.
    const spaeter = new Date(start.getTime() + 61 * 60 * 1000);
    const bilanz = await raeumeAuf(pool, spaeter);

    expect(bilanz.magicLinks).toBe(1);
    expect(await fordere(mailer, spaeter)).toBe(2);
  });
});
