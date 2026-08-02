import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /anmeldung/anfordern', () => {
  it('verschickt bei gültigem Code eine Mail mit Link', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });
    const code = await erzeugeEinladung(pool, 'malte@example.org');

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

  it('antwortet bei falschem Code genauso, verschickt aber nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });

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
    const app = baueApp({ pool, mailer });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });

    const text = JSON.stringify(antwort.json());
    expect(text).not.toMatch(/unbekannt|verbraucht|abgelaufen/);
    await app.close();
  });

  it('weist eine fehlende E-Mail mit 400 ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { einladungscode: 'egal' },
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });
});
