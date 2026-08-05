/**
 * Kommandozeilenwerkzeug: setzt die Rolle eines Mitglieds.
 *
 * Aufruf:
 *   npm run rolle:setzen -- anna@example.org guide
 *
 * Auf dem Server:
 *   docker compose -f betrieb/docker-compose.yml exec api \
 *     npm run rolle:setzen -- anna@example.org guide
 *
 * Nur wer schon ein Konto hat, kann eine Rolle bekommen — die Adresse muss
 * also vorher einen Einladungscode eingelöst haben. Andernfalls hätte man
 * Rollen für Menschen, die es in der Datenbank nicht gibt.
 */

import { pool } from './datenbank.ts';
import { setzeRolle, type Rolle } from './rolle.ts';

const ERLAUBT: Rolle[] = ['mitglied', 'guide', 'verwaltung'];

const [email, rolle] = process.argv.slice(2);

if (!email || !rolle) {
  console.error('Adresse und Rolle angeben, zum Beispiel:');
  console.error('  npm run rolle:setzen -- anna@example.org guide');
  console.error(`Erlaubte Rollen: ${ERLAUBT.join(', ')}`);
  process.exit(1);
}

if (!ERLAUBT.includes(rolle as Rolle)) {
  console.error(`„${rolle}" ist keine Rolle. Erlaubt: ${ERLAUBT.join(', ')}`);
  process.exit(1);
}

const gefunden = await setzeRolle(pool, email, rolle as Rolle);
await pool.end();

if (!gefunden) {
  console.error(
    `Kein Mitglied mit der Adresse ${email}. Wer noch nie einen ` +
      'Einladungscode eingelöst hat, steht auch nicht in der Datenbank.',
  );
  process.exit(1);
}

console.log(`${email} ist jetzt: ${rolle}`);
