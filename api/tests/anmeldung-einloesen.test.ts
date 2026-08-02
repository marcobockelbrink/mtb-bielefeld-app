import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { pruefeZugang } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

/** Fordert einen Link an und zieht den Token aus der gemerkten Mail. */
async function holeToken(mailer: GemerkterMailer, app: ReturnType<typeof baueApp>) {
  const code = await erzeugeEinladung(pool, 'malte@example.org');
  await app.inject({
    method: 'POST',
    url: '/anmeldung/anfordern',
    payload: { email: 'malte@example.org', einladungscode: code },
  });
  const text = mailer.versendet[0]?.text ?? '';
  return text.split('/anmeldung/')[1]?.split(/\s/)[0] ?? '';
}

describe('POST /anmeldung/einloesen', () => {
  it('gibt zwei Token zurück und legt das Mitglied an', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(antwort.statusCode).toBe(200);
    const koerper = antwort.json();
    expect(typeof koerper.zugang).toBe('string');
    expect(typeof koerper.erneuerung).toBe('string');

    const { rows } = await pool.query('SELECT email FROM mitglied');
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('lässt denselben Link kein zweites Mal zu', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    await app.inject({ method: 'POST', url: '/anmeldung/einloesen', payload: { token } });
    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(zweite.statusCode).toBe(401);
    await app.close();
  });

  it('lehnt einen abgelaufenen Link ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const spaeter = baueApp({
      pool,
      mailer,
      jetzt: () => new Date(jetzt.getTime() + 16 * 60 * 1000),
    });
    const antwort = await spaeter.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(antwort.statusCode).toBe(401);
    await app.close();
    await spaeter.close();
  });

  it('das Zugangs-Token weist danach das Mitglied aus', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });
    const { zugang } = antwort.json();

    const wer = await pruefeZugang(pool, zugang, jetzt);
    expect(wer?.rolle).toBe('mitglied');
    await app.close();
  });
});
