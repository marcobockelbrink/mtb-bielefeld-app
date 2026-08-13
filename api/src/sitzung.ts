/**
 * Sitzungen: kurzlebiger Zugang, langlebige Erneuerung.
 *
 * Das Zugangs-Token gilt 15 Minuten und liegt in der App nur im
 * Arbeitsspeicher. Das Erneuerungs-Token gilt 60 Tage, liegt im
 * Schlüsselbund des Geräts und wird bei jeder Nutzung ausgetauscht.
 */

import type pg from 'pg';

import { verbraucheEinladung } from './einladung.ts';
import { erzeugeToken, hashe } from './token.ts';

const ZUGANG_MINUTEN = 15;
const ERNEUERUNG_TAGE = 60;

/**
 * Versucht ein ROLLBACK, ohne einen bereits vorliegenden Fehler zu
 * überschreiben.
 *
 * Scheitert das ROLLBACK selbst — etwa weil die Verbindung schon hinüber
 * ist —, würde der `catch`-Block sonst dessen Fehler werfen statt den
 * eigentlichen, der zum ROLLBACK geführt hat. Der Aufrufer wirft den echten
 * Fehler gleich im Anschluss selbst.
 */
async function versucheRollback(verbindung: pg.PoolClient): Promise<void> {
  try {
    await verbindung.query('ROLLBACK');
  } catch {
    // Verworfen — der ursprüngliche Fehler zählt, nicht dieser.
  }
}

export interface Sitzungstoken {
  zugang: string;
  erneuerung: string;
}

export interface Ausweis {
  mitgliedId: string;
  rolle: string;
}

/** Legt eine Sitzung an und gibt beide Token im Klartext zurück. */
export async function legeSitzungAn(
  ausfuehrer: pg.Pool | pg.PoolClient,
  mitgliedId: string,
  jetzt: Date,
): Promise<Sitzungstoken> {
  const zugang = erzeugeToken();
  const erneuerung = erzeugeToken();

  await ausfuehrer.query(
    `INSERT INTO sitzung
       (mitglied_id, zugang_hash, erneuerung_hash, zugang_bis, erneuerung_bis)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      mitgliedId,
      hashe(zugang),
      hashe(erneuerung),
      new Date(jetzt.getTime() + ZUGANG_MINUTEN * 60 * 1000),
      new Date(jetzt.getTime() + ERNEUERUNG_TAGE * 24 * 60 * 60 * 1000),
    ],
  );

  return { zugang, erneuerung };
}

/** Wer gehört zu diesem Zugangs-Token? `null`, wenn es nicht gilt. */
export async function pruefeZugang(
  pool: pg.Pool,
  zugang: string,
  jetzt: Date,
): Promise<Ausweis | null> {
  const { rows } = await pool.query<{ mitglied_id: string; rolle: string }>(
    // Ohne "ersetzt_am IS NULL" bliebe ein Zugangs-Token nach der Rotation
    // bis zu ZUGANG_MINUTEN weiter gültig: Nur die Zeile wird ersetzt, das
    // alte Zugangs-Token und sein zugang_bis stehen unverändert weiter in
    // der (nun ersetzten) Zeile.
    `SELECT s.mitglied_id, m.rolle
       FROM sitzung s
       JOIN mitglied m ON m.id = s.mitglied_id
      WHERE s.zugang_hash = $1 AND s.zugang_bis > $2 AND s.ersetzt_am IS NULL`,
    [hashe(zugang), jetzt],
  );

  const zeile = rows[0];
  return zeile ? { mitgliedId: zeile.mitglied_id, rolle: zeile.rolle } : null;
}

/**
 * Löst einen Magic Link ein: entwertet ihn, legt das Mitglied an, falls es
 * noch keines gibt, und gibt eine Sitzung aus.
 *
 * Alles in einer Transaktion — sonst könnte ein Abbruch nach dem Entwerten
 * ein Mitglied ohne Sitzung und mit verbrauchtem Link hinterlassen.
 *
 * **Hier** wird die Eintrittskarte entwertet, nicht beim Anfordern: erst
 * jetzt gibt es eine Mitglieds-ID für `einladung.eingeloest_von`, und erst
 * jetzt ist das Konto wirklich entstanden. Ein Link ohne Einladung
 * (`einladung_id IS NULL`) darf nur ein **bestehendes** Mitglied anmelden —
 * gäbe es keines mehr, weil das Konto zwischenzeitlich gelöscht wurde,
 * entstünde sonst ohne jede Karte ein neues.
 */
export async function loeseMagicLinkEin(
  pool: pg.Pool,
  token: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    const { rows } = await verbindung.query<{
      id: string;
      email: string;
      gueltig_bis: Date;
      verbraucht_am: Date | null;
      einladung_id: string | null;
    }>(
      `SELECT id, email, gueltig_bis, verbraucht_am, einladung_id FROM magic_link
        WHERE token_hash = $1 FOR UPDATE`,
      [hashe(token)],
    );

    const eintrag = rows[0];
    if (
      !eintrag ||
      eintrag.verbraucht_am !== null ||
      eintrag.gueltig_bis.getTime() < jetzt.getTime()
    ) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    await verbindung.query('UPDATE magic_link SET verbraucht_am = $2 WHERE id = $1', [
      eintrag.id,
      jetzt,
    ]);

    const mitgliedId = await findeOderLegeMitgliedAn(
      verbindung,
      eintrag.email,
      eintrag.einladung_id,
      jetzt,
    );
    if (mitgliedId === null) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    const token_paar = await legeSitzungAn(verbindung, mitgliedId, jetzt);

    await verbindung.query('COMMIT');
    return { ok: true, ...token_paar };
  } catch (fehler) {
    await versucheRollback(verbindung);
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Gibt die Mitglieds-ID zurück — vorhanden oder frisch angelegt. `null`,
 * wenn es kein Mitglied gibt und keine Eintrittskarte mehr zieht.
 *
 * Läuft ausschließlich innerhalb der Transaktion von `loeseMagicLinkEin`.
 */
async function findeOderLegeMitgliedAn(
  verbindung: pg.PoolClient,
  email: string,
  einladungId: string | null,
  jetzt: Date,
): Promise<string | null> {
  const { rows: vorhanden } = await verbindung.query<{ id: string }>(
    'SELECT id FROM mitglied WHERE lower(email) = lower($1)',
    [email],
  );

  const bekannt = vorhanden[0];
  if (bekannt) {
    await verbindung.query('UPDATE mitglied SET gesehen_am = $2 WHERE id = $1', [
      bekannt.id,
      jetzt,
    ]);
    return bekannt.id;
  }

  if (einladungId === null) return null;

  // ON CONFLICT: Zwei gleichzeitige Einlösungen für dieselbe Adresse haben
  // oben beide „kein Mitglied“ gesehen. Die zweite bekommt hier dieselbe
  // Zeile statt eines Fehlers am eindeutigen Index — und scheitert gleich
  // darauf sauber an der schon entwerteten Einladung.
  // angelegt_am explizit statt der SQL-Voreinstellung now(): Sonst hinge
  // ausgerechnet diese Spalte an der Systemzeit statt an der eingespeisten
  // Uhr — bei ON CONFLICT betrifft das nur den echten Einfüge-Pfad, der
  // Konfliktfall setzt ohnehin schon gesehen_am über $2.
  const { rows: angelegt } = await verbindung.query<{ id: string }>(
    `INSERT INTO mitglied (email, angelegt_am) VALUES ($1, $2)
     ON CONFLICT (lower(email)) DO UPDATE SET gesehen_am = $2
     RETURNING id`,
    [email, jetzt],
  );
  const mitgliedId = angelegt[0]!.id;

  const verbrauch = await verbraucheEinladung(verbindung, einladungId, mitgliedId, jetzt);
  return verbrauch.ok ? mitgliedId : null;
}


/**
 * Löst eine **Einladung direkt** ein — der Ein-Klick-Weg aus der
 * Einladungsmail (`/e/<code>`), seit dem 13.08.2026.
 *
 * Warum das dieselbe Sicherheit hat wie der Magic Link: Beide beweisen
 * dasselbe, nämlich Zugriff auf das Postfach der Adresse. Die
 * Einladungsmail ging an genau die Adresse, an die der Code gebunden ist —
 * wer den Link antippen kann, hätte auch die Magic-Link-Mail bekommen.
 * Der Umweg „Code abtippen, Adresse eintippen, zweite Mail abwarten"
 * bewies nichts zusätzlich, er war nur umständlich.
 *
 * Dieselbe Transaktion wie beim Magic Link, nur der Einstieg anders:
 * Statt des Link-Tokens wird der Einladungscode nachgeschlagen, alles
 * Weitere (Mitglied anlegen, Einladung entwerten, Sitzung) übernimmt
 * `findeOderLegeMitgliedAn` unverändert. Ein zweiter Klick auf denselben
 * Link meldet das inzwischen bestehende Konto einfach an — die Einladung
 * ist dann zwar entwertet, aber `findeOderLegeMitgliedAn` braucht sie für
 * Bekannte gar nicht.
 */
export async function loeseEinladungEin(
  pool: pg.Pool,
  code: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    const { rows } = await verbindung.query<{ id: string; ausgestellt_fuer: string }>(
      `SELECT id, ausgestellt_fuer FROM einladung
        WHERE code_hash = $1 AND gueltig_bis > $2 FOR UPDATE`,
      [hashe(code), jetzt],
    );

    const einladung = rows[0];
    if (!einladung) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    const mitgliedId = await findeOderLegeMitgliedAn(
      verbindung,
      einladung.ausgestellt_fuer,
      einladung.id,
      jetzt,
    );
    if (mitgliedId === null) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    const tokenPaar = await legeSitzungAn(verbindung, mitgliedId, jetzt);

    await verbindung.query('COMMIT');
    return { ok: true, ...tokenPaar };
  } catch (fehler) {
    await versucheRollback(verbindung);
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Tauscht ein Erneuerungs-Token gegen ein frisches Paar.
 *
 * **Wiederverwendungserkennung:** Taucht ein bereits ersetztes Token wieder
 * auf, gibt es nur zwei Erklärungen — es wurde kopiert, oder ein Gerät hat
 * die Antwort nicht mitbekommen. Beide Fälle behandeln wir gleich streng:
 * Alle Sitzungen dieses Mitglieds fliegen raus. Wer wirklich der Eigentümer
 * ist, meldet sich neu an; wer es nicht ist, hält nichts mehr in der Hand.
 *
 * Das Aufräumen abgelaufener Sitzungen stand einmal hier. Es steht jetzt in
 * `aufraeumen.ts`: Die Erneuerung ist der Pfad, den jedes Gerät alle
 * fünfzehn Minuten geht, und sie darf weder auf ein Aufräumen warten noch
 * mit ihm scheitern.
 */
export async function erneuereSitzung(
  pool: pg.Pool,
  erneuerung: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  return tauscheErneuerungstoken(pool, erneuerung, jetzt);
}

/** Die eigentliche Token-Rotation, in einer eigenen Transaktion. */
async function tauscheErneuerungstoken(
  pool: pg.Pool,
  erneuerung: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    const { rows } = await verbindung.query<{
      id: string;
      mitglied_id: string;
      erneuerung_bis: Date;
      ersetzt_am: Date | null;
    }>(
      `SELECT id, mitglied_id, erneuerung_bis, ersetzt_am FROM sitzung
        WHERE erneuerung_hash = $1 FOR UPDATE`,
      [hashe(erneuerung)],
    );

    const sitzung = rows[0];
    if (!sitzung) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    if (sitzung.ersetzt_am !== null) {
      // Kopiert. Alles dieses Mitglieds entwerten.
      await verbindung.query('DELETE FROM sitzung WHERE mitglied_id = $1', [
        sitzung.mitglied_id,
      ]);
      await verbindung.query('COMMIT');
      return { ok: false };
    }

    if (sitzung.erneuerung_bis.getTime() < jetzt.getTime()) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    await verbindung.query('UPDATE sitzung SET ersetzt_am = $2 WHERE id = $1', [
      sitzung.id,
      jetzt,
    ]);

    const paar = await legeSitzungAn(verbindung, sitzung.mitglied_id, jetzt);
    await verbindung.query('COMMIT');
    return { ok: true, ...paar };
  } catch (fehler) {
    await versucheRollback(verbindung);
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/** Abmelden: die Sitzung zu diesem Erneuerungs-Token verschwindet. */
export async function beendeSitzung(pool: pg.Pool, erneuerung: string): Promise<void> {
  await pool.query('DELETE FROM sitzung WHERE erneuerung_hash = $1', [hashe(erneuerung)]);
}
