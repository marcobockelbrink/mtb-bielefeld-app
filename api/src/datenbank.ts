/**
 * Verbindung zur Datenbank.
 *
 * Die Adresse kommt ausschließlich aus der Umgebung — im Repository steht
 * kein Zugangsdatum, es ist öffentlich.
 */

import pg from 'pg';

const { Pool } = pg;

const adresse =
  process.env.DATABASE_URL ?? 'postgres://mtbie:entwicklung@127.0.0.1:5432/mtbie';

export const pool = new Pool({ connectionString: adresse });
