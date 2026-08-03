/**
 * Einstieg für den Betrieb: erst migrieren, dann starten.
 *
 * Getrennt von `server.ts`, das in der Entwicklung von Hand gestartet wird
 * und eine bereits migrierte Datenbank voraussetzt. Ein Container startet
 * dagegen jederzeit neu — er darf sich nicht darauf verlassen, dass jemand
 * vorher `npm run migrieren` getippt hat.
 *
 * Scheitern die Migrationen, endet der Prozess mit einem Fehler. Ein
 * Container, der mit halb migrierter Datenbank weiterläuft, wäre der
 * schlimmste Ausgang: Er antwortet auf Anfragen und macht dabei Falsches.
 */

import { pool } from './datenbank.ts';
import { wendeMigrationenAn } from './migrationen/laufen.ts';

const angewandt = await wendeMigrationenAn(pool);
console.log(
  angewandt.length > 0
    ? `Migrationen angewandt: ${angewandt.join(', ')}`
    : 'Migrationen: nichts zu tun.',
);

await import('./server.ts');
