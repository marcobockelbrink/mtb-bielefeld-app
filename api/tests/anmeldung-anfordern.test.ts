import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

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

    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(1);
    expect(mailer.versendet[0]?.an).toBe('malte@example.org');
    await app.close();
  });

  it('verbraucht den Code beim Anfordern nicht', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org', einladungscode: code },
      });
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

    expect(mitglied.statusCode).toBe(fremd.statusCode);
    expect(mitglied.body).toBe(fremd.body);
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
