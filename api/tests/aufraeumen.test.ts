import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { raeumeAuf } from '../src/aufraeumen.ts';
import { pool } from '../src/datenbank.ts';
import { hashe } from '../src/token.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');
const gestern = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

/** Legt eine Sitzung mit frei wählbaren Fristen an. */
async function sitzung(
  mitgliedId: string,
  erneuerungBis: Date,
  ersetztAm: Date | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO sitzung
       (mitglied_id, zugang_hash, erneuerung_hash, zugang_bis, erneuerung_bis, ersetzt_am)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      mitgliedId,
      hashe(`zugang-${Math.random()}`),
      hashe(`erneuerung-${Math.random()}`),
      erneuerungBis,
      erneuerungBis,
      ersetztAm,
    ],
  );
}

async function magicLink(gueltigBis: Date): Promise<void> {
  await pool.query(
    `INSERT INTO magic_link (token_hash, email, gueltig_bis)
     VALUES ($1, 'malte@example.org', $2)`,
    [hashe(`link-${Math.random()}`), gueltigBis],
  );
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('raeumeAuf', () => {
  it('wirft abgelaufene Sitzungen weg', async () => {
    const id = await neuesMitglied();
    await sitzung(id, gestern, null);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(0);
  });

  it('lässt ersetzte, aber noch gültige Sitzungen stehen', async () => {
    // Der wichtigste Test dieser Datei: Genau an einer solchen Zeile
    // erkennt die Wiederverwendungserkennung ein kopiertes Token. Wer sie
    // wegräumt, macht aus einem Alarm ein stilles „gilt nicht".
    const id = await neuesMitglied();
    const morgen = new Date('2026-08-04T12:00:00Z');
    await sitzung(id, morgen, gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(0);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(1);
  });

  it('wirft abgelaufene Magic Links weg', async () => {
    await magicLink(gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(0);
  });

  it('lässt noch gültige Magic Links stehen', async () => {
    await magicLink(new Date('2026-08-03T12:10:00Z'));

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(0);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
  });

  it('meldet null, wenn es nichts zu tun gibt', async () => {
    expect(await raeumeAuf(pool, jetzt)).toEqual({ sitzungen: 0, magicLinks: 0 });
  });
});
