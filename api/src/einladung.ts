/**
 * Einladungscodes — der Nachweis, dass jemand Mitglied ist.
 *
 * Eine E-Mail-Adresse beweist nichts. Die Verwaltung führt ohnehin eine
 * Mitgliederliste; daraus entstehen diese Codes. Wer austritt, bekommt
 * keinen neuen — der Zugang endet mit der Mitgliedschaft, ohne dass jemand
 * eine zweite Liste pflegen muss.
 *
 * Ein Code ist eine **einmalige Eintrittskarte**: Er verschafft genau ein
 * Mitgliedskonto. Danach ist er verbraucht — nicht, weil jemand einen Link
 * angefordert hat, sondern weil das Konto entstanden ist. Deshalb sind
 * Prüfen (`pruefeEinladung`, beim Anfordern) und Entwerten
 * (`verbraucheEinladung`, beim Einlösen) getrennt. Wären sie es nicht,
 * würde ein nie angetippter Link die Eintrittskarte vernichten und das
 * Mitglied dauerhaft aussperren.
 */

import type pg from 'pg';

import { erzeugeToken, hashe } from './token.ts';

/** Wie lange ein ausgestellter Code brauchbar bleibt. */
const GUELTIG_TAGE = 60;

export type Pruefung =
  | { ok: true; einladungId: string }
  | { ok: false; grund: 'unbekannt' | 'verbraucht' | 'abgelaufen' | 'falsche-adresse' };

export type Verbrauch = { ok: true } | { ok: false; grund: 'nicht-mehr-offen' };

/**
 * Legt einen Code an und gibt ihn **einmalig** im Klartext zurück.
 *
 * Die Uhr kommt von außen, damit die Gültigkeitsdauer prüfbar ist und nicht
 * an der Systemzeit hängt.
 */
export async function erzeugeEinladung(
  pool: pg.Pool,
  ausgestelltFuer: string,
  jetzt: Date,
): Promise<string> {
  const code = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_TAGE * 24 * 60 * 60 * 1000);

  // ausgestellt_am explizit statt der SQL-Voreinstellung now(): Sonst wäre
  // es das einzige Feld dieser Funktion, das an der Systemzeit hängt statt
  // an der eingespeisten Uhr — und in Tests nicht mehr kontrollierbar.
  await pool.query(
    `INSERT INTO einladung (code_hash, ausgestellt_fuer, ausgestellt_am, gueltig_bis)
     VALUES ($1, $2, $3, $4)`,
    [hashe(code), ausgestelltFuer, jetzt, gueltigBis],
  );

  return code;
}

/**
 * Prüft einen Code gegen die hinterlegte Adresse, **ohne ihn zu verbrauchen**.
 *
 * Ein Code gilt nur für die Adresse, für die er ausgestellt wurde — sonst
 * würde ein weitergereichter Code (Screenshot, weitergeleitete Mail)
 * Vereinsfremden ein Konto verschaffen und der Nachweis der Mitgliedschaft
 * wäre wertlos. Verglichen wird ohne Rücksicht auf Groß- und
 * Kleinschreibung, wie beim eindeutigen Index auf `lower(email)` in
 * `mitglied` (001-mitglied.sql).
 *
 * Hier wird nichts gesperrt und nichts geändert: Das eigentliche Tor ist
 * `verbraucheEinladung`, dessen bedingtes UPDATE auch bei gleichzeitigen
 * Versuchen nur einmal greift. Eine Sperre an dieser Stelle würde nur
 * Verbindungen halten, ohne mehr zu garantieren.
 *
 * Der Grund wird zurückgegeben, aber **nicht nach außen weitergereicht** —
 * die API antwortet immer gleich. Er dient dem Protokoll und den Tests.
 */
export async function pruefeEinladung(
  pool: pg.Pool,
  code: string,
  email: string,
  jetzt: Date,
): Promise<Pruefung> {
  const { rows } = await pool.query<{
    id: string;
    ausgestellt_fuer: string | null;
    gueltig_bis: Date;
    eingeloest_am: Date | null;
  }>(
    `SELECT id, ausgestellt_fuer, gueltig_bis, eingeloest_am FROM einladung
      WHERE code_hash = $1`,
    [hashe(code)],
  );

  const eintrag = rows[0];
  if (!eintrag) return { ok: false, grund: 'unbekannt' };
  // `null` heißt: Das Konto wurde gelöscht, die Adresse ist weg (Migration
  // 006). Zu einer Adresse, die es nicht mehr gibt, passt keine Anfrage.
  if (eintrag.ausgestellt_fuer?.toLowerCase() !== email.toLowerCase()) {
    return { ok: false, grund: 'falsche-adresse' };
  }
  if (eintrag.eingeloest_am !== null) return { ok: false, grund: 'verbraucht' };
  if (eintrag.gueltig_bis.getTime() < jetzt.getTime()) {
    return { ok: false, grund: 'abgelaufen' };
  }

  return { ok: true, einladungId: eintrag.id };
}

/**
 * Entwertet die Eintrittskarte und hält fest, wer sie benutzt hat.
 *
 * Läuft innerhalb der Transaktion, in der das Mitglied entsteht — deshalb
 * eine `PoolClient` und kein Pool. Erst dort steht die Mitglieds-ID fest,
 * die in `eingeloest_von` gehört.
 *
 * Die Bedingung `eingeloest_am IS NULL` im UPDATE ist das eigentliche
 * Schloss: Zwei gleichzeitige Einlösungen desselben Codes serialisieren an
 * der Zeile, und die zweite trifft keine mehr. Wer 0 Zeilen zurückbekommt,
 * darf kein Konto anlegen.
 */
export async function verbraucheEinladung(
  verbindung: pg.PoolClient,
  einladungId: string,
  mitgliedId: string,
  jetzt: Date,
): Promise<Verbrauch> {
  const { rowCount } = await verbindung.query(
    `UPDATE einladung SET eingeloest_am = $2, eingeloest_von = $3
      WHERE id = $1 AND eingeloest_am IS NULL AND gueltig_bis >= $2`,
    [einladungId, jetzt, mitgliedId],
  );

  return rowCount === 1 ? { ok: true } : { ok: false, grund: 'nicht-mehr-offen' };
}
