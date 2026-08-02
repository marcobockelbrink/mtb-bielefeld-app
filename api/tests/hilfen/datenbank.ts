/**
 * Eine migrierte, leere Datenbank für jeden Test.
 *
 * Bewusst gegen ein echtes Postgres statt gegen eine Attrappe: Eindeutige
 * Indizes, Prüfbedingungen und Transaktionen sind genau die Dinge, an denen
 * dieser Code hängt — eine Attrappe würde sie alle wegtäuschen.
 */

import type pg from 'pg';

import { pool } from '../../src/datenbank.ts';
import { wendeMigrationenAn } from '../../src/migrationen/laufen.ts';

export async function frischeDatenbank(): Promise<pg.Pool> {
  await wendeMigrationenAn(pool);
  await pool.query('TRUNCATE einladung, mitglied RESTART IDENTITY CASCADE');
  return pool;
}
