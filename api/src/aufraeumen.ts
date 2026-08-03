/**
 * Aufräumen abgelaufener Zeilen — an einer Stelle, nicht in drei.
 *
 * `sitzung` und `magic_link` wachsen beide mit der Benutzung: Jede
 * Erneuerung legt eine Sitzungszeile an, jede Anforderung einen Magic Link.
 * Was nie abgeräumt wird, wächst — bei einem Gerät alle fünfzehn Minuten.
 *
 * Der erste Versuch hängte das Aufräumen an die Erneuerung. Das war
 * falsch: Die Erneuerung ist der Pfad, den jedes Gerät ständig geht, und
 * sie darf nicht davon abhängen, dass das Aufräumen gelingt. Deshalb steht
 * es hier für sich, wird vom Zeitgeber in `server.ts` angestoßen und lässt
 * sich mit `npm run aufraeumen` auch von Hand oder per cron auslösen.
 *
 * Diese Datei kennt kein Fastify und keinen Zeitgeber — sie ist reine
 * Rechenlogik und ohne laufenden Server prüfbar. Dasselbe Muster wie
 * `notifications/scheduler.ts` gegenüber `notifications/index.ts` in der App.
 */

import type pg from 'pg';

export interface Aufraeumbilanz {
  sitzungen: number;
  magicLinks: number;
}

/**
 * Räumt weg, was seine Frist überschritten hat.
 *
 * Die Grenze bei den Sitzungen ist `erneuerung_bis` und **nicht**
 * `ersetzt_am`: Eine ersetzte, aber noch nicht abgelaufene Zeile ist genau
 * das, woran die Wiederverwendungserkennung ein wiederaufgetauchtes Token
 * erkennt. Ist die Frist dagegen vorbei, würde das Token ohnehin abgelehnt
 * — die Zeile ist dann auch für die Erkennung wertlos.
 *
 * Bewusst zwei getrennte Anweisungen ohne Transaktion: Es gibt nichts, was
 * die beiden gemeinsam richtig oder falsch machen könnten, und ein Fehler
 * bei der einen soll die andere nicht verhindern.
 */
export async function raeumeAuf(pool: pg.Pool, jetzt: Date): Promise<Aufraeumbilanz> {
  const sitzungen = await pool.query('DELETE FROM sitzung WHERE erneuerung_bis < $1', [
    jetzt,
  ]);
  const magicLinks = await pool.query('DELETE FROM magic_link WHERE gueltig_bis < $1', [
    jetzt,
  ]);

  return {
    sitzungen: sitzungen.rowCount ?? 0,
    magicLinks: magicLinks.rowCount ?? 0,
  };
}
