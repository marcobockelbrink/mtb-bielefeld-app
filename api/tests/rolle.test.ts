import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { setzeRolle } from '../src/rolle.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

async function legeMitgliedAn(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  return rows[0]!.id;
}

describe('setzeRolle', () => {
  it('setzt die Rolle eines vorhandenen Mitglieds', async () => {
    await legeMitgliedAn('anna@example.org');

    expect(await setzeRolle(pool, 'anna@example.org', 'guide')).toBe(true);

    const { rows } = await pool.query<{ rolle: string }>(
      'SELECT rolle FROM mitglied WHERE email = $1',
      ['anna@example.org'],
    );
    expect(rows[0]?.rolle).toBe('guide');
  });

  it('findet die Adresse unabhängig von Groß- und Kleinschreibung', async () => {
    // Sonst legt jemand „Anna@…" an und wundert sich, warum „anna@…" nichts
    // findet — der eindeutige Index auf `lower(email)` verhindert genau das
    // an anderer Stelle schon.
    await legeMitgliedAn('anna@example.org');
    expect(await setzeRolle(pool, 'ANNA@Example.ORG', 'guide')).toBe(true);
  });

  it('meldet false statt zu scheitern, wenn es die Adresse nicht gibt', async () => {
    // Kein Wurf: Das Werkzeug soll dem Aufrufer sagen können, dass nichts
    // passiert ist, ohne dass er eine Ausnahme fangen muss.
    expect(await setzeRolle(pool, 'gibtsnicht@example.org', 'guide')).toBe(false);
  });
});
