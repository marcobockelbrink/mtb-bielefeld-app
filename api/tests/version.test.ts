import { afterEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { liesFassung, vergleicheFassungen } from '../../src/domain/fassung.ts';
import { istZuAlt, liesAuskunft } from '../src/version.ts';

describe('liesFassung', () => {
  it('zerlegt eine Fassung in drei Zahlen', () => {
    expect(liesFassung('1.10.0')).toEqual([1, 10, 0]);
  });

  it('schneidet ein Anhängsel ab, statt es abzulehnen', () => {
    // Ein Vorabbau soll sich verhalten wie seine Fassung.
    expect(liesFassung('1.2.3-beta.4')).toEqual([1, 2, 3]);
  });

  it('lehnt alles ab, was keine drei Zahlen sind', () => {
    // Ein halb verstandener Wert wäre schlimmer als keiner: Er ergäbe
    // einen Vergleich, der irgendetwas liefert.
    for (const kaputt of ['1.2', 'v1.2.3', '', 'neueste', undefined, null]) {
      expect(liesFassung(kaputt)).toBeNull();
    }
  });
});

describe('vergleicheFassungen', () => {
  it('rechnet zahlweise und nicht als Zeichenkette', () => {
    // **Der Test, an dem solche Prüfungen sonst scheitern.** Als Text ist
    // "1.10.0" < "1.9.0" wahr — und zwar erst beim zehnten
    // Nebenversionssprung, wenn niemand mehr daran denkt.
    expect(vergleicheFassungen(liesFassung('1.10.0')!, liesFassung('1.9.0')!)).toBeGreaterThan(0);
  });

  it('nennt gleiche Fassungen gleich', () => {
    expect(vergleicheFassungen(liesFassung('0.12.4')!, liesFassung('0.12.4')!)).toBe(0);
  });

  it('vergleicht über alle drei Stellen', () => {
    expect(vergleicheFassungen(liesFassung('2.0.0')!, liesFassung('1.99.99')!)).toBeGreaterThan(0);
    expect(vergleicheFassungen(liesFassung('0.12.3')!, liesFassung('0.12.4')!)).toBeLessThan(0);
  });
});

describe('istZuAlt', () => {
  it('sperrt unterhalb der Mindestversion', () => {
    expect(istZuAlt('1.4.2', '1.5.0')).toBe(true);
  });

  it('lässt die Mindestversion selbst durch', () => {
    expect(istZuAlt('1.5.0', '1.5.0')).toBe(false);
    expect(istZuAlt('1.6.0', '1.5.0')).toBe(false);
  });

  it('lässt eine App ohne Versionskopf durch', () => {
    /**
     * **Tragend.** Ältere Fassungen kennen den Kopf gar nicht. Sie
     * auszusperren hieße, mit der Einführung dieser Prüfung rückwirkend
     * jede Fassung abzuschalten, die es vorher gab — genau die wahllose
     * Art zu töten, gegen die diese Datei argumentiert.
     */
    expect(istZuAlt(undefined, '1.5.0')).toBe(false);
    expect(istZuAlt('kaputt', '1.5.0')).toBe(false);
  });

  it('sperrt niemanden, solange keine Mindestversion gesetzt ist', () => {
    expect(istZuAlt('0.1.0', '0.0.0')).toBe(false);
  });
});

describe('liesAuskunft', () => {
  const gesichert = { ...process.env };
  afterEach(() => {
    process.env = { ...gesichert };
  });

  it('sperrt ohne Angabe niemanden aus', () => {
    // Die riskante Richtung braucht die ausdrückliche Angabe.
    delete process.env.MINDEST_APP_VERSION;
    expect(liesAuskunft('0.12.4').mindestVersion).toBe('0.0.0');
  });

  it('nimmt die Serverfassung als aktuelle, wenn nichts anderes dasteht', () => {
    delete process.env.AKTUELLE_APP_VERSION;
    expect(liesAuskunft('0.12.4').aktuelleVersion).toBe('0.12.4');
  });

  it('behandelt eine leere Variable wie eine fehlende', () => {
    /**
     * **Der Fall, den Compose herstellt.** `${MINDEST_APP_VERSION:-}`
     * reicht ohne Eintrag in der `.env` eine leere Zeichenkette durch,
     * kein `undefined` — `??` griffe dann nicht, und `/version` meldete
     * `mindestVersion: ""`.
     *
     * Gefährlich war das nicht (`liesFassung('')` ist `null`, es wird
     * niemand ausgesperrt), aber die Auskunft war Unsinn und der Kopf
     * `X-MTB-Version` leer. Bemerkt beim Messen gegen den ausgerollten
     * Server, nicht hier — deshalb steht der Fall jetzt hier.
     */
    process.env.MINDEST_APP_VERSION = '';
    process.env.AKTUELLE_APP_VERSION = '';

    const auskunft = liesAuskunft('0.12.4');
    expect(auskunft.mindestVersion).toBe('0.0.0');
    expect(auskunft.aktuelleVersion).toBe('0.12.4');
  });

  it('macht aus einem leeren Hinweis null', () => {
    process.env.APP_UPDATE_HINWEIS = '';
    expect(liesAuskunft('0.12.4').hinweis).toBeNull();
  });
});

describe('GET /version und die 426-Sperre', () => {
  const gesichert = { ...process.env };
  afterEach(() => {
    process.env = { ...gesichert };
  });

  it('gibt die Auskunft ohne Anmeldung heraus', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer() });
    const antwort = await app.inject({ method: 'GET', url: '/version' });

    expect(antwort.statusCode).toBe(200);
    expect(Object.keys(antwort.json()).sort()).toEqual([
      'aktuelleVersion',
      'hinweis',
      'mindestVersion',
    ]);
    await app.close();
  });

  it('weist eine zu alte App mit 426 ab', async () => {
    process.env.MINDEST_APP_VERSION = '1.5.0';
    const app = baueApp({ pool, mailer: new GemerkterMailer() });

    const antwort = await app.inject({
      method: 'GET',
      url: '/termine',
      headers: { 'x-app-version': '1.4.2' },
    });

    expect(antwort.statusCode).toBe(426);
    await app.close();
  });

  it('lässt /gesundheit und /version auch mit uralter App durch', async () => {
    /**
     * Sonst wäre es eine Tür, deren Schlüssel dahinter liegt: Die App
     * fragt nach der nötigen Fassung — und käme nicht heran, weil ihre
     * Fassung zu alt ist. Und der Wächter von außen schickt gar keinen
     * App-Kopf, verlöre die Überwachung aber genau dann, wenn eine
     * Anhebung ansteht.
     */
    process.env.MINDEST_APP_VERSION = '9.9.9';
    const app = baueApp({ pool, mailer: new GemerkterMailer() });

    for (const pfad of ['/version', '/gesundheit']) {
      const antwort = await app.inject({
        method: 'GET',
        url: pfad,
        headers: { 'x-app-version': '0.1.0' },
      });
      expect(antwort.statusCode).toBe(200);
    }
    await app.close();
  });

  it('legt die Mindestversion auf jede Antwort', async () => {
    // So merkt eine laufende App die Anhebung beim nächsten Aufruf und
    // muss nicht bis zum Neustart warten.
    process.env.MINDEST_APP_VERSION = '1.5.0';
    const app = baueApp({ pool, mailer: new GemerkterMailer() });

    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });
    expect(antwort.headers['x-mtb-version']).toBe('1.5.0');
    await app.close();
  });
});
