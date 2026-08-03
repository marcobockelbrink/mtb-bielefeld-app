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

/**
 * Name des Teilindex, der die Doppelanmeldung eines Mitglieds verhindert
 * (Migration `010-tourenanmeldung.sql`). Der Code allein (`23505`) würde
 * **jede** Unique-Verletzung auf `tourenanmeldung` als „schon-angemeldet"
 * durchgehen lassen — auch eine, die künftig ein ganz anderer Index wirft
 * (etwa einer auf `gast_email`). Der Name bindet die Übersetzung an genau
 * den Index, der sie meint.
 */
const EINDEUTIGKEITSINDEX_MITGLIED = 'tourenanmeldung_einmal_je_mitglied';

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
      // Fehler `23505` ab — die Abfrage kennt das **Prädikat** des Index
      // dadurch nicht, wohl aber seinen **Namen** (siehe
      // `EINDEUTIGKEITSINDEX_MITGLIED`): Nur eine Verletzung von genau
      // diesem Index wird als „schon-angemeldet" übersetzt, jede andere
      // Unique-Verletzung auf der Tabelle (etwa ein künftiger Index auf
      // `gast_email`) läuft unverändert als Fehler durch. Innerhalb der
      // Beratungssperre ist das kein Wettlauf: Nur diese eine Anfrage
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
        if (istDoppelteMitgliedsanmeldung(fehler)) {
          // Wie im äußeren Fehlerzweig unten: Eine scheiternde Rücknahme
          // darf den eigentlichen Befund — die erkannte Doppelanmeldung —
          // nicht verschlucken.
          try {
            await verbindung.query('ROLLBACK');
          } catch (rollbackFehler) {
            throw new Error(`Rücknahme misslungen: ${String(rollbackFehler)}`, {
              cause: fehler,
            });
          }
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
    // Ohne Rücknahme käme die Verbindung mit offener Transaktion in den Pool
    // zurück. Scheitert auch die (etwa weil die Verbindung weg ist), geht
    // keiner der beiden Fehler verloren: der ursprüngliche als Ursache, der
    // zweite als Meldung. Dasselbe Muster wie in `legeAnWennDieBegrenzungEsZulaesst`
    // (`anmeldung.ts`).
    try {
      await verbindung.query('ROLLBACK');
    } catch (rollbackFehler) {
      throw new Error(`Rücknahme misslungen: ${String(rollbackFehler)}`, { cause: fehler });
    }
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Ob `fehler` die Postgres-Meldung zu einer verletzten Unique-Bedingung auf
 * genau `tourenanmeldung_einmal_je_mitglied` ist — nicht auf irgendeinem
 * Unique-Index der Tabelle. Ohne den Namensvergleich würde `23505` allein
 * jede künftige Unique-Verletzung auf `tourenanmeldung` stillschweigend als
 * „schon-angemeldet" übersetzen, auch eine, die gar nichts mit der
 * Mitgliedsanmeldung zu tun hat.
 */
function istDoppelteMitgliedsanmeldung(fehler: unknown): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    'code' in fehler &&
    (fehler as { code: unknown }).code === PG_UNIQUE_VIOLATION &&
    'constraint' in fehler &&
    (fehler as { constraint: unknown }).constraint === EINDEUTIGKEITSINDEX_MITGLIED
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
