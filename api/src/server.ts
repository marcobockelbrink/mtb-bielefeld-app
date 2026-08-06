/**
 * Startet die API. Alles Fachliche steht in `app.ts`.
 */

import { baueApp } from './app.ts';
import { raeumeAuf } from './aufraeumen.ts';
import { pool } from './datenbank.ts';
import { NichtEingerichteterMailer, waehleMailer } from './mailer.ts';

const port = Number(process.env.PORT ?? 3000);
const mailer = waehleMailer();
const app = baueApp({ pool, mailer });

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API hört auf Port ${port}`);
  console.log(
    mailer instanceof NichtEingerichteterMailer
      ? 'Mailversand: NICHT eingerichtet — Anmeldungen scheitern sichtbar.'
      : 'Mailversand: eingerichtet.',
  );
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
      if (
        bilanz.sitzungen > 0 ||
        bilanz.magicLinks > 0 ||
        bilanz.tourenanmeldungen > 0 ||
        bilanz.kinder > 0
      ) {
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

/**
 * Sauberes Herunterfahren bei SIGTERM und SIGINT.
 *
 * Node läuft im Container als PID 1. Für PID 1 überspringt der Kernel die
 * Standardaktion eines Signals, wenn kein Handler registriert ist — ohne
 * diesen Handler würde SIGTERM (das Signal, das `docker stop` schickt)
 * stillschweigend verworfen. `docker stop` wartet dann die vollen zehn
 * Sekunden Kulanzfrist ab und schießt danach mit SIGKILL hart ab, ohne dass
 * Server oder Verbindungspool je Gelegenheit bekommen, sich zu melden.
 * SIGINT kommt zusätzlich dazu, weil es in der Entwicklung per Ctrl-C
 * ausgelöst wird und dasselbe geordnete Herunterfahren verdient.
 */
const HERUNTERFAHR_ZEITSCHRANKE_MS = 5_000;

let faehrtHerunter = false;

async function fahreHerunter(signal: NodeJS.Signals): Promise<void> {
  // Ein zweites Signal während des Herunterfahrens (etwa ein ungeduldiges
  // zweites Ctrl-C) soll nicht zwei parallele Abläufe anstoßen.
  if (faehrtHerunter) return;
  faehrtHerunter = true;
  console.log(`${signal} empfangen, fahre herunter…`);

  // Notbremse: Hängt `app.close()` oder `pool.end()` (etwa weil eine
  // Verbindung nicht sauber freigegeben wird), soll der Prozess trotzdem
  // enden, statt unbegrenzt zu warten und `docker stop` doch wieder auf
  // SIGKILL zurückfallen zu lassen.
  const notbremse = setTimeout(() => {
    console.error('Herunterfahren hängt, breche nach Zeitschranke hart ab.');
    process.exit(1);
  }, HERUNTERFAHR_ZEITSCHRANKE_MS);

  try {
    clearInterval(zeitgeber);
    await app.close();
    await pool.end();
    clearTimeout(notbremse);
    process.exit(0);
  } catch (fehler) {
    console.error('Fehler beim Herunterfahren:', fehler);
    process.exit(1);
  }
}

process.on('SIGTERM', fahreHerunter);
process.on('SIGINT', fahreHerunter);
