/**
 * Anmeldungen zu Touren.
 *
 * Die Regeln kommen aus dem Kalender (`ClubEvent`), die Buchhaltung liegt
 * hier. Der Kern ist der Wettlauf um den letzten Platz: Lesen-dann-Schreiben
 * ließe zwei gleichzeitige Anfragen beide durch. Deshalb läuft Zählen und
 * Einfügen in einer Transaktion hinter einer Beratungssperre **je Termin** —
 * dieselbe Technik wie bei der Ratenbegrenzung je Adresse in `anmeldung.ts`,
 * und aus demselben Grund: Anfragen für denselben Termin reihen sich auf,
 * für verschiedene nicht.
 */

import type pg from 'pg';

import type { ClubEvent } from '../../src/domain/types.ts';
import { terminSchluessel } from './termine.ts';
import { erzeugeToken, hashe } from './token.ts';

export type Teilnahmewunsch =
  | { mitgliedId: string }
  | { gastName: string; gastEmail: string };

export type Anmeldeergebnis =
  | { ok: true; belegt: number; stornoToken?: string }
  | {
      ok: false;
      grund: 'abgesagt' | 'voll' | 'gaeste-nicht-erlaubt' | 'schon-angemeldet';
      belegt: number;
      plaetze: number | null;
    };

/** Wie lange die Sperre höchstens wartet — wie in `anmeldung.ts`. */
const SPERR_ZEITSCHRANKE = '3s';

/**
 * Der Fehlercode, den Postgres bei einer verletzten Unique-Bedingung wirft
 * (`unique_violation`). Siehe die Begründung bei der Doppelanmeldung unten:
 * `ON CONFLICT` mit Teilindex kommt hier nicht zum Zug, dieser Code fängt
 * denselben Fall stattdessen ab.
 */
const PG_UNIQUE_VIOLATION = '23505';

export async function meldeAn(
  pool: pg.Pool,
  termin: ClubEvent,
  wunsch: Teilnahmewunsch,
  jetzt: Date,
): Promise<Anmeldeergebnis> {
  const schluessel = terminSchluessel(termin);
  const plaetze = termin.details.maxParticipants ?? null;

  // Regeln, die keine Zählung brauchen — vor der Sperre, spart Wartezeit.
  if (termin.cancelled) {
    return { ok: false, grund: 'abgesagt', belegt: 0, plaetze };
  }
  const istGast = !('mitgliedId' in wunsch);
  if (istGast && termin.details.gaesteErlaubt !== true) {
    const belegt = await holeBelegung(pool, schluessel);
    return { ok: false, grund: 'gaeste-nicht-erlaubt', belegt, plaetze };
  }

  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    await verbindung.query(`SET LOCAL lock_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query(`SET LOCAL statement_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `tour:${schluessel}`,
    ]);

    const { rows } = await verbindung.query<{ belegt: string }>(
      `SELECT count(*) AS belegt FROM tourenanmeldung
        WHERE terminschluessel = $1 AND storniert_am IS NULL`,
      [schluessel],
    );
    const belegt = Number(rows[0]?.belegt ?? 0);

    if (plaetze !== null && belegt >= plaetze) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'voll', belegt, plaetze };
    }

    if (!istGast) {
      // Der eindeutige Teilindex (`tourenanmeldung_einmal_je_mitglied`) fängt
      // die Doppelanmeldung ab. `ON CONFLICT (spalten) WHERE bedingung`
      // bräuchte hier zusätzlich `mitglied_id IS NOT NULL` im Prädikat, um
      // exakt auf den Index zu treffen — steht das nicht wortgleich da,
      // findet Postgres keinen passenden Index zur Inferenz und lehnt die
      // Anweisung ab ("no unique or exclusion constraint matching the ON
      // CONFLICT specification"). Statt diese Kopie des Indexprädikats an
      // zwei Stellen zu pflegen (Migration und Abfrage, garantiert
      // irgendwann auseinanderlaufend), fängt dieser Code den Konflikt als
      // Fehler `23505` ab — robust gegenüber jeder künftigen Änderung am
      // Index, ohne dass die Abfrage seine Definition kennen muss. Innerhalb
      // der Beratungssperre ist das kein Wettlauf: Nur diese eine Anfrage
      // schreibt gerade für diesen Termin, der Konflikt kann nur aus einer
      // bestehenden Zeile stammen, nicht aus einer gleichzeitigen.
      try {
        await verbindung.query(
          `INSERT INTO tourenanmeldung
             (terminschluessel, termin_start, mitglied_id, angelegt_am)
           VALUES ($1, $2, $3, $4)`,
          [schluessel, termin.start, wunsch.mitgliedId, jetzt],
        );
      } catch (fehler) {
        if (istEindeutigkeitsverletzung(fehler)) {
          await verbindung.query('ROLLBACK');
          return { ok: false, grund: 'schon-angemeldet', belegt, plaetze };
        }
        throw fehler;
      }
      await verbindung.query('COMMIT');
      return { ok: true, belegt: belegt + 1 };
    }

    const stornoToken = erzeugeToken();
    await verbindung.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [schluessel, termin.start, wunsch.gastName, wunsch.gastEmail, hashe(stornoToken), jetzt],
    );
    await verbindung.query('COMMIT');
    return { ok: true, belegt: belegt + 1, stornoToken };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/** Ob `fehler` die Postgres-Meldung zu einer verletzten Unique-Bedingung ist. */
function istEindeutigkeitsverletzung(fehler: unknown): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    'code' in fehler &&
    (fehler as { code: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

/** Abmelden eines Mitglieds — storniert, löscht nicht: Der Platz zählt sofort frei. */
export async function meldeAb(
  pool: pg.Pool,
  schluessel: string,
  mitgliedId: string,
  jetzt: Date,
): Promise<void> {
  await pool.query(
    `UPDATE tourenanmeldung SET storniert_am = $3
      WHERE terminschluessel = $1 AND mitglied_id = $2 AND storniert_am IS NULL`,
    [schluessel, mitgliedId, jetzt],
  );
}

/** Storno eines Gastes über den Token aus der Bestätigungsmail. Einmal gültig. */
export async function storniereGast(
  pool: pg.Pool,
  token: string,
  jetzt: Date,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE tourenanmeldung SET storniert_am = $2
      WHERE storno_hash = $1 AND storniert_am IS NULL`,
    [hashe(token), jetzt],
  );
  return (rowCount ?? 0) > 0;
}

export async function holeBelegung(pool: pg.Pool, schluessel: string): Promise<number> {
  const { rows } = await pool.query<{ belegt: string }>(
    `SELECT count(*) AS belegt FROM tourenanmeldung
      WHERE terminschluessel = $1 AND storniert_am IS NULL`,
    [schluessel],
  );
  return Number(rows[0]?.belegt ?? 0);
}

/**
 * Die Teilnehmerliste — nur für die Guide-Rolle gedacht; wer sie sehen darf,
 * entscheidet der Endpunkt. Mitglieder erscheinen mit ihrer Adresse: Mehr
 * als die Adresse speichert die API über ein Mitglied nicht.
 */
export async function holeTeilnehmer(
  pool: pg.Pool,
  schluessel: string,
): Promise<Array<{ anzeige: string; gast: boolean }>> {
  const { rows } = await pool.query<{ anzeige: string; gast: boolean }>(
    `SELECT COALESCE(a.gast_name, m.email) AS anzeige,
            (a.mitglied_id IS NULL) AS gast
       FROM tourenanmeldung a
       LEFT JOIN mitglied m ON m.id = a.mitglied_id
      WHERE a.terminschluessel = $1 AND a.storniert_am IS NULL
      ORDER BY a.angelegt_am`,
    [schluessel],
  );
  return rows;
}
