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

import type { KindEingabe, TrainingEingabe, Zustand } from '../../src/domain/apiVertrag.ts';

// Zustand und die Eingabeformen stehen in `src/domain/apiVertrag.ts`: Die App
// schickt sie, dieser Server erwartet sie — sie müssen übereinstimmen. Standen
// sie doppelt, ließ sich eine Seite ändern, ohne dass eine Prüfung anschlug.
// Hier weitergereicht, damit `app.ts` und die Tests sie wie bisher aus diesem
// Modul beziehen.
export type { KindEingabe, TrainingEingabe, Zustand };

/**
 * Ist das überhaupt eine Kennung?
 *
 * Postgres bricht bei einem Wert, der keine UUID ist, mit 22P02 ab — die
 * Anfrage endete dann in einem 500 mit englischer Datenbankmeldung statt in
 * einem 404. Diese Prüfung fängt das ab, und zwar **vollständig**: Das
 * frühere `/^[0-9a-f-]{36}$/i` ließ sechsunddreißig Bindestriche durch,
 * also genau das, wovor es schützen sollte.
 *
 * An einer Stelle statt neunmal wiederholt: Ein Muster, das an neun Orten
 * steht, wird an acht davon vergessen, wenn es sich einmal ändert.
 */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function istKennung(wert: string): boolean {
  return KENNUNG.test(wert);
}

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
  if (!istKennung(id)) return null;

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
/**
 * `tageZurueck` holt auch Vergangenes dazu — seit dem 16.08.2026.
 *
 * Vorher endete die Liste hart bei „jetzt", und ein Training war am Tag
 * danach spurlos verschwunden. Das sah nach Datenverlust aus, war aber nur
 * ein Filter; gemeldet wurde es als „nach jedem Release sind die Trainings
 * weg". Ein Blick zurück beantwortet auch die häufige Frage „wann war das
 * noch mal?".
 *
 * Begrenzt statt unbegrenzt, damit die Liste nicht über Jahre wächst — wer
 * weiter zurück will, fragt die Verwaltung.
 */
export async function holeTrainings(
  ausfuehrer: pg.Pool | pg.PoolClient,
  mitEntwuerfen: boolean,
  jetzt: Date,
  tageZurueck = 0,
): Promise<Training[]> {
  const grenze = new Date(jetzt.getTime() - tageZurueck * 24 * 60 * 60 * 1000);
  const { rows } = await ausfuehrer.query<Zeile>(
    `SELECT ${SPALTEN} FROM jugendtraining
      WHERE COALESCE(endet_am, beginnt_am) >= $1
        AND ($2 OR zustand <> 'entwurf')
      ORDER BY beginnt_am`,
    [grenze, mitEntwuerfen],
  );
  return rows.map(zuTraining);
}

export async function aendereTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  eingabe: Partial<TrainingEingabe>,
): Promise<Training | null> {
  if (!istKennung(id)) return null;

  // Ein abgesagtes Training bleibt, wie es war. Die Eltern haben die Absage
  // mit Ort und Zeit in der Hand; würde beides danach noch wandern, stünde
  // in ihrer Mail etwas anderes als in der App, und niemand wüsste, was gilt.
  // Wer es doch braucht, legt ein neues an — das kostet zwei Fingertipps und
  // verschickt eine Ankündigung, die auch ankommt.
  //
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
     WHERE id = $1 AND zustand <> 'abgesagt'
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
  if (!istKennung(id)) return { ok: false, grund: 'unbekannt' };

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
 * Der Rückgabewert unterscheidet drei Fälle statt zweier. `'unbekannt'`
 * heißt: Das Training gibt es nicht — der Fremdschlüssel würde sonst eine
 * Ausnahme werfen, die jeder Aufrufer fangen müsste.
 *
 * `'abgesagt'` ist der Fall, der lange fehlte. Der erlaubte Ausgangszustand
 * steht **in der Bedingung der Anweisung**, nicht in einer Prüfung davor —
 * genau wie bei `veroeffentliche`, `sageAb` und `aendereTraining`. Sonst
 * kommt zwischen Lesen und Schreiben eine Absage durch: Guide A öffnet den
 * Bildschirm, Guide B sagt ab, Guide A tippt „Ich kann" — und ein
 * abgesagtes Training hätte eine Zusage. Dass die Oberfläche den Knopf
 * ausblendet, hilft nicht; sie kennt nur den Stand vom letzten Laden.
 *
 * Eine **frühere** Zusage bleibt nach der Absage unangetastet. Sie zu
 * löschen wäre eine zweite Entscheidung, die niemand getroffen hat, und
 * die Absage-Mail braucht die Adressen noch.
 */
export async function setzeGuideAntwort(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  zusage: boolean,
  jetzt: Date,
): Promise<'ok' | 'unbekannt' | 'abgesagt'> {
  if (!istKennung(trainingId)) return 'unbekannt';

  const { rowCount } = await ausfuehrer.query(
    `INSERT INTO jugendtraining_guide (training_id, mitglied_id, zusage, geantwortet_am)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM jugendtraining WHERE id = $1 AND zustand <> 'abgesagt')
     ON CONFLICT (training_id, mitglied_id)
     DO UPDATE SET zusage = EXCLUDED.zusage, geantwortet_am = EXCLUDED.geantwortet_am`,
    [trainingId, mitgliedId, zusage, jetzt],
  );
  if ((rowCount ?? 0) > 0) return 'ok';

  // Nichts geschrieben — es gibt zwei Gründe, und der Aufrufer muss sie
  // auseinanderhalten können: „gibt es nicht" ist ein 404, „ist abgesagt"
  // ein 409 mit einem Satz, der erklärt, was inzwischen passiert ist.
  const { rows } = await ausfuehrer.query<{ zustand: string }>(
    'SELECT zustand FROM jugendtraining WHERE id = $1',
    [trainingId],
  );
  return rows.length === 0 ? 'unbekannt' : 'abgesagt';
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
  if (!istKennung(trainingId)) return [];

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
    // Verwaltung erbt die Guide-Rechte (rolle.ts) — und damit auch die
    // Anfrage-Mails: Wer zusagen kann, muss gefragt werden.
    "SELECT email FROM mitglied WHERE rolle IN ('guide', 'verwaltung') ORDER BY email",
  );
  return rows.map((z) => z.email);
}

/** Wie lange auf die Sperre gewartet wird, bevor abgebrochen wird. */
const SPERR_ZEITSCHRANKE = '3s';

export type Anmeldeergebnis =
  | { ok: true; kindId: string; belegt: number }
  | { ok: false; grund: 'unbekannt' | 'nicht-offen' | 'vorbei' | 'voll' | 'schon-zwei' };

export async function holeBelegungTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<number> {
  if (!istKennung(trainingId)) return 0;
  const { rows } = await ausfuehrer.query<{ belegt: string }>(
    `SELECT count(*) AS belegt FROM jugendtraining_kind
      WHERE training_id = $1 AND storniert_am IS NULL`,
    [trainingId],
  );
  return Number(rows[0]?.belegt ?? 0);
}

/**
 * Ein Kind eintragen.
 *
 * Gesperrt wird je Training mit `pg_advisory_xact_lock`, genau wie bei der
 * Tourenanmeldung und aus demselben Grund: Ohne Sperre könnten zwei
 * gleichzeitige Anfragen beide die Platzprüfung bestehen und ein volles
 * Training überbuchen.
 *
 * Die Grenze von zwei Kindern je Konto steht dagegen **nicht** im Code,
 * sondern im Teilindex `jugendtraining_kind_hoechstens_zwei`: `platz` ist
 * der erste freie Wert aus (1, 2), und mehr gibt es nicht. Eine Zählung im
 * Code hätten zwei gleichzeitige Anfragen beide bestanden.
 */
export async function meldeKindAn(
  pool: pg.Pool,
  trainingId: string,
  mitgliedId: string,
  kind: KindEingabe,
  jetzt: Date,
): Promise<Anmeldeergebnis> {
  const training = await holeTraining(pool, trainingId);
  if (!training) return { ok: false, grund: 'unbekannt' };
  if (training.zustand !== 'veroeffentlicht') return { ok: false, grund: 'nicht-offen' };

  // Wer noch am Parkplatz steht, soll sich eintragen können; wer sich zu
  // einem Training vom letzten Monat anmeldet, nicht.
  const ende = training.endetAm ?? training.beginntAm;
  if (ende.getTime() < jetzt.getTime()) return { ok: false, grund: 'vorbei' };

  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    await verbindung.query(`SET LOCAL lock_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query(`SET LOCAL statement_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `jugendtraining:${trainingId}`,
    ]);

    const belegt = await holeBelegungTraining(verbindung, trainingId);
    if (training.plaetze !== null && belegt >= training.plaetze) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'voll' };
    }

    // Der erste freie Platz aus (1, 2). Gibt es keinen, war das Konto schon
    // mit zwei Kindern da.
    const { rows: frei } = await verbindung.query<{ platz: number }>(
      `SELECT p.platz FROM (VALUES (1), (2)) AS p(platz)
        WHERE NOT EXISTS (
          SELECT 1 FROM jugendtraining_kind k
           WHERE k.training_id = $1 AND k.mitglied_id = $2
             AND k.platz = p.platz AND k.storniert_am IS NULL)
        ORDER BY p.platz LIMIT 1`,
      [trainingId, mitgliedId],
    );
    const platz = frei[0]?.platz;
    if (platz === undefined) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'schon-zwei' };
    }

    const { rows } = await verbindung.query<{ id: string }>(
      `INSERT INTO jugendtraining_kind
         (training_id, mitglied_id, vorname, nachname, platz,
          zeigt_vorname, zeigt_nachname, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        trainingId,
        mitgliedId,
        kind.vorname.trim(),
        kind.nachname.trim(),
        platz,
        kind.zeigtVorname,
        kind.zeigtNachname,
        jetzt,
      ],
    );
    await verbindung.query('COMMIT');
    return { ok: true, kindId: rows[0]!.id, belegt: belegt + 1 };
  } catch (fehler) {
    await verbindung.query('ROLLBACK').catch(() => {});
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Ein Kind abmelden — nur das eigene.
 *
 * `mitglied_id` steht in der Bedingung, nicht in einer Prüfung davor: Sonst
 * könnte jedes Mitglied fremde Kinder austragen, und die Prüfung davor wäre
 * eine Stelle, die jemand später „vereinfacht".
 */
export async function meldeKindAb(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  kindId: string,
  jetzt: Date,
): Promise<boolean> {
  // Beide Kennungen prüfen, nicht nur die des Kindes: Steht in der Adresse
  // ein unbrauchbarer Trainingswert, bricht Postgres mit 22P02 ab und aus
  // dem 404 wird ein 500 mit englischer Datenbankmeldung.
  if (!istKennung(kindId) || !istKennung(trainingId)) return false;
  const { rowCount } = await ausfuehrer.query(
    `UPDATE jugendtraining_kind SET storniert_am = $4
      WHERE id = $3 AND training_id = $1 AND mitglied_id = $2
        AND storniert_am IS NULL`,
    [trainingId, mitgliedId, kindId, jetzt],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Die Teilnehmerliste.
 *
 * `alsGuide` entscheidet der Endpunkt anhand der Rolle. Gespeichert ist immer
 * der volle Name; die Wahl der Eltern steuert ausschließlich, was **andere
 * Mitglieder** sehen.
 *
 * Ein Kind ohne jede Freigabe erscheint als „ein Kind" statt zu fehlen: Sonst
 * stimmte die Liste nicht mit der Zahl überein, und jemand hielte das für
 * einen Fehler.
 */
export async function holeKinder(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  alsGuide: boolean,
  fragenderId: string,
): Promise<Array<{ id: string; anzeige: string; eigene: boolean }>> {
  if (!istKennung(trainingId)) return [];

  const { rows } = await ausfuehrer.query<{
    id: string;
    vorname: string;
    nachname: string;
    zeigt_vorname: boolean;
    zeigt_nachname: boolean;
    eigene: boolean;
  }>(
    `SELECT id, vorname, nachname, zeigt_vorname, zeigt_nachname,
            mitglied_id = $2 AS eigene
       FROM jugendtraining_kind
      WHERE training_id = $1 AND storniert_am IS NULL
      ORDER BY angelegt_am, id`,
    [trainingId, fragenderId],
  );

  return rows.map((z) => {
    // `eigene` und die Namenssichtbarkeit sind zwei verschiedene Fragen und
    // dürfen nicht zusammenfallen: Die Guide-Rolle gibt Sichtbarkeit, nicht
    // Besitz. Ein Guide sieht deshalb bei fremden Kindern den vollen Namen
    // **und** `eigene: false` — abmelden darf er sie trotzdem nicht, das
    // steht in `meldeKindAb` in der `WHERE`-Bedingung.
    const eigene = z.eigene;

    // **Dem Anfragenden das eigene Kind ungefiltert zeigen.** Die Freigabe
    // regelt, was *andere* sehen — sich selbst gegenüber verbirgt niemand
    // einen Namen, den er eben eingetippt hat. Ohne diese Zeile stünden bei
    // zwei datensparsam angemeldeten Kindern zwei Knöpfe „ein Kind abmelden"
    // nebeneinander, und ein Elternteil hätte beim Austragen die Wahl
    // zwischen zwei nicht unterscheidbaren Möglichkeiten.
    if (alsGuide || eigene) return { id: z.id, anzeige: `${z.vorname} ${z.nachname}`, eigene };
    const teile = [z.zeigt_vorname ? z.vorname : null, z.zeigt_nachname ? z.nachname : null];
    const anzeige = teile.filter(Boolean).join(' ');
    return { id: z.id, anzeige: anzeige || 'ein Kind', eigene };
  });
}

/** Die Adressen der Konten, die Kinder angemeldet haben — für die Absage-Mail. */
export async function holeElternAdressen(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<string[]> {
  if (!istKennung(trainingId)) return [];
  const { rows } = await ausfuehrer.query<{ email: string }>(
    `SELECT DISTINCT m.email
       FROM jugendtraining_kind k JOIN mitglied m ON m.id = k.mitglied_id
      WHERE k.training_id = $1 AND k.storniert_am IS NULL`,
    [trainingId],
  );
  return rows.map((z) => z.email);
}
