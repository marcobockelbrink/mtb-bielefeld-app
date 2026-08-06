import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer, type Mailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');

function bauen(mailer: Mailer = new GemerkterMailer()) {
  return baueApp({ pool, mailer, jetzt: () => jetzt });
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

/** Legt über die API ein Training im Entwurf an und gibt dessen Körper zurück. */
async function trainingAnlegen(
  app: ReturnType<typeof baueApp>,
  guideZugang: string,
  ueberschreibungen: Record<string, unknown> = {},
) {
  const antwort = await app.inject({
    method: 'POST',
    url: '/jugendtraining',
    headers: { authorization: `Bearer ${guideZugang}` },
    payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz', ...ueberschreibungen },
  });
  return antwort.json();
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('Ohne Anmeldung', () => {
  it('antwortet auf einen Guide-Weg mit 401, nicht mit 403', async () => {
    // Beides mit „Das dürfen nur Guides" zu beantworten schickte Leute in
    // die falsche Richtung: Wer nicht angemeldet ist, soll sich anmelden;
    // wer angemeldet und kein Guide ist, braucht jemanden, der ihm die Rolle
    // gibt. Anmelden hilft ihm nicht.
    const app = bauen();
    const antwort = await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      payload: { beginntAm: '2026-09-01T08:30:00Z', ort: 'X' },
    });
    expect(antwort.statusCode).toBe(401);
    expect(antwort.json().fehler).toBe('Nicht angemeldet.');
  });
});

describe('POST /jugendtraining', () => {
  it('weist einen Nicht-Guide beim Anlegen mit 403 ab — die Rolle entscheidet, nicht die Anmeldung', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      headers: { authorization: `Bearer ${zugang}` },
      payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz' },
    });

    expect(antwort.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /jugendtraining/:id', () => {
  it('zeigt Entwürfe nur Guides — für andere ist es ein 404', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');
    const training = await trainingAnlegen(app, guideZugang);

    const alsMitglied = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });
    const alsGuide = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    // Ein 404 verrät die Existenz des Entwurfs nicht — ein anderer Code
    // (etwa 403) würde einem Nicht-Guide bestätigen, dass es ihn gibt.
    expect(alsMitglied.statusCode).toBe(404);
    expect(alsGuide.statusCode).toBe(200);
    await app.close();
  });

  it('gibt einem Mitglied keine Guide-Liste heraus', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');
    const training = await trainingAnlegen(app, guideZugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    const alsMitglied = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });
    const alsGuide = await app.inject({
      method: 'GET',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });

    // Wer nur Mitglied ist, bekommt das Feld gar nicht erst — nicht etwa
    // eine leere Liste, die dieselbe Auskunft anders verpackt wäre.
    expect(alsMitglied.json().guides).toBeUndefined();
    expect(alsGuide.json().guides).toBeDefined();
    await app.close();
  });
});

describe('POST /jugendtraining/:id/absage', () => {
  it('verlangt beim Absagen einen Grund', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await trainingAnlegen(app, guideZugang);

    const antwort = await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/absage`,
      headers: { authorization: `Bearer ${guideZugang}` },
      payload: {},
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /jugendtraining/:id/veroeffentlichen', () => {
  it('lehnt ein zweites Veröffentlichen mit 409 ab', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await trainingAnlegen(app, guideZugang);
    const veroeffentlichen = {
      method: 'POST' as const,
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    };

    const erste = await app.inject(veroeffentlichen);
    const zweite = await app.inject(veroeffentlichen);

    expect(erste.statusCode).toBe(200);
    expect(zweite.statusCode).toBe(409);
    await app.close();
  });
});

describe('DELETE /jugendtraining/:id/kinder/:kindId', () => {
  it('meldet ein fremdes Kind mit 404 ab, nicht mit 403', async () => {
    const app = bauen();
    const { zugang: guideZugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: elternZugangA } = await mitgliedMitToken('elternA@example.org');
    const { zugang: elternZugangB } = await mitgliedMitToken('elternB@example.org');
    const training = await trainingAnlegen(app, guideZugang);
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guideZugang}` },
    });
    const anmeldung = await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/kinder`,
      headers: { authorization: `Bearer ${elternZugangA}` },
      payload: { vorname: 'Finn', nachname: 'Meyer' },
    });
    const kindId = anmeldung.json().kindId;

    // "Gibt es nicht" und "gehört dir nicht" dürfen sich für den
    // Anfragenden nicht unterscheiden — deshalb 404 statt 403.
    const antwort = await app.inject({
      method: 'DELETE',
      url: `/jugendtraining/${training.id}/kinder/${kindId}`,
      headers: { authorization: `Bearer ${elternZugangB}` },
    });

    expect(antwort.statusCode).toBe(404);
    await app.close();
  });
});
