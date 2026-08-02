import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function angemeldetesMitglied() {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  const id = rows[0]!.id;
  const token = await legeSitzungAn(pool, id, jetzt);
  return { id, ...token };
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /konto', () => {
  it('sagt, was gespeichert ist', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ email: 'malte@example.org', rolle: 'mitglied' });
    await app.close();
  });

  it('lehnt ohne Token mit 401 ab', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const antwort = await app.inject({ method: 'GET', url: '/konto' });

    expect(antwort.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /konto', () => {
  it('löscht Mitglied und Sitzungen', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(204);

    const { rows: mitglieder } = await pool.query('SELECT id FROM mitglied');
    expect(mitglieder).toHaveLength(0);

    const { rows: sitzungen } = await pool.query('SELECT id FROM sitzung');
    expect(sitzungen).toHaveLength(0);
    await app.close();
  });

  it('macht den Zugang sofort ungültig', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const danach = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });
    expect(danach.statusCode).toBe(401);
    await app.close();
  });
});
