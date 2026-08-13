/**
 * Fotoalben — wer darf was sehen, hochladen, löschen.
 *
 * Der obere Teil dieser Datei ist **reine Rechenlogik**: kein Fastify, keine
 * Datenbank, kein Dateisystem. Dasselbe Muster wie `aufraeumen.ts` gegenüber
 * `server.ts`. Das ist hier wichtiger als anderswo, denn an diesen drei
 * Funktionen hängt, ob ein Bild jemandem gezeigt wird, der es nicht sehen
 * soll — und das ist der eine Fehler, den man diesem Feature nicht verzeihen
 * würde.
 *
 * Darunter die Datenbankzugriffe.
 */

import type pg from 'pg';

import type { Rolle } from './rolle.ts';

export type Sichtbarkeit = 'mitglieder' | 'jugend';
export type AlbumZustand = 'offen' | 'geschlossen';
export type FotoZustand = 'neu' | 'freigegeben' | 'abgelehnt';
export type Fassung = 'vorschau' | 'anzeige' | 'original';

/**
 * Wer fragt.
 *
 * `gehoertZurJugend` kommt **von außen** und wird hier nicht hergeleitet.
 * Wen der Verein zur Jugend zählt — Eltern angemeldeter Kinder, eine eigene
 * Liste, die Trainingsgruppe —, ist eine Vereinsfrage und noch offen. Sie
 * hier zu beantworten hieße, sie im Quelltext zu entscheiden; so steht die
 * Antwort an einer Stelle und lässt sich ändern, ohne die Sichtbarkeit
 * anzufassen.
 */
export interface Betrachter {
  id: string;
  rolle: Rolle;
  gehoertZurJugend: boolean;
}

export interface Album {
  id: string;
  titel: string;
  beschreibung: string | null;
  ereignisAm: Date;
  terminSchluessel: string | null;
  sichtbarkeit: Sichtbarkeit;
  zustand: AlbumZustand;
  hochladenBis: Date | null;
  titelbildId: string | null;
  angelegtVon: string;
}

export interface Foto {
  id: string;
  albumId: string;
  hochgeladenVon: string;
  hochgeladenAm: Date;
  aufgenommenAm: Date | null;
  zustand: FotoZustand;
  fuerHomepage: boolean;
  pruefsumme: string;
  bytes: number;
  breite: number | null;
  hoehe: number | null;
}

// --- Die drei Entscheidungen ------------------------------------------------

/**
 * Darf dieser Betrachter dieses Bild sehen?
 *
 * Die Reihenfolge der Fälle ist Absicht und nicht beliebig:
 *
 * 1. **Verwaltung sieht alles.** Sie muss sichten können, und was sie nicht
 *    sieht, kann sie nicht löschen.
 * 2. **Das eigene Bild sieht man immer** — auch unfreigegeben. Sonst lädt
 *    jemand zehn Bilder hoch, sieht nichts und lädt sie noch einmal hoch.
 * 3. **Alles Übrige muss freigegeben sein.** `neu` und `abgelehnt` sind für
 *    Fremde nicht vorhanden.
 * 4. **Erst dann** entscheidet die Sichtbarkeit des Albums.
 *
 * Guides sehen bei `jugend` mit: Sie leiten die Trainings, aus denen die
 * Bilder stammen. Ein Guide, der die Fotos seines eigenen Trainings nicht
 * öffnen kann, hielte das zu Recht für einen Fehler.
 */
export function darfSehen(
  betrachter: Betrachter,
  album: Pick<Album, 'sichtbarkeit'>,
  foto: Pick<Foto, 'hochgeladenVon' | 'zustand'>,
): boolean {
  if (betrachter.rolle === 'verwaltung') return true;
  if (foto.hochgeladenVon === betrachter.id) return true;
  if (foto.zustand !== 'freigegeben') return false;
  if (album.sichtbarkeit === 'mitglieder') return true;

  return betrachter.gehoertZurJugend || betrachter.rolle === 'guide';
}

/**
 * Nimmt dieses Album noch Bilder an?
 *
 * Zwei Bedingungen, und beide müssen stimmen: Das Album ist `offen`, und das
 * Zeitfenster ist nicht abgelaufen. Ein Album ohne `hochladenBis` hat kein
 * Fenster — das ist kein Versehen, sondern der Normalfall für freie Alben,
 * bei denen niemand ein Ereignisdatum als Bezugspunkt hat.
 */
export function darfHochladen(
  album: Pick<Album, 'zustand' | 'hochladenBis'>,
  jetzt: Date,
): boolean {
  if (album.zustand !== 'offen') return false;
  if (album.hochladenBis === null) return true;

  return jetzt.getTime() <= album.hochladenBis.getTime();
}

/**
 * Darf dieser Betrachter dieses Bild löschen?
 *
 * Die Verwaltung immer — das ist ausdrückliche Anforderung des Vereins und
 * gilt ohne Einschränkung und ohne Begründungszwang.
 *
 * Der Hochladende nur, solange das Bild `neu` ist. Danach hat jemand darüber
 * entschieden, und ein Bild, das in einem freigegebenen Album steht und
 * womöglich schon auf der Vereinsseite gelandet ist, verschwindet nicht mehr
 * auf Zuruf dessen, der es eingestellt hat. Wer es trotzdem weg haben will,
 * nimmt den Melden-Knopf.
 */
export function darfLoeschen(
  betrachter: Betrachter,
  foto: Pick<Foto, 'hochgeladenVon' | 'zustand'>,
): boolean {
  if (betrachter.rolle === 'verwaltung') return true;

  return foto.hochgeladenVon === betrachter.id && foto.zustand === 'neu';
}

// --- Kleinere Regeln --------------------------------------------------------

/** Alben legen Guides und Verwaltung an, nicht jedes Mitglied. */
export function darfAlbumAnlegen(rolle: Rolle): boolean {
  return rolle === 'guide' || rolle === 'verwaltung';
}

/** Sichten — freigeben, ablehnen, für die Homepage markieren — nur Verwaltung. */
export function darfSichten(rolle: Rolle): boolean {
  return rolle === 'verwaltung';
}

/**
 * Das Original bekommt nur, wer es weiterverwenden soll.
 *
 * Die App zeigt `anzeige`; die volle Auflösung braucht allein die Verwaltung
 * für die Vereinsseite. Sie allen zu geben, hieße jedem Mitglied eine
 * Kopiervorlage in Originalqualität zu reichen — genau das, was der Verein
 * mit dem Weg von Google Fotos hinter sich lassen wollte.
 */
export function darfFassungSehen(rolle: Rolle, fassung: Fassung): boolean {
  return fassung !== 'original' || rolle === 'verwaltung';
}

/**
 * Ist das überhaupt eine Kennung?
 *
 * Wortgleich zu `jugendtraining.ts` — Postgres bricht bei einem Wert, der
 * keine UUID ist, mit 22P02 ab, und die Anfrage endete dann in einem 500 mit
 * englischer Datenbankmeldung statt in einem 404.
 */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istKennung(wert: string): boolean {
  return KENNUNG.test(wert);
}

// --- Datenbank --------------------------------------------------------------

interface AlbumZeile {
  id: string;
  titel: string;
  beschreibung: string | null;
  ereignis_am: Date;
  termin_schluessel: string | null;
  sichtbarkeit: Sichtbarkeit;
  zustand: AlbumZustand;
  hochladen_bis: Date | null;
  titelbild_id: string | null;
  angelegt_von: string;
}

function zuAlbum(zeile: AlbumZeile): Album {
  return {
    id: zeile.id,
    titel: zeile.titel,
    beschreibung: zeile.beschreibung,
    ereignisAm: zeile.ereignis_am,
    terminSchluessel: zeile.termin_schluessel,
    sichtbarkeit: zeile.sichtbarkeit,
    zustand: zeile.zustand,
    hochladenBis: zeile.hochladen_bis,
    titelbildId: zeile.titelbild_id,
    angelegtVon: zeile.angelegt_von,
  };
}

export interface AlbumEingabe {
  titel: string;
  beschreibung?: string | null;
  ereignisAm: Date;
  terminSchluessel?: string | null;
  sichtbarkeit?: Sichtbarkeit;
  hochladenBis?: Date | null;
}

export async function legeAlbumAn(
  db: pg.Pool,
  eingabe: AlbumEingabe,
  angelegtVon: string,
): Promise<Album> {
  const { rows } = await db.query<AlbumZeile>(
    `INSERT INTO fotoalbum
       (titel, beschreibung, ereignis_am, termin_schluessel, sichtbarkeit,
        hochladen_bis, angelegt_von)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'mitglieder'), $6, $7)
     RETURNING *`,
    [
      eingabe.titel.trim(),
      eingabe.beschreibung ?? null,
      eingabe.ereignisAm,
      eingabe.terminSchluessel ?? null,
      eingabe.sichtbarkeit ?? null,
      eingabe.hochladenBis ?? null,
      angelegtVon,
    ],
  );

  return zuAlbum(rows[0]!);
}

export async function holeAlbum(db: pg.Pool, id: string): Promise<Album | null> {
  if (!istKennung(id)) return null;

  const { rows } = await db.query<AlbumZeile>(
    'SELECT * FROM fotoalbum WHERE id = $1',
    [id],
  );

  return rows[0] ? zuAlbum(rows[0]) : null;
}

export async function holeAlben(db: pg.Pool): Promise<Album[]> {
  const { rows } = await db.query<AlbumZeile>(
    'SELECT * FROM fotoalbum ORDER BY ereignis_am DESC, titel',
  );

  return rows.map(zuAlbum);
}

export interface AlbumAenderung {
  titel?: string;
  beschreibung?: string | null;
  sichtbarkeit?: Sichtbarkeit;
  zustand?: AlbumZustand;
  hochladenBis?: Date | null;
  titelbildId?: string | null;
}

export async function aendereAlbum(
  db: pg.Pool,
  id: string,
  aenderung: AlbumAenderung,
): Promise<Album | null> {
  if (!istKennung(id)) return null;

  // COALESCE statt zusammengesetztem SQL: Was nicht mitgeschickt wurde,
  // bleibt stehen. Ein dynamisch gebautes SET wäre kürzer und die Stelle,
  // an der irgendwann ein Feldname aus einer Anfrage in die Abfrage rutscht.
  const { rows } = await db.query<AlbumZeile>(
    `UPDATE fotoalbum SET
       titel         = COALESCE($2, titel),
       beschreibung  = CASE WHEN $3::boolean THEN $4 ELSE beschreibung END,
       sichtbarkeit  = COALESCE($5, sichtbarkeit),
       zustand       = COALESCE($6, zustand),
       hochladen_bis = CASE WHEN $7::boolean THEN $8 ELSE hochladen_bis END,
       titelbild_id  = CASE WHEN $9::boolean THEN $10 ELSE titelbild_id END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      aenderung.titel?.trim() ?? null,
      aenderung.beschreibung !== undefined,
      aenderung.beschreibung ?? null,
      aenderung.sichtbarkeit ?? null,
      aenderung.zustand ?? null,
      aenderung.hochladenBis !== undefined,
      aenderung.hochladenBis ?? null,
      aenderung.titelbildId !== undefined,
      aenderung.titelbildId ?? null,
    ],
  );

  return rows[0] ? zuAlbum(rows[0]) : null;
}

export async function loescheAlbum(db: pg.Pool, id: string): Promise<boolean> {
  if (!istKennung(id)) return false;

  const { rowCount } = await db.query('DELETE FROM fotoalbum WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

// --- Fotos ------------------------------------------------------------------

interface FotoZeile {
  id: string;
  album_id: string;
  hochgeladen_von: string;
  hochgeladen_am: Date;
  aufgenommen_am: Date | null;
  zustand: FotoZustand;
  fuer_homepage: boolean;
  pruefsumme: string;
  bytes: string | number;
  breite: number | null;
  hoehe: number | null;
}

function zuFoto(zeile: FotoZeile): Foto {
  return {
    id: zeile.id,
    albumId: zeile.album_id,
    hochgeladenVon: zeile.hochgeladen_von,
    hochgeladenAm: zeile.hochgeladen_am,
    aufgenommenAm: zeile.aufgenommen_am,
    zustand: zeile.zustand,
    fuerHomepage: zeile.fuer_homepage,
    pruefsumme: zeile.pruefsumme,
    // `bigint` kommt als Zeichenkette aus pg — sonst stünde hier bei großen
    // Werten stillschweigend etwas Falsches.
    bytes: Number(zeile.bytes),
    breite: zeile.breite,
    hoehe: zeile.hoehe,
  };
}

export interface FotoEingabe {
  albumId: string;
  hochgeladenVon: string;
  aufgenommenAm: Date | null;
  pruefsumme: string;
  bytes: number;
  breite: number;
  hoehe: number;
}

/**
 * Legt die Zeile an — oder meldet `doppelt`.
 *
 * `ON CONFLICT DO NOTHING` statt einer vorherigen Abfrage: Zwei gleichzeitige
 * Uploads derselben Datei bestünden eine Zählung beide und scheiterten dann
 * am Index. So entscheidet die Datenbank, und der Zweite bekommt eine
 * Antwort statt eines 500.
 */
export async function legeFotoAn(
  db: pg.Pool,
  eingabe: FotoEingabe,
): Promise<Foto | 'doppelt'> {
  const { rows } = await db.query<FotoZeile>(
    `INSERT INTO foto
       (album_id, hochgeladen_von, aufgenommen_am, pruefsumme, bytes, breite, hoehe)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (album_id, pruefsumme) DO NOTHING
     RETURNING *`,
    [
      eingabe.albumId,
      eingabe.hochgeladenVon,
      eingabe.aufgenommenAm,
      eingabe.pruefsumme,
      eingabe.bytes,
      eingabe.breite,
      eingabe.hoehe,
    ],
  );

  return rows[0] ? zuFoto(rows[0]) : 'doppelt';
}

export async function holeFoto(db: pg.Pool, id: string): Promise<Foto | null> {
  if (!istKennung(id)) return null;

  const { rows } = await db.query<FotoZeile>('SELECT * FROM foto WHERE id = $1', [id]);
  return rows[0] ? zuFoto(rows[0]) : null;
}

/**
 * Alle Bilder eines Albums, nach Aufnahmezeit.
 *
 * `NULLS LAST`: Bilder ohne EXIF-Datum ans Ende statt an den Anfang. Ein
 * Album, das mit den datenlosen beginnt, sieht nach einem Fehler aus.
 */
export async function holeFotos(db: pg.Pool, albumId: string): Promise<Foto[]> {
  if (!istKennung(albumId)) return [];

  const { rows } = await db.query<FotoZeile>(
    `SELECT * FROM foto WHERE album_id = $1
     ORDER BY aufgenommen_am ASC NULLS LAST, hochgeladen_am ASC`,
    [albumId],
  );

  return rows.map(zuFoto);
}

export async function entscheideUeberFoto(
  db: pg.Pool,
  id: string,
  zustand: Exclude<FotoZustand, 'neu'>,
  entschiedenVon: string,
  jetzt: Date,
): Promise<Foto | null> {
  if (!istKennung(id)) return null;

  // Beim Ablehnen fällt die Homepage-Markierung mit — die Prüfbedingung in
  // der Datenbank verlangt es, und inhaltlich wäre alles andere ein Bild,
  // das abgelehnt ist und trotzdem auf der Vereinsseite steht.
  const { rows } = await db.query<FotoZeile>(
    `UPDATE foto
        SET zustand = $2, entschieden_von = $3, entschieden_am = $4,
            fuer_homepage = CASE WHEN $2 = 'freigegeben' THEN fuer_homepage ELSE false END
      WHERE id = $1
      RETURNING *`,
    [id, zustand, entschiedenVon, jetzt],
  );

  return rows[0] ? zuFoto(rows[0]) : null;
}

export async function setzeFuerHomepage(
  db: pg.Pool,
  id: string,
  wert: boolean,
): Promise<Foto | null> {
  if (!istKennung(id)) return null;

  const { rows } = await db.query<FotoZeile>(
    `UPDATE foto SET fuer_homepage = $2
      WHERE id = $1 AND (zustand = 'freigegeben' OR $2 = false)
      RETURNING *`,
    [id, wert],
  );

  return rows[0] ? zuFoto(rows[0]) : null;
}

export async function loescheFoto(db: pg.Pool, id: string): Promise<boolean> {
  if (!istKennung(id)) return false;

  const { rowCount } = await db.query('DELETE FROM foto WHERE id = $1', [id]);
  return (rowCount ?? 0) > 0;
}

/** Eine Meldung je Mitglied und Bild; die zweite fällt still weg. */
export async function meldeFoto(
  db: pg.Pool,
  fotoId: string,
  mitgliedId: string,
  grund: string | null,
): Promise<boolean> {
  if (!istKennung(fotoId)) return false;

  const { rowCount } = await db.query(
    `INSERT INTO foto_meldung (foto_id, mitglied_id, grund)
     VALUES ($1, $2, $3)
     ON CONFLICT (foto_id, mitglied_id) DO NOTHING`,
    [fotoId, mitgliedId, grund],
  );

  return (rowCount ?? 0) > 0;
}

/**
 * Wer zählt zur Jugend?
 *
 * **Diese Antwort ist vorläufig** und steht bewusst an genau einer Stelle:
 * Wer schon einmal ein Kind zu einem Jugendtraining angemeldet hat, gehört
 * dazu. Das ist die einzige Verbindung zur Jugend, die diese Datenbank heute
 * kennt — mehr wäre erfunden.
 *
 * Fällt im Verein eine andere Festlegung (eine gepflegte Liste, eine eigene
 * Rolle, die Trainingsgruppe), ändert sich diese Funktion und sonst nichts.
 * Darum nimmt `darfSehen` das Ergebnis als Angabe entgegen, statt es selbst
 * herzuleiten.
 */
export async function gehoertZurJugend(db: pg.Pool, mitgliedId: string): Promise<boolean> {
  // Seit Migration 014 gibt es die ausdrückliche Zuteilung durch die
  // Verwaltung (`mitglied.jugend`); die Herleitung über angemeldete Kinder
  // bleibt als ODER — Eltern sollen die Bilder ihrer Kinder sehen, ohne
  // dass jemand daran denken muss, ihnen ein Häkchen zu setzen.
  const { rowCount } = await db.query(
    `SELECT 1 FROM mitglied WHERE id = $1 AND jugend
     UNION ALL
     SELECT 1 FROM jugendtraining_kind WHERE mitglied_id = $1
     LIMIT 1`,
    [mitgliedId],
  );

  return (rowCount ?? 0) > 0;
}
