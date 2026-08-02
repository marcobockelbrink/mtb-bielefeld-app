import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import {
  erzeugeEinladung,
  pruefeEinladung,
  verbraucheEinladung,
} from '../src/einladung.ts';
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

  it('lässt zu der Adresse nichts mehr auffindbar zurück', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    // Die Adresse steht in drei Tabellen. ON DELETE CASCADE erwischt nur
    // die Sitzungen — die anderen beiden müssen von Hand aufgeräumt werden.
    const { rows: treffer } = await pool.query<{ tabelle: string }>(
      `SELECT 'mitglied' AS tabelle FROM mitglied
        WHERE lower(email) = lower($1)
       UNION ALL
       SELECT 'magic_link' FROM magic_link WHERE lower(email) = lower($1)
       UNION ALL
       SELECT 'einladung' FROM einladung
        WHERE lower(ausgestellt_fuer) = lower($1)`,
      ['malte@example.org'],
    );
    expect(treffer).toEqual([]);
    await app.close();
  });

  it('behält die Einladungszeile, ohne die Adresse zu behalten', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const { id, zugang } = await angemeldetesMitglied();
    const verbindung = await pool.connect();
    try {
      const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
      if (!pruefung.ok) throw new Error('Vorbedingung nicht erfüllt');
      await verbraucheEinladung(verbindung, pruefung.einladungId, id, jetzt);
    } finally {
      verbindung.release();
    }

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    // Der Verein soll sehen, dass ein Code ausgestellt und eingelöst wurde
    // — die Person dahinter geht ihn nichts mehr an.
    const { rows } = await pool.query<{
      ausgestellt_fuer: string | null;
      eingeloest_am: Date | null;
      eingeloest_von: string | null;
    }>('SELECT ausgestellt_fuer, eingeloest_am, eingeloest_von FROM einladung');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ausgestellt_fuer).toBeNull();
    expect(rows[0]?.eingeloest_am).not.toBeNull();
    expect(rows[0]?.eingeloest_von).toBeNull();
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
