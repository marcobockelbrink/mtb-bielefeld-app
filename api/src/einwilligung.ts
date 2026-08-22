/**
 * Die Foto- und Videoeinwilligung am Kind (Handoff 15).
 *
 * Bisher lief sie über ein MS-Forms-Formular mit Freitext-Namen — Abgleich
 * gegen die Kinderliste von Hand, Widerruf per E-Mail.
 *
 * ## Vier Zustände, und nur einer entsteht in der App
 *
 * - `offen` — noch keine Antwort. **Das ist die Abwesenheit einer Zeile**,
 *   kein gespeicherter Wert.
 * - `erteilt` — Ja. Der einzige Weg, den die App anbietet.
 * - `abgelehnt` / `widerrufen` — erfasst **nur die Verwaltung**, auf Zuruf.
 *
 * Dass es in der App kein Nein gibt, ist eine Entscheidung des Vereins und
 * keine Nachlässigkeit: Die Hürde für ein Nein soll beim Gespräch liegen.
 * Der Server setzt das durch (`darfSetzen`) — nicht die Oberfläche, denn
 * ein fehlender Knopf ist keine Regel.
 *
 * ## Fehlt = Nein
 *
 * Für Guides ist alles außer `erteilt` gleichbedeutend: kein Foto. Wer
 * nicht geantwortet hat, hat nicht zugestimmt. Das ist die einzige
 * Richtung, in der ein Fehler niemandem schadet.
 */

import type pg from 'pg';

/** Die Fassung des Einwilligungstextes, der gerade gilt. */
export const TEXT_VERSION = '2026-08';

/** Ab diesem Alter zählt die eigene Stimme des Kindes mit. */
export const EIGENE_STIMME_AB = 13;

export type Einwilligungsstatus = 'offen' | 'erteilt' | 'abgelehnt' | 'widerrufen';

export interface Einwilligung {
  status: Einwilligungsstatus;
  textVersion: string | null;
  /** Wer geantwortet hat — der Name, nicht die Kennung. */
  bestaetigtVon: string | null;
  zeitpunkt: Date | null;
  /** Die zweite Stimme ab 13 — `null`, wenn sie gar nicht gebraucht wird. */
  jugendBestaetigt: boolean | null;
  quelle: 'app' | 'forms-import' | null;
  /**
   * Zählt für Guides als „darf fotografiert werden"?
   *
   * Genau dann, wenn zugestimmt wurde **und** die zweite Stimme vorliegt,
   * soweit sie nötig ist. Ein „erteilt · Ben fehlt noch" ist noch kein Ja.
   */
  vollstaendig: boolean;
}

/**
 * Braucht dieses Kind eine eigene Stimme?
 *
 * **Jahresgrenze und nicht Geburtstag** — am Profil steht `geburtsjahr`,
 * kein Datum. Wer im Dezember geboren ist, zählt damit bis zu elf Monate
 * zu früh.
 *
 * Das ist die harmlose Richtung: Die zweite Stimme ist ein Schutz für das
 * Kind, und ihn früher einzuholen schadet niemandem. Andersherum wäre ein
 * 13-Jähriger übergangen worden, dessen Bild veröffentlicht wird.
 *
 * Ohne Geburtsjahr keine zweite Stimme: Ein unbekanntes Alter darf keine
 * zusätzliche Hürde erfinden, sonst bliebe jedes ältere Profil ohne Angabe
 * für immer unvollständig.
 */
export function brauchtEigeneStimme(geburtsjahr: number | null, jetzt: Date): boolean {
  if (geburtsjahr === null) return false;
  return jetzt.getFullYear() - geburtsjahr >= EIGENE_STIMME_AB;
}

/** Was ein Mitgliedskonto setzen darf — und was nur die Verwaltung darf. */
export function darfSetzen(status: string, istVerwaltung: boolean): boolean {
  if (status === 'erteilt') return true;
  return istVerwaltung && (status === 'abgelehnt' || status === 'widerrufen');
}

interface Zeile {
  status: 'erteilt' | 'abgelehnt' | 'widerrufen';
  text_version: string;
  name: string | null;
  angelegt_am: Date;
  jugend_bestaetigt: boolean;
  quelle: 'app' | 'forms-import';
}

/**
 * Der aktuelle Stand aus den Zeilen eines Kindes — jüngste zuerst.
 *
 * **Eine Ablehnung und ein Widerruf überdauern eine Textänderung.** Nur
 * ein `erteilt` verfällt: Wer einem Text zugestimmt hat, hat nicht einem
 * anderen zugestimmt. Andersherum wäre es grotesk — ein Widerruf, den eine
 * neue Fassung des Textes stillschweigend aufhebt, ist kein Widerruf.
 */
export function fasseZusammen(
  zeilen: Zeile[],
  braucht: boolean,
  textVersion = TEXT_VERSION,
): Einwilligung {
  const leer: Einwilligung = {
    status: 'offen',
    textVersion: null,
    bestaetigtVon: null,
    zeitpunkt: null,
    jugendBestaetigt: braucht ? false : null,
    quelle: null,
    vollstaendig: false,
  };

  const jüngste = zeilen[0];
  if (!jüngste) return leer;

  // Zugestimmt wurde einer bestimmten Fassung. Eine neue Fassung ist eine
  // neue Frage — die alte Zeile bleibt als Historie stehen.
  if (jüngste.status === 'erteilt' && jüngste.text_version !== textVersion) return leer;

  return {
    status: jüngste.status,
    textVersion: jüngste.text_version,
    bestaetigtVon: jüngste.name,
    zeitpunkt: jüngste.angelegt_am,
    jugendBestaetigt: braucht ? jüngste.jugend_bestaetigt : null,
    quelle: jüngste.quelle,
    vollstaendig:
      jüngste.status === 'erteilt' && (!braucht || jüngste.jugend_bestaetigt),
  };
}

/** Die Einwilligung eines Kindes — mit Historie zusammengefasst. */
export async function holeEinwilligung(
  db: pg.Pool | pg.PoolClient,
  kindId: string,
  jetzt: Date,
): Promise<Einwilligung> {
  const { rows: kinder } = await db.query<{ geburtsjahr: number | null }>(
    'SELECT geburtsjahr FROM mitglied WHERE id = $1',
    [kindId],
  );
  const braucht = brauchtEigeneStimme(kinder[0]?.geburtsjahr ?? null, jetzt);

  const { rows } = await db.query<Zeile>(
    `SELECT e.status, e.text_version, m.name, e.angelegt_am, e.jugend_bestaetigt, e.quelle
       FROM einwilligung_bild e
       LEFT JOIN mitglied m ON m.id = e.bestaetigt_von
      WHERE e.kind_id = $1
      ORDER BY e.nr DESC`,
    [kindId],
  );

  return fasseZusammen(rows, braucht);
}

export type SetzErgebnis =
  | { ok: true }
  | { ok: false; grund: 'unbekannt' | 'nicht-erlaubt' | 'status-ungueltig' };

/**
 * Eine Antwort festhalten — als **neue Zeile**, nie durch Ändern.
 *
 * `darfAendern` prüft die Zuständigkeit: Ein Elternkonto darf nur seine
 * eigenen Kinder (`verwaltet_von`), die Verwaltung alle. Die Prüfung steht
 * in der `WHERE`-Bedingung des Einfügens und nicht in einer Abfrage davor
 * — sonst käme zwischen Lesen und Schreiben eine Änderung durch, dieselbe
 * Überlegung wie bei `aendereTraining`.
 */
export async function setzeEinwilligung(
  db: pg.Pool,
  {
    kindId,
    status,
    ausfuehrer,
    istVerwaltung,
    jugendBestaetigt,
    jugendBestaetigtVon,
    quelle = 'app',
    jetzt,
  }: {
    kindId: string;
    status: string;
    ausfuehrer: string;
    istVerwaltung: boolean;
    jugendBestaetigt?: boolean;
    jugendBestaetigtVon?: string | null;
    quelle?: 'app' | 'forms-import';
    jetzt: Date;
  },
): Promise<SetzErgebnis> {
  if (!darfSetzen(status, istVerwaltung)) return { ok: false, grund: 'status-ungueltig' };

  const { rowCount } = await db.query(
    `INSERT INTO einwilligung_bild
       (kind_id, status, text_version, bestaetigt_von, jugend_bestaetigt,
        jugend_bestaetigt_von, quelle, angelegt_am)
     SELECT k.id, $2, $3, $4, $5, $6, $7, $8
       FROM mitglied k
      WHERE k.id = $1
        AND ($9::boolean OR k.verwaltet_von = $4)`,
    [
      kindId,
      status,
      TEXT_VERSION,
      ausfuehrer,
      jugendBestaetigt ?? false,
      jugendBestaetigtVon ?? null,
      quelle,
      jetzt,
      istVerwaltung,
    ],
  );

  return (rowCount ?? 0) > 0 ? { ok: true } : { ok: false, grund: 'nicht-erlaubt' };
}

export interface KindMitEinwilligung {
  id: string;
  name: string | null;
  geburtsjahr: number | null;
  /** Das Elternkonto, das das Profil verwaltet — für den Rückruf. */
  elternEmail: string;
  einwilligung: Einwilligung;
}

/**
 * Alle Kinder des Vereins mit dem Stand ihrer Bildrechte (Sicht 15b).
 *
 * Nur für die Verwaltung — das entscheidet der Endpunkt. Hier stehen die
 * vollen Namen aller Kinder samt Elternadresse; das ist der Sinn (jemand
 * muss anrufen können) und zugleich der Grund, warum es sonst niemand
 * sieht.
 *
 * `DISTINCT ON` nimmt je Kind die jüngste Zeile — die Tabelle ist nur
 * angehängt, der aktuelle Stand also immer die neueste.
 */
export async function holeAlleKinder(
  db: pg.Pool,
  jetzt: Date,
): Promise<KindMitEinwilligung[]> {
  const { rows } = await db.query<{
    id: string;
    name: string | null;
    geburtsjahr: number | null;
    eltern_email: string;
    status: 'erteilt' | 'abgelehnt' | 'widerrufen' | null;
    text_version: string | null;
    bestaetigt_name: string | null;
    angelegt_am: Date | null;
    jugend_bestaetigt: boolean | null;
    quelle: 'app' | 'forms-import' | null;
  }>(
    `SELECT k.id, k.name, k.geburtsjahr, eltern.email AS eltern_email,
            e.status, e.text_version, b.name AS bestaetigt_name,
            e.angelegt_am, e.jugend_bestaetigt, e.quelle
       FROM mitglied k
       JOIN mitglied eltern ON eltern.id = k.verwaltet_von
       LEFT JOIN LATERAL (
         SELECT * FROM einwilligung_bild
          WHERE kind_id = k.id ORDER BY nr DESC LIMIT 1
       ) e ON true
       LEFT JOIN mitglied b ON b.id = e.bestaetigt_von
      WHERE k.verwaltet_von IS NOT NULL
      ORDER BY k.name NULLS LAST, k.id`,
  );

  return rows.map((z) => ({
    id: z.id,
    name: z.name,
    geburtsjahr: z.geburtsjahr,
    elternEmail: z.eltern_email,
    einwilligung: fasseZusammen(
      z.status
        ? [
            {
              status: z.status,
              text_version: z.text_version!,
              name: z.bestaetigt_name,
              angelegt_am: z.angelegt_am!,
              jugend_bestaetigt: z.jugend_bestaetigt ?? false,
              quelle: z.quelle ?? 'app',
            },
          ]
        : [],
      brauchtEigeneStimme(z.geburtsjahr, jetzt),
    ),
  }));
}
