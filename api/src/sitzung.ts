/**
 * Sitzungen: kurzlebiger Zugang, langlebige Erneuerung.
 *
 * Das Zugangs-Token gilt 15 Minuten und liegt in der App nur im
 * Arbeitsspeicher. Das Erneuerungs-Token gilt 60 Tage, liegt im
 * Schlüsselbund des Geräts und wird bei jeder Nutzung ausgetauscht.
 */

import type pg from 'pg';

import { erzeugeToken, hashe } from './token.ts';

const ZUGANG_MINUTEN = 15;
const ERNEUERUNG_TAGE = 60;

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
    `SELECT s.mitglied_id, m.rolle
       FROM sitzung s
       JOIN mitglied m ON m.id = s.mitglied_id
      WHERE s.zugang_hash = $1 AND s.zugang_bis > $2`,
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
    }>(
      `SELECT id, email, gueltig_bis, verbraucht_am FROM magic_link
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

    const { rows: mitglieder } = await verbindung.query<{ id: string }>(
      `INSERT INTO mitglied (email) VALUES ($1)
       ON CONFLICT (lower(email)) DO UPDATE SET gesehen_am = now()
       RETURNING id`,
      [eintrag.email],
    );

    const mitgliedId = mitglieder[0]!.id;
    const token_paar = await legeSitzungAn(verbindung, mitgliedId, jetzt);

    await verbindung.query('COMMIT');
    return { ok: true, ...token_paar };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
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
 */
export async function erneuereSitzung(
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
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/** Abmelden: die Sitzung zu diesem Erneuerungs-Token verschwindet. */
export async function beendeSitzung(pool: pg.Pool, erneuerung: string): Promise<void> {
  await pool.query('DELETE FROM sitzung WHERE erneuerung_hash = $1', [hashe(erneuerung)]);
}
