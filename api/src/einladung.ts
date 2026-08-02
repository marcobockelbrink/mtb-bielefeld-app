/**
 * Einladungscodes — der Nachweis, dass jemand Mitglied ist.
 *
 * Eine E-Mail-Adresse beweist nichts. Die Verwaltung führt ohnehin eine
 * Mitgliederliste; daraus entstehen diese Codes. Wer austritt, bekommt
 * keinen neuen — der Zugang endet mit der Mitgliedschaft, ohne dass jemand
 * eine zweite Liste pflegen muss.
 */

import type pg from 'pg';

import { erzeugeToken, hashe } from './token.ts';

/** Wie lange ein ausgestellter Code brauchbar bleibt. */
const GUELTIG_TAGE = 60;

export type Einloesung =
  | { ok: true }
  | { ok: false; grund: 'unbekannt' | 'verbraucht' | 'abgelaufen' | 'falsche-adresse' };

/** Legt einen Code an und gibt ihn **einmalig** im Klartext zurück. */
export async function erzeugeEinladung(
  pool: pg.Pool,
  ausgestelltFuer: string,
): Promise<string> {
  const code = erzeugeToken();
  const gueltigBis = new Date(Date.now() + GUELTIG_TAGE * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO einladung (code_hash, ausgestellt_fuer, gueltig_bis)
     VALUES ($1, $2, $3)`,
    [hashe(code), ausgestelltFuer, gueltigBis],
  );

  return code;
}

/**
 * Prüft einen Code gegen die hinterlegte Adresse und entwertet ihn.
 *
 * Ein Code gilt nur für die Adresse, für die er ausgestellt wurde — sonst
 * würde ein weitergereichter Code (Screenshot, weitergeleitete Mail)
 * Vereinsfremden ein Konto verschaffen und der Nachweis der Mitgliedschaft
 * wäre wertlos. Verglichen wird ohne Rücksicht auf Groß- und
 * Kleinschreibung, wie beim eindeutigen Index auf `lower(email)` in
 * `mitglied` (001-mitglied.sql).
 *
 * Bei falscher Adresse wird der Code **nicht** verbraucht: Sonst könnte ein
 * Fremder mit einem einzigen falschen Versuch den Zugang des Mitglieds
 * zerstören, ohne selbst hineinzukommen.
 *
 * Der Grund wird zurückgegeben, aber **nicht nach außen weitergereicht** —
 * die API antwortet immer gleich. Er dient dem Protokoll und den Tests.
 */
export async function loeseEinladungEin(
  pool: pg.Pool,
  code: string,
  email: string,
  jetzt: Date,
): Promise<Einloesung> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    // FOR UPDATE: Zwei gleichzeitige Einlösungen desselben Codes sollen
    // nicht beide durchgehen. Die Adresse wird innerhalb derselben
    // Transaktion und hinter demselben Lock geprüft, damit zwischen Prüfung
    // und Entwertung keine Lücke entsteht.
    const { rows } = await verbindung.query<{
      id: string;
      ausgestellt_fuer: string;
      gueltig_bis: Date;
      eingeloest_am: Date | null;
    }>(
      `SELECT id, ausgestellt_fuer, gueltig_bis, eingeloest_am FROM einladung
       WHERE code_hash = $1 FOR UPDATE`,
      [hashe(code)],
    );

    const eintrag = rows[0];
    if (!eintrag) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'unbekannt' };
    }
    if (eintrag.ausgestellt_fuer.toLowerCase() !== email.toLowerCase()) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'falsche-adresse' };
    }
    if (eintrag.eingeloest_am !== null) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'verbraucht' };
    }
    if (eintrag.gueltig_bis.getTime() < jetzt.getTime()) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'abgelaufen' };
    }

    await verbindung.query('UPDATE einladung SET eingeloest_am = $2 WHERE id = $1', [
      eintrag.id,
      jetzt,
    ]);
    await verbindung.query('COMMIT');
    return { ok: true };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}
