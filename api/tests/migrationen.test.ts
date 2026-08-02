import { afterAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { wendeMigrationenAn } from '../src/migrationen/laufen.ts';

describe('Migrationen', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('legt die Tabellen an und merkt sich, was gelaufen ist', async () => {
    const ersterLauf = await wendeMigrationenAn(pool);
    expect(ersterLauf).toContain('001-mitglied.sql');

    const { rows } = await pool.query(
      "SELECT to_regclass('public.mitglied') AS tabelle",
    );
    expect(rows[0]?.tabelle).toBe('mitglied');
  });

  it('wendet dieselbe Migration kein zweites Mal an', async () => {
    await wendeMigrationenAn(pool);
    const zweiterLauf = await wendeMigrationenAn(pool);
    expect(zweiterLauf).toEqual([]);
  });
});
