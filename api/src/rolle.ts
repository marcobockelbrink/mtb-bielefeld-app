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

/**
 * Verwaltung erbt die Guide-Rechte — Marcos Entscheidung vom 13.08.2026.
 *
 * Statt einer zweiten Rolle am selben Konto gilt: Verwaltung ⊇ Guide ⊇
 * Mitglied. Im Verein sind die Verwaltenden dieselben aktiven Leute, die
 * Trainings leiten; ein Konto, das verwalten darf, aber kein Training
 * anlegen kann, wäre eine Hürde ohne Schutzwirkung — die Verwaltung
 * könnte sich die Guide-Rolle ja selbst geben.
 */
export function hatGuideRechte(rolle: string): boolean {
  return rolle === 'guide' || rolle === 'verwaltung';
}

/**
 * Darf jemand Jugendtrainings leiten?
 *
 * Guide-Rechte **oder** das Jugend-Guide-Häkchen — und die Verwaltung erbt
 * auch hier, wie überall. Ein reiner Jugend-Guide führt keine Touren und
 * braucht dafür keine Guide-Rolle; umgekehrt soll ein Touren-Guide nicht
 * ausgesperrt sein, nur weil ihm jemand das Häkchen nicht gesetzt hat.
 */
export function hatJugendGuideRechte(rolle: string, jugendGuide: boolean): boolean {
  return hatGuideRechte(rolle) || jugendGuide;
}
