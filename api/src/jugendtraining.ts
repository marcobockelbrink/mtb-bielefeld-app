/**
 * Jugendtrainings — anlegen, ändern, veröffentlichen, absagen.
 *
 * Anders als Touren kommen diese Termine nicht aus dem Vereinskalender,
 * sondern entstehen hier: Ein Guide legt sie an. Das ist die erste Stelle,
 * an der diese API Inhalte **erzeugt**, statt fremde zu spiegeln.
 *
 * Zwei Phasen, und der Übergang ist eine menschliche Entscheidung:
 *
 *   entwurf → veroeffentlicht → (abgesagt)
 *
 * Aus dem Entwurf wird nichts von selbst. Ob zwei Guides für acht Kinder
 * reichen, hängt an Strecke, Alter und Wetter — ein Schwellenwert im Code
 * träfe eine Entscheidung, die Erfahrung braucht. `guides_noetig` ist
 * deshalb eine **Anzeige** für den Guide, keine Bedingung.
 */

import type pg from 'pg';

export type Zustand = 'entwurf' | 'veroeffentlicht' | 'abgesagt';

export interface Training {
  id: string;
  beginntAm: Date;
  endetAm: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  angelegtVon: string;
}

export interface TrainingEingabe {
  beginntAm: Date;
  endetAm?: Date | null;
  ort: string;
  hinweis?: string | null;
  plaetze?: number | null;
  guidesNoetig?: number;
}

interface Zeile {
  id: string;
  beginnt_am: Date;
  endet_am: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guides_noetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  angelegt_von: string;
}

const SPALTEN = `id, beginnt_am, endet_am, ort, hinweis, plaetze,
                 guides_noetig, zustand, absagegrund, angelegt_von`;

function zuTraining(zeile: Zeile): Training {
  return {
    id: zeile.id,
    beginntAm: zeile.beginnt_am,
    endetAm: zeile.endet_am,
    ort: zeile.ort,
    hinweis: zeile.hinweis,
    plaetze: zeile.plaetze,
    guidesNoetig: zeile.guides_noetig,
    zustand: zeile.zustand,
    absagegrund: zeile.absagegrund,
    angelegtVon: zeile.angelegt_von,
  };
}

export async function legeTrainingAn(
  ausfuehrer: pg.Pool | pg.PoolClient,
  eingabe: TrainingEingabe,
  guideId: string,
  jetzt: Date,
): Promise<Training> {
  const { rows } = await ausfuehrer.query<Zeile>(
    `INSERT INTO jugendtraining
       (beginnt_am, endet_am, ort, hinweis, plaetze, guides_noetig,
        angelegt_von, angelegt_am)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 2), $7, $8)
     RETURNING ${SPALTEN}`,
    [
      eingabe.beginntAm,
      eingabe.endetAm ?? null,
      eingabe.ort,
      eingabe.hinweis ?? null,
      eingabe.plaetze ?? null,
      eingabe.guidesNoetig ?? null,
      guideId,
      jetzt,
    ],
  );
  return zuTraining(rows[0]!);
}

export async function holeTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
): Promise<Training | null> {
  // Eine erfundene Kennung ist keine UUID und würde Postgres mit 22P02
  // abbrechen lassen. Das hier abzufangen ist billiger, als jeden Aufrufer
  // eine Ausnahme fangen zu lassen — und die Antwort ist dieselbe wie bei
  // einer gültigen, aber unbekannten Kennung: kein Orakel über Kennungen.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { rows } = await ausfuehrer.query<Zeile>(
    `SELECT ${SPALTEN} FROM jugendtraining WHERE id = $1`,
    [id],
  );
  return rows[0] ? zuTraining(rows[0]) : null;
}

/**
 * Was kommt — vergangenes lassen wir weg.
 *
 * `mitEntwuerfen` entscheidet der **Endpunkt** anhand der Rolle, nicht diese
 * Funktion: Sie soll nichts über Rollen wissen müssen.
 *
 * Abgesagte bleiben sichtbar. Sie verschwinden zu lassen wäre das Gegenteil
 * von hilfreich — wer das Training gestern gesehen hat, hielte das
 * Verschwinden für einen Fehler der App und führe hin.
 */
export async function holeTrainings(
  ausfuehrer: pg.Pool | pg.PoolClient,
  mitEntwuerfen: boolean,
  jetzt: Date,
): Promise<Training[]> {
  const { rows } = await ausfuehrer.query<Zeile>(
    `SELECT ${SPALTEN} FROM jugendtraining
      WHERE COALESCE(endet_am, beginnt_am) >= $1
        AND ($2 OR zustand <> 'entwurf')
      ORDER BY beginnt_am`,
    [jetzt, mitEntwuerfen],
  );
  return rows.map(zuTraining);
}

export async function aendereTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  eingabe: Partial<TrainingEingabe>,
): Promise<Training | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  // `COALESCE` je Spalte statt eines zusammengebauten SET: So bleibt die
  // Abfrage eine feste Zeichenkette, und „nicht angegeben" heißt zuverlässig
  // „unverändert" — auch für Felder, die absichtlich NULL sein dürfen, denn
  // die schickt der Aufrufer dann als expliziten Wert.
  const { rows } = await ausfuehrer.query<Zeile>(
    `UPDATE jugendtraining SET
       beginnt_am    = COALESCE($2, beginnt_am),
       endet_am      = CASE WHEN $3::boolean THEN $4 ELSE endet_am END,
       ort           = COALESCE($5, ort),
       hinweis       = CASE WHEN $6::boolean THEN $7 ELSE hinweis END,
       plaetze       = CASE WHEN $8::boolean THEN $9 ELSE plaetze END,
       guides_noetig = COALESCE($10, guides_noetig)
     WHERE id = $1
     RETURNING ${SPALTEN}`,
    [
      id,
      eingabe.beginntAm ?? null,
      'endetAm' in eingabe,
      eingabe.endetAm ?? null,
      eingabe.ort ?? null,
      'hinweis' in eingabe,
      eingabe.hinweis ?? null,
      'plaetze' in eingabe,
      eingabe.plaetze ?? null,
      eingabe.guidesNoetig ?? null,
    ],
  );
  return rows[0] ? zuTraining(rows[0]) : null;
}

type Uebergang =
  | { ok: true; training: Training }
  | { ok: false; grund: 'unbekannt' | 'falscher-zustand' };

/**
 * Der Zustandswechsel passiert in **einer** Anweisung mit Bedingung.
 *
 * Erst lesen, dann prüfen, dann schreiben hätte ein Fenster: Zwei Guides,
 * die gleichzeitig auf veröffentlichen drücken, kämen beide durch — und die
 * Mail an die Abonnenten ginge zweimal raus. Die Bedingung im `WHERE` lässt
 * genau einen gewinnen.
 */
async function wechsle(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  anweisung: string,
  werte: unknown[],
  erlaubteZustaende: Zustand[],
): Promise<Uebergang> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, grund: 'unbekannt' };

  const { rows } = await ausfuehrer.query<Zeile>(anweisung, [id, ...werte, erlaubteZustaende]);
  if (rows[0]) return { ok: true, training: zuTraining(rows[0]) };

  // Nichts geändert: entweder gibt es das Training nicht, oder es war im
  // falschen Zustand. Die beiden auseinanderzuhalten kostet eine zweite
  // Abfrage und ist es wert — „schon veröffentlicht" und „gibt es nicht"
  // verlangen Verschiedenes vom Guide.
  const vorhanden = await holeTraining(ausfuehrer, id);
  return { ok: false, grund: vorhanden ? 'falscher-zustand' : 'unbekannt' };
}

export function veroeffentliche(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  jetzt: Date,
): Promise<Uebergang> {
  return wechsle(
    ausfuehrer,
    id,
    `UPDATE jugendtraining
        SET zustand = 'veroeffentlicht', veroeffentlicht_am = $2
      WHERE id = $1 AND zustand = ANY($3)
      RETURNING ${SPALTEN}`,
    [jetzt],
    ['entwurf'],
  );
}

export function sageAb(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  grund: string,
  jetzt: Date,
): Promise<Uebergang> {
  return wechsle(
    ausfuehrer,
    id,
    `UPDATE jugendtraining
        SET zustand = 'abgesagt', abgesagt_am = $2, absagegrund = $3
      WHERE id = $1 AND zustand = ANY($4)
      RETURNING ${SPALTEN}`,
    [jetzt, grund],
    ['entwurf', 'veroeffentlicht'],
  );
}

/**
 * Zusage oder Absage eines Guides — ein Datensatz je Guide und Training.
 *
 * `ON CONFLICT` statt Löschen und neu Einfügen: Wer erst zusagt und dann
 * doch nicht kann, drückt auf denselben Knopf, und es soll eine Antwort
 * bleiben, keine zwei.
 *
 * `false` heißt: Das Training gibt es nicht. Der Fremdschlüssel würde sonst
 * eine Ausnahme werfen, die jeder Aufrufer fangen müsste.
 */
export async function setzeGuideAntwort(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  zusage: boolean,
  jetzt: Date,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return false;

  const { rowCount } = await ausfuehrer.query(
    `INSERT INTO jugendtraining_guide (training_id, mitglied_id, zusage, geantwortet_am)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM jugendtraining WHERE id = $1)
     ON CONFLICT (training_id, mitglied_id)
     DO UPDATE SET zusage = EXCLUDED.zusage, geantwortet_am = EXCLUDED.geantwortet_am`,
    [trainingId, mitgliedId, zusage, jetzt],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Wer geantwortet hat — mit Adresse, denn mehr als die Adresse speichert
 * diese API über ein Mitglied nicht.
 *
 * Sichtbar nur für Guides; das entscheidet der Endpunkt.
 */
export async function holeGuideAntworten(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<Array<{ mitgliedId: string; email: string; zusage: boolean }>> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return [];

  const { rows } = await ausfuehrer.query<{
    mitglied_id: string;
    email: string;
    zusage: boolean;
  }>(
    `SELECT g.mitglied_id, m.email, g.zusage
       FROM jugendtraining_guide g
       JOIN mitglied m ON m.id = g.mitglied_id
      WHERE g.training_id = $1
      ORDER BY g.geantwortet_am`,
    [trainingId],
  );
  return rows.map((z) => ({ mitgliedId: z.mitglied_id, email: z.email, zusage: z.zusage }));
}

/** Alle Adressen mit der Rolle `guide` — die Empfänger der Anfrage-Mail. */
export async function holeGuideAdressen(
  ausfuehrer: pg.Pool | pg.PoolClient,
): Promise<string[]> {
  const { rows } = await ausfuehrer.query<{ email: string }>(
    "SELECT email FROM mitglied WHERE rolle = 'guide' ORDER BY email",
  );
  return rows.map((z) => z.email);
}
