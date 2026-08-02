/**
 * Wendet Migrationen genau einmal an.
 *
 * Bewusst ohne Fremdpaket: Nummerierte SQL-Dateien und eine Tabelle, die
 * sich merkt, was gelaufen ist. Vierzig Zeilen, die jeder lesen kann, sind
 * einer Abhängigkeit vorzuziehen, die niemand versteht.
 *
 * Jede Migration läuft in einer eigenen Transaktion: Bricht sie ab, ist sie
 * gar nicht gelaufen — kein halb migrierter Zustand.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const ordner = path.dirname(fileURLToPath(import.meta.url));

export async function wendeMigrationenAn(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migration (
      name        text PRIMARY KEY,
      gelaufen_am timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dateien = (await fs.readdir(ordner))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM migration');
  const erledigt = new Set(rows.map((zeile) => zeile.name));

  const angewandt: string[] = [];

  for (const datei of dateien) {
    if (erledigt.has(datei)) continue;

    const sql = await fs.readFile(path.join(ordner, datei), 'utf8');
    const verbindung = await pool.connect();
    try {
      await verbindung.query('BEGIN');
      await verbindung.query(sql);
      await verbindung.query('INSERT INTO migration (name) VALUES ($1)', [datei]);
      await verbindung.query('COMMIT');
      angewandt.push(datei);
    } catch (fehler) {
      await verbindung.query('ROLLBACK');
      throw new Error(`Migration ${datei} fehlgeschlagen: ${String(fehler)}`);
    } finally {
      verbindung.release();
    }
  }

  return angewandt;
}
