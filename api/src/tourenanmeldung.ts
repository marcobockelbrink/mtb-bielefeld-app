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
      grund:
        | 'abgesagt'
        | 'vorbei'
        | 'voll'
        | 'gaeste-nicht-erlaubt'
        | 'schon-angemeldet'
        | 'zu-viele';
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
 * Namen der beiden Teilindizes, die eine Doppelanmeldung verhindern — für
 * Mitglieder (Migration `010-tourenanmeldung.sql`) und für Gäste
 * (`011-gastanmeldung-begrenzen.sql`). Der Code allein (`23505`) würde
 * **jede** Unique-Verletzung auf `tourenanmeldung` als „schon-angemeldet"
 * durchgehen lassen — auch die auf `storno_hash`, die etwas ganz anderes
 * bedeutet (ein doppelt erzeugtes Token) und laut scheitern muss. Der Name
 * bindet die Übersetzung an genau den Index, der sie meint.
 */
const EINDEUTIGKEITSINDEX_MITGLIED = 'tourenanmeldung_einmal_je_mitglied';
const EINDEUTIGKEITSINDEX_GAST = 'tourenanmeldung_gast_einmal_je_termin';

/**
 * Wie viele Gastanmeldungen eine einzelne Adresse je Zählfenster auslösen
 * darf — über **alle** Termine hinweg.
 *
 * Der Index oben deckelt nur je Termin; ohne dieses Fenster füllte ein
 * Angreifer mit einer fremden Adresse alle Touren des Sommers und löste
 * dabei je Anmeldung eine Bestätigungsmail an dieses Postfach aus.
 *
 * Das Opfer ist dabei die **Adresse**, nicht der Server: Die Mails gehen
 * an ein Postfach, das nie etwas angefordert hat, und der Platz wird einer
 * Person weggenommen, die wirklich mitfahren will. Deshalb reicht die
 * IP-Grenze in `app.ts` hier nicht — sie zählt, wie oft **eine Verbindung**
 * anklopft, und wer über wechselnde Anschlüsse, ein Mobilfunknetz oder
 * schlicht ein paar Rechner verteilt anfragt, kommt an ihr vorbei, ohne
 * dass sich für das Postfach irgendetwas ändert. Dieselbe Abgrenzung wie
 * zwischen `IpBegrenzung` und der Begrenzung je Adresse in `anmeldung.ts`:
 * Die eine schützt den Server, die andere den Menschen.
 *
 * Drei je Stunde, wie bei den Magic Links: Wer als Gast zu einer Tour
 * kommt, meldet sich zu einer an, im Ausnahmefall zu zweien oder dreien —
 * eine vierte innerhalb einer Stunde ist kein Vereinsleben mehr.
 */
const HOECHSTENS_GAST_JE_FENSTER = 3;
const GAST_ZAEHLFENSTER_MINUTEN = 60;

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
  // Gemessen am **Ende**, nicht am Anfang: Wer zehn Minuten nach dem Start
  // noch am Parkplatz steht und sich eintragen will, soll das können; wer
  // sich zu einer Tour vom letzten Sommer anmeldet, nicht. Ohne diese Regel
  // ginge an einen Gast eine Bestätigungsmail zu einer Ausfahrt, die längst
  // gefahren ist, und die Teilnehmerliste einer vergangenen Tour änderte
  // sich noch Wochen danach.
  if (termin.end.getTime() < jetzt.getTime()) {
    return { ok: false, grund: 'vorbei', belegt: 0, plaetze };
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
      // Unique-Verletzung auf der Tabelle (der Gästeindex weiter unten,
      // `storno_hash`) läuft hier unverändert als Fehler durch. Innerhalb der
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
        if (istVerletzungVon(fehler, EINDEUTIGKEITSINDEX_MITGLIED)) {
          await nimmZurueck(verbindung, fehler);
          return { ok: false, grund: 'schon-angemeldet', belegt, plaetze };
        }
        throw fehler;
      }
      await verbindung.query('COMMIT');
      return { ok: true, belegt: belegt + 1 };
    }

    // Die Grenze je Adresse — in derselben Transaktion wie das Einfügen, aus
    // demselben Grund wie bei den Magic Links: Getrennt gefragt wäre die
    // Auskunft beim Schreiben schon wieder veraltet.
    if (await zuVieleGastanmeldungen(verbindung, wunsch.gastEmail, jetzt)) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'zu-viele', belegt, plaetze };
    }

    const stornoToken = erzeugeToken();
    try {
      await verbindung.query(
        `INSERT INTO tourenanmeldung
           (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [schluessel, termin.start, wunsch.gastName, wunsch.gastEmail, hashe(stornoToken), jetzt],
      );
    } catch (fehler) {
      // Genau wie bei der Doppelanmeldung eines Mitglieds: Der eindeutige
      // Teilindex `tourenanmeldung_gast_einmal_je_termin` fängt den Fall ab,
      // und nur eine Verletzung von genau diesem Index wird übersetzt.
      if (istVerletzungVon(fehler, EINDEUTIGKEITSINDEX_GAST)) {
        await nimmZurueck(verbindung, fehler);
        return { ok: false, grund: 'schon-angemeldet', belegt, plaetze };
      }
      throw fehler;
    }
    await verbindung.query('COMMIT');
    return { ok: true, belegt: belegt + 1, stornoToken };
  } catch (fehler) {
    // Ohne Rücknahme käme die Verbindung mit offener Transaktion in den Pool
    // zurück. Dasselbe Muster wie in `legeAnWennDieBegrenzungEsZulaesst`
    // (`anmeldung.ts`).
    await nimmZurueck(verbindung, fehler);
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Nimmt die Transaktion zurück, ohne den eigentlichen Befund zu
 * verschlucken.
 *
 * Scheitert die Rücknahme selbst (etwa weil die Verbindung weg ist), geht
 * keiner der beiden Fehler verloren: der ursprüngliche als Ursache, der
 * zweite als Meldung. Aufgerufen an drei Stellen — beim erkannten
 * Doppeleintrag eines Mitglieds, beim erkannten Doppeleintrag eines Gastes
 * und im äußeren Fehlerzweig; `ursache` ist dabei jeweils der Befund, der
 * überleben muss.
 */
async function nimmZurueck(verbindung: pg.PoolClient, ursache: unknown): Promise<void> {
  try {
    await verbindung.query('ROLLBACK');
  } catch (rollbackFehler) {
    throw new Error(`Rücknahme misslungen: ${String(rollbackFehler)}`, { cause: ursache });
  }
}

/**
 * Ob für diese Gast-Adresse gerade noch eine Anmeldung entstehen darf.
 *
 * Gezählt wird über **alle** Termine, auf `angelegt_am`, im gleitenden
 * Fenster — nicht in festen Stundenblöcken, sonst ließe sich an jeder
 * vollen Stunde das Doppelte unterbringen (dieselbe Begründung wie bei
 * `darfAnfordern` in `anmeldung.ts`).
 *
 * Stornierte Zeilen zählen ausdrücklich mit: Sie stehen für eine bereits
 * verschickte Mail und einen bereits belegten Platz. Zählte man sie nicht,
 * setzte ein Klick auf den eigenen Storno-Link das Kontingent zurück und
 * die Grenze wäre wirkungslos.
 *
 * Nimmt bewusst eine `PoolClient` und keinen Pool: Die Auskunft ist nur
 * innerhalb der Transaktion belastbar, die sie mit dem Einfügen
 * zusammenhält. Die Beratungssperre darüber liegt je **Termin**, nicht je
 * Adresse — zwei gleichzeitige Anmeldungen derselben Adresse zu zwei
 * verschiedenen Terminen sehen deshalb denselben Zählstand und können
 * beide durchkommen. Das ist hingenommen wie beim globalen Stundenbudget in
 * `anmeldung.ts`: Es geht um die Größenordnung, nicht um Exaktheit auf ±1,
 * und eine zweite Sperre je Adresse würde die Sperre je Termin nur wieder
 * aufweichen.
 */
async function zuVieleGastanmeldungen(
  verbindung: pg.PoolClient,
  gastEmail: string,
  jetzt: Date,
): Promise<boolean> {
  const fensteranfang = new Date(jetzt.getTime() - GAST_ZAEHLFENSTER_MINUTEN * 60 * 1000);

  const { rows } = await verbindung.query<{ anzahl: string }>(
    `SELECT count(*) AS anzahl FROM tourenanmeldung
      WHERE lower(gast_email) = lower($1) AND angelegt_am > $2`,
    [gastEmail, fensteranfang],
  );

  return Number(rows[0]?.anzahl ?? 0) >= HOECHSTENS_GAST_JE_FENSTER;
}

/**
 * Ob `fehler` die Postgres-Meldung zu einer verletzten Unique-Bedingung auf
 * genau `indexname` ist — nicht auf irgendeinem Unique-Index der Tabelle.
 * Ohne den Namensvergleich würde `23505` allein jede Unique-Verletzung auf
 * `tourenanmeldung` stillschweigend als „schon-angemeldet" übersetzen, auch
 * eine, die gar nichts damit zu tun hat.
 */
function istVerletzungVon(fehler: unknown, indexname: string): boolean {
  return (
    typeof fehler === 'object' &&
    fehler !== null &&
    'code' in fehler &&
    (fehler as { code: unknown }).code === PG_UNIQUE_VIOLATION &&
    'constraint' in fehler &&
    (fehler as { constraint: unknown }).constraint === indexname
  );
}

/**
 * Abmelden eines Mitglieds — storniert, löscht nicht: Der Platz zählt
 * sofort frei.
 *
 * Gibt zurück, ob tatsächlich etwas storniert wurde. Wer nie angemeldet
 * war, sich in einem anderen Termin abmeldet oder einen erfundenen
 * Schlüssel schickt, trifft nichts — das darf der Endpunkt nicht als Erfolg
 * ausgeben. Sonst hielte der Anfragende sich für abgemeldet und stünde am
 * Sonntag trotzdem auf der Liste.
 */
export async function meldeAb(
  pool: pg.Pool,
  schluessel: string,
  mitgliedId: string,
  jetzt: Date,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE tourenanmeldung SET storniert_am = $3
      WHERE terminschluessel = $1 AND mitglied_id = $2 AND storniert_am IS NULL`,
    [schluessel, mitgliedId, jetzt],
  );
  return (rowCount ?? 0) > 0;
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
