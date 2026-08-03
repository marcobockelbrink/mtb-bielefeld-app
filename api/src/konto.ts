/**
 * Auskunft und Löschung.
 *
 * Beides ist Pflicht, nicht Kür: Die DSGVO verlangt Auskunft (Art. 15) und
 * Löschung (Art. 17), und Apple gibt eine App mit Registrierung nur frei,
 * wenn sich das Konto **in der App** löschen lässt.
 *
 * Gelöscht wird wirklich, nicht als gelöscht markiert.
 */

import type pg from 'pg';

export interface KontoAuskunft {
  email: string;
  rolle: string;
  angelegtAm: Date;
  sitzungen: number;
  anmeldungen: number;
}

export async function holeKontoAuskunft(
  pool: pg.Pool,
  mitgliedId: string,
  jetzt: Date,
): Promise<KontoAuskunft | null> {
  const { rows } = await pool.query<{
    email: string;
    rolle: string;
    angelegt_am: Date;
    sitzungen: string;
    anmeldungen: string;
  }>(
    // Nach Art. 15 zählt, was tatsächlich gilt: Eine ersetzte Zeile
    // (ersetzt_am gesetzt) ist nur noch für die Wiederverwendungserkennung
    // da, keine nutzbare Sitzung mehr. Eine mit abgelaufener
    // Erneuerungsfrist ebenso wenig — nur noch nicht aufgeräumt. Bei den
    // Anmeldungen zählt entsprechend nur, was nicht storniert ist.
    `SELECT m.email, m.rolle, m.angelegt_am,
            (SELECT count(*) FROM sitzung s
              WHERE s.mitglied_id = m.id
                AND s.ersetzt_am IS NULL
                AND s.erneuerung_bis > $2) AS sitzungen,
            (SELECT count(*) FROM tourenanmeldung a
              WHERE a.mitglied_id = m.id AND a.storniert_am IS NULL) AS anmeldungen
       FROM mitglied m WHERE m.id = $1`,
    [mitgliedId, jetzt],
  );

  const zeile = rows[0];
  if (!zeile) return null;

  return {
    email: zeile.email,
    rolle: zeile.rolle,
    angelegtAm: zeile.angelegt_am,
    sitzungen: Number(zeile.sitzungen),
    anmeldungen: Number(zeile.anmeldungen),
  };
}

/**
 * Räumt alles weg, was zu dieser Person gespeichert ist.
 *
 * `DELETE FROM mitglied` allein genügt nicht: `ON DELETE CASCADE` erwischt
 * nur `sitzung`. Dieselbe Adresse steht aber auch in `magic_link.email` und
 * in `einladung.ausgestellt_fuer` — beides ohne Fremdschlüssel, beides
 * ohne Aufräumen. Nach Art. 17 muss sie überall verschwinden.
 *
 * Der Unterschied zwischen beiden: Magic Links sind Wegwerfzeug und werden
 * gelöscht. Die Einladungszeile bleibt und verliert nur die Adresse — der
 * Verein soll nachvollziehen können, dass ein Code ausgestellt und
 * eingelöst wurde, ohne die personenbezogene Angabe zu behalten.
 * `eingeloest_von` geht über `ON DELETE SET NULL` von selbst mit.
 *
 * Alles in einer Transaktion: Ein Abbruch zwischendurch hinterließe ein
 * gelöschtes Konto, dessen Adresse noch in der Datenbank steht — genau der
 * Zustand, den die Löschung beseitigen soll.
 *
 * Die Anweisungen nennen die Adresse nicht selbst, sondern schlagen sie
 * über die Mitglieds-ID nach. Ist das Mitglied schon weg (zwei
 * gleichzeitige Löschanfragen), trifft keine von ihnen etwas — das
 * Ergebnis stimmt trotzdem, es ist gelöscht.
 */
export async function loescheKonto(pool: pg.Pool, mitgliedId: string): Promise<void> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    await verbindung.query(
      `DELETE FROM magic_link
        WHERE lower(email) = (SELECT lower(email) FROM mitglied WHERE id = $1)`,
      [mitgliedId],
    );

    await verbindung.query(
      `UPDATE einladung SET ausgestellt_fuer = NULL
        WHERE lower(ausgestellt_fuer)
              = (SELECT lower(email) FROM mitglied WHERE id = $1)`,
      [mitgliedId],
    );

    await verbindung.query('DELETE FROM mitglied WHERE id = $1', [mitgliedId]);

    await verbindung.query('COMMIT');
  } catch (fehler) {
    // Ein fehlschlagendes ROLLBACK (z. B. weil die Verbindung schon hinüber
    // ist) soll nicht den eigentlichen Fehler überschreiben.
    try {
      await verbindung.query('ROLLBACK');
    } catch {
      // Verworfen — der ursprüngliche Fehler zählt, nicht dieser.
    }
    throw fehler;
  } finally {
    verbindung.release();
  }
}
