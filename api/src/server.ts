/**
 * Startet die API. Alles Fachliche steht in `app.ts`.
 */

import { baueApp } from './app.ts';
import { raeumeAuf } from './aufraeumen.ts';
import { pool } from './datenbank.ts';
// Der echte Mailversand ist noch offen (siehe `mailer.ts`, Plan 4). Bis
// dahin scheitert ein Anmeldeversuch laut statt eine Mail vorzutäuschen,
// die nie ankommt.
import { NichtEingerichteterMailer } from './mailer.ts';

const port = Number(process.env.PORT ?? 3000);
const app = baueApp({ pool, mailer: new NichtEingerichteterMailer() });

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API hört auf Port ${port}`);
} catch (fehler) {
  console.error('API konnte nicht starten:', fehler);
  process.exit(1);
}

/**
 * Wie oft aufgeräumt wird.
 *
 * Fünfzehn Minuten sind die Lebensdauer eines Magic Links: Häufiger wäre
 * Arbeit ohne Ertrag, seltener ließe die Tabelle unnötig anwachsen.
 */
const AUFRAEUM_ABSTAND_MS = 15 * 60 * 1000;

const zeitgeber = setInterval(() => {
  void raeumeAuf(pool, new Date())
    .then((bilanz) => {
      if (bilanz.sitzungen > 0 || bilanz.magicLinks > 0 || bilanz.tourenanmeldungen > 0) {
        app.log.info(bilanz, 'aufgeräumt');
      }
    })
    // Aufräumen ist Hausarbeit: Sie darf scheitern, ohne den Betrieb zu
    // stören — aber nicht unbemerkt. Ein Error in einem anderen Feld als
    // `err` würde pino ohne eingetragenen Serialisierer als `{}` schreiben:
    // Meldung, Stapel und Ursache weg, der laute Fehler wieder still.
    // `baueApp` trägt den Serialisierer für `fehler` aber schon in diesen
    // Logger ein (siehe `protokoll.ts`), genau wie an jeder anderen
    // Aufrufstelle auch (etwa `anmeldung.ts`) — ein zusätzlicher Aufruf von
    // Hand wäre hier nur doppelt gemacht.
    .catch((fehler) => app.log.error({ fehler }, 'Aufräumen fehlgeschlagen'));
}, AUFRAEUM_ABSTAND_MS);

// Ohne das hält der Zeitgeber den Prozess am Leben und ein `docker stop`
// wartet, bis das Betriebssystem nachhilft.
zeitgeber.unref();
