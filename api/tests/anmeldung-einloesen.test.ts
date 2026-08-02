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

/** Zieht den Token aus der zuletzt gemerkten Mail. */
function letzterToken(mailer: GemerkterMailer): string {
  const text = mailer.versendet[mailer.versendet.length - 1]?.text ?? '';
  return text.split('/anmeldung/')[1]?.split(/\s/)[0] ?? '';
}

/** Fordert einen Link mit frischem Einladungscode an. */
async function holeToken(mailer: GemerkterMailer, app: ReturnType<typeof baueApp>) {
  const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
  await app.inject({
    method: 'POST',
    url: '/anmeldung/anfordern',
    payload: { email: 'malte@example.org', einladungscode: code },
  });
  return letzterToken(mailer);
}

/** Fordert einen Link ohne Code an — nur für bestehende Mitglieder. */
async function holeTokenOhneCode(
  mailer: GemerkterMailer,
  app: ReturnType<typeof baueApp>,
) {
  await app.inject({
    method: 'POST',
    url: '/anmeldung/anfordern',
    payload: { email: 'malte@example.org' },
  });
  return letzterToken(mailer);
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

  it('entwertet die Einladung erst hier und schreibt das neue Mitglied hinein', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    await app.inject({ method: 'POST', url: '/anmeldung/einloesen', payload: { token } });

    const { rows } = await pool.query<{
      eingeloest_am: Date | null;
      eingeloest_von: string | null;
    }>('SELECT eingeloest_am, eingeloest_von FROM einladung');
    const { rows: mitglieder } = await pool.query<{ id: string }>(
      'SELECT id FROM mitglied',
    );

    expect(rows[0]?.eingeloest_am?.getTime()).toBe(jetzt.getTime());
    // Zum bisherigen Entwertungszeitpunkt gab es noch kein Mitglied; das
    // Feld war deshalb zwangsläufig immer NULL.
    expect(rows[0]?.eingeloest_von).toBe(mitglieder[0]?.id);
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

  it('lässt nach einem abgelaufenen Link einen neuen zu — der Code lebt noch', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);

    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });

    // Eine Stunde später: Der erste Link ist tot, der Code nicht.
    const spaeter = baueApp({
      pool,
      mailer,
      jetzt: () => new Date(jetzt.getTime() + 60 * 60 * 1000),
    });
    await spaeter.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    const antwort = await spaeter.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token: letzterToken(mailer) },
    });

    expect(antwort.statusCode).toBe(200);
    await app.close();
    await spaeter.close();
  });

  it('lässt ein zweites Gerät zu, ohne dass der Code noch gebraucht wird', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });

    const erstes = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token: await holeToken(mailer, app) },
    });
    const zweites = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token: await holeTokenOhneCode(mailer, app) },
    });

    expect(zweites.statusCode).toBe(200);
    // Beide Geräte sind angemeldet, es gibt weiterhin genau ein Mitglied.
    expect(await pruefeZugang(pool, erstes.json().zugang, jetzt)).not.toBeNull();
    expect(await pruefeZugang(pool, zweites.json().zugang, jetzt)).not.toBeNull();
    const { rows } = await pool.query('SELECT id FROM mitglied');
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('lässt nach dem Abmelden ein Wiederanmelden zu', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const erste = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token: await holeToken(mailer, app) },
    });

    await app.inject({
      method: 'DELETE',
      url: '/sitzung',
      payload: { erneuerung: erste.json().erneuerung },
    });

    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token: await holeTokenOhneCode(mailer, app) },
    });
    expect(zweite.statusCode).toBe(200);
    await app.close();
  });

  it('legt ohne Einladung kein Mitglied an', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    // Ein Link, dessen Mitglied zwischen Anfordern und Einlösen verschwunden
    // ist: Ohne Eintrittskarte darf daraus kein neues Konto entstehen.
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    const token = await holeTokenOhneCode(mailer, app);
    await pool.query('DELETE FROM mitglied');

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(antwort.statusCode).toBe(401);
    const { rows } = await pool.query('SELECT id FROM mitglied');
    expect(rows).toHaveLength(0);
    await app.close();
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
