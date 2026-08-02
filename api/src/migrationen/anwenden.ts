/** Migrationen von der Kommandozeile aus anwenden. */

import { pool } from '../datenbank.ts';
import { wendeMigrationenAn } from './laufen.ts';

const angewandt = await wendeMigrationenAn(pool);
console.log(
  angewandt.length > 0
    ? `Angewandt: ${angewandt.join(', ')}`
    : 'Nichts zu tun, alle Migrationen sind gelaufen.',
);
await pool.end();
