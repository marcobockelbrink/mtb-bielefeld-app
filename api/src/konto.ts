/**
 * Auskunft und Löschung.
 *
 * Beides ist Pflicht, nicht Kür: Die DSGVO verlangt Auskunft (Art. 15) und
 * Löschung (Art. 17), und Apple gibt eine App mit Registrierung nur frei,
 * wenn sich das Konto **in der App** löschen lässt.
 *
 * Gelöscht wird wirklich, nicht als gelöscht markiert. Die Sitzungen gehen
 * über `ON DELETE CASCADE` mit.
 */

import type pg from 'pg';

export interface KontoAuskunft {
  email: string;
  rolle: string;
  angelegtAm: Date;
  sitzungen: number;
}

export async function holeKontoAuskunft(
  pool: pg.Pool,
  mitgliedId: string,
): Promise<KontoAuskunft | null> {
  const { rows } = await pool.query<{
    email: string;
    rolle: string;
    angelegt_am: Date;
    sitzungen: string;
  }>(
    `SELECT m.email, m.rolle, m.angelegt_am,
            (SELECT count(*) FROM sitzung s WHERE s.mitglied_id = m.id) AS sitzungen
       FROM mitglied m WHERE m.id = $1`,
    [mitgliedId],
  );

  const zeile = rows[0];
  if (!zeile) return null;

  return {
    email: zeile.email,
    rolle: zeile.rolle,
    angelegtAm: zeile.angelegt_am,
    sitzungen: Number(zeile.sitzungen),
  };
}

export async function loescheKonto(pool: pg.Pool, mitgliedId: string): Promise<void> {
  await pool.query('DELETE FROM mitglied WHERE id = $1', [mitgliedId]);
}
