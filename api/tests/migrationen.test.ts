import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { wendeMigrationenAn } from '../src/migrationen/laufen.ts';
import { sichereEntwicklungsdatenbank } from './hilfen/datenbank.ts';

describe('Migrationen', () => {
  beforeAll(async () => {
    // Das Postgres der Entwicklungsumgebung liegt auf einem dauerhaften
    // Docker-Volume. Ohne diesen Rücksetzer blieben Migrationen aus
    // früheren Testläufen bereits vermerkt, und die Tests unten prüften
    // nicht mehr das Verhalten, sondern nur den Zufall der Umgebung. Das
    // ganze Schema neu aufzusetzen ist der einzig sichere Weg: Spätere
    // Migrationen (z. B. einladung) halten Fremdschlüssel auf mitglied und
    // lassen sich nicht mehr einzeln und in beliebiger Reihenfolge löschen.
    // `wendeMigrationenAn` baut danach alles wieder von Grund auf auf.
    //
    // Vor dem Löschen wird geprüft, dass die Verbindung wirklich auf die
    // lokale Entwicklungsdatenbank zeigt — DROP SCHEMA ist unwiderruflich,
    // und wohin es trifft, entscheidet allein DATABASE_URL.
    await sichereEntwicklungsdatenbank(pool);
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
  });

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
