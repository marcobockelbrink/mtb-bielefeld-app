/**
 * Kommandozeilenwerkzeug: legt Einladungscodes an.
 *
 * `erzeugeEinladung` gibt es als Bibliotheksfunktion schon seit der ersten
 * Aufgabe — aber ohne ein Werkzeug, das sie aufruft, kommt niemand in die
 * App: Ein Code entsteht nie von selbst, jemand aus der Verwaltung muss ihn
 * an ein Mitglied ausgeben.
 *
 * Nimmt eine oder mehrere E-Mail-Adressen entgegen (die Adressen, für die
 * die Mitgliederliste bereits Mitgliedschaften ausweist) und gibt zu jeder
 * einen frischen Code im Klartext aus. Das ist die **einzige** Gelegenheit,
 * ihn zu sehen — in der Datenbank steht danach nur der Hash (token.ts), wie
 * bei jedem anderen Token dieser App.
 *
 * Aufruf:
 *   npm run einladung:erzeugen -- anna@example.org paul@example.org
 */

import { pool } from './datenbank.ts';
import { erzeugeEinladung } from './einladung.ts';

const adressen = process.argv.slice(2);

if (adressen.length === 0) {
  console.error('Mindestens eine E-Mail-Adresse angeben, zum Beispiel:');
  console.error('  npm run einladung:erzeugen -- anna@example.org');
  process.exit(1);
}

const ungueltig = adressen.filter((adresse) => !adresse.includes('@'));
if (ungueltig.length > 0) {
  console.error(`Keine gültigen E-Mail-Adressen: ${ungueltig.join(', ')}`);
  process.exit(1);
}

const jetzt = new Date();

for (const adresse of adressen) {
  const code = await erzeugeEinladung(pool, adresse, jetzt);
  console.log(`${adresse}: ${code}`);
}

console.log();
console.log(
  'Achtung: Diese Codes werden nur jetzt im Klartext angezeigt. In der ' +
    'Datenbank steht nur ihr Hash — verloren ist verloren, dann hilft nur ' +
    'ein neuer Code.',
);

await pool.end();
