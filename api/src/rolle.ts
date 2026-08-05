/**
 * Die Rolle eines Mitglieds setzen.
 *
 * `mitglied.rolle` gibt es seit der ersten Migration, aber bisher konnte sie
 * niemand ändern — sie stand auf `mitglied` und blieb dort. Mit den
 * Jugendtrainings braucht es Guides, und jemand muss sie ernennen können.
 *
 * Bewusst ohne Oberfläche: Ein Verein mit einer Handvoll Guides braucht keine
 * Benutzerverwaltung. Kommt er je auf fünfzig, ist das der Zeitpunkt, es zu
 * überdenken — nicht vorher.
 */

import type pg from 'pg';

export type Rolle = 'mitglied' | 'guide' | 'verwaltung';

/** `false`, wenn es die Adresse nicht gibt. */
export async function setzeRolle(
  ausfuehrer: pg.Pool | pg.PoolClient,
  email: string,
  rolle: Rolle,
): Promise<boolean> {
  const { rowCount } = await ausfuehrer.query(
    'UPDATE mitglied SET rolle = $2 WHERE lower(email) = lower($1)',
    [email, rolle],
  );
  return (rowCount ?? 0) > 0;
}
