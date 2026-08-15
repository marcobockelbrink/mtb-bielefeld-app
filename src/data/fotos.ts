/**
 * Fotoalben — Abruf und Upload aus der App.
 *
 * Das Gegenstück zu den `/fotoalbum`- und `/foto`-Endpunkten der API
 * (`api/src/app.ts`). Wie in `jugend.ts` gilt: Die rohen Antworten tragen
 * Zeitpunkte als Zeichenketten, hierüber werden sie zu `Date` — die
 * Bildschirme sollen nie selbst parsen.
 *
 * **Die Bilddaten selbst laufen nicht hier durch.** Ein Raster mit 120
 * Vorschauen lädt über `<Image source={api.bildQuelle(...)}>` direkt; diese
 * Datei liefert nur die Pfade dazu.
 */

import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import type { ApiZugang } from './api';

export type Sichtbarkeit = 'mitglieder' | 'jugend';
export type FotoZustand = 'neu' | 'freigegeben' | 'abgelehnt';

export interface Album {
  id: string;
  titel: string;
  beschreibung: string | null;
  ereignisAm: Date;
  terminSchluessel: string | null;
  sichtbarkeit: Sichtbarkeit;
  zustand: 'offen' | 'geschlossen';
  hochladenBis: Date | null;
  titelbildId: string | null;
}

export interface Foto {
  id: string;
  albumId: string;
  hochgeladenVon: string;
  aufgenommenAm: Date | null;
  hochgeladenAm: Date;
  zustand: FotoZustand;
  fuerHomepage: boolean;
  breite: number | null;
  hoehe: number | null;
}

export interface AlbumMitFotos extends Album {
  fotos: Foto[];
}

interface RohAlbum {
  id: string;
  titel: string;
  beschreibung: string | null;
  ereignisAm: string;
  terminSchluessel: string | null;
  sichtbarkeit: Sichtbarkeit;
  zustand: 'offen' | 'geschlossen';
  hochladenBis: string | null;
  titelbildId: string | null;
}

interface RohFoto {
  id: string;
  albumId: string;
  hochgeladenVon: string;
  aufgenommenAm: string | null;
  hochgeladenAm: string;
  zustand: FotoZustand;
  fuerHomepage: boolean;
  breite: number | null;
  hoehe: number | null;
}

function zuAlbum(roh: RohAlbum): Album {
  return {
    ...roh,
    ereignisAm: new Date(roh.ereignisAm),
    hochladenBis: roh.hochladenBis ? new Date(roh.hochladenBis) : null,
  };
}

function zuFoto(roh: RohFoto): Foto {
  return {
    ...roh,
    aufgenommenAm: roh.aufgenommenAm ? new Date(roh.aufgenommenAm) : null,
    hochgeladenAm: new Date(roh.hochgeladenAm),
  };
}

export async function holeAlben(api: ApiZugang): Promise<Album[]> {
  return (await api.hole<RohAlbum[]>('/fotoalbum')).map(zuAlbum);
}

export async function holeAlbum(api: ApiZugang, id: string): Promise<AlbumMitFotos> {
  const roh = await api.hole<RohAlbum & { fotos: RohFoto[] }>(`/fotoalbum/${id}`);
  return { ...zuAlbum(roh), fotos: roh.fotos.map(zuFoto) };
}

export interface AlbumEingabe {
  titel: string;
  beschreibung?: string | null;
  ereignisAm: Date;
  terminSchluessel?: string | null;
  sichtbarkeit?: Sichtbarkeit;
}

export async function legeAlbumAn(api: ApiZugang, eingabe: AlbumEingabe): Promise<Album> {
  return zuAlbum(await api.sende<RohAlbum>('/fotoalbum', 'POST', eingabe));
}

/** Der Pfad einer Fassung — für `api.bildQuelle(fotoPfad(...))`. */
export function fotoPfad(fotoId: string, fassung: 'vorschau' | 'anzeige' | 'original'): string {
  return `/foto/${fotoId}/${fassung}`;
}

/**
 * Bereitet ein Bild vom Gerät für den Upload vor: JPEG, höchstens 2400 px.
 *
 * **Die App wandelt, nicht der Server** — deshalb bleibt der Server frei
 * von libheif (iPhones liefern HEIC, das Alpine-Abbild kann es nicht), und
 * über die Funkverbindung im Wald gehen 2400 px statt 48-Megapixel-Rohware.
 * Die endgültigen Fassungen (2000/400 px, EXIF raus) rechnet trotzdem der
 * Server — was hier passiert, ist Transportvorbereitung, keine Verarbeitung.
 */
export async function bereiteVor(uri: string): Promise<{ uri: string }> {
  const kontext = ImageManipulator.ImageManipulator.manipulate(uri);
  kontext.resize({ width: 2400 });
  const bild = await kontext.renderAsync();
  const ergebnis = await bild.saveAsync({
    format: ImageManipulator.SaveFormat.JPEG,
    compress: 0.9,
  });
  return { uri: ergebnis.uri };
}

/**
 * Wie groß die vorbereitete Datei ist — für die WLAN-Regel.
 *
 * Gemessen wird die **verkleinerte** Fassung, nicht das Original aus der
 * Mediathek. Scheitert die Messung, gilt 0: Dann lädt die App hoch, statt
 * ein Bild wegen einer misslungenen Messung liegen zu lassen.
 */
export async function groesseVon(uri: string): Promise<number> {
  try {
    const datei = new File(uri);
    return datei.size ?? 0;
  } catch {
    return 0;
  }
}

export type UploadErgebnis = { doppelt: true } | Foto;

/**
 * Lädt ein vorbereitetes Bild hoch.
 *
 * `{doppelt: true}` ist ein Ergebnis, kein Fehler — die API antwortet bei
 * einer schon vorhandenen Datei mit 200, und die Oberfläche soll das als
 * „schon da" zeigen, nicht als rote Meldung.
 */
export async function ladeHoch(
  api: ApiZugang,
  albumId: string,
  uri: string,
): Promise<UploadErgebnis> {
  const formular = new FormData();
  // React Natives FormData nimmt `{uri, name, type}` — kein Blob nötig.
  // Der Dateiname ist bewusst nichtssagend: Der Server vergibt ohnehin
  // Kennungen, und `IMG_4711.jpg` hat in der Anfrage nichts verloren.
  formular.append('datei', {
    uri,
    name: 'bild.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  const antwort = await api.sendeDatei<{ doppelt: true } | RohFoto>(
    `/fotoalbum/${albumId}/fotos`,
    formular,
  );

  return 'doppelt' in antwort ? antwort : zuFoto(antwort);
}

/** Sichten: freigeben oder ablehnen — nur Verwaltung, die API prüft es. */
export async function entscheide(
  api: ApiZugang,
  fotoId: string,
  zustand: 'freigegeben' | 'abgelehnt',
): Promise<Foto> {
  return zuFoto(await api.sende<RohFoto>(`/foto/${fotoId}`, 'PATCH', { zustand }));
}

export async function setzeFuerHomepage(
  api: ApiZugang,
  fotoId: string,
  wert: boolean,
): Promise<Foto> {
  return zuFoto(await api.sende<RohFoto>(`/foto/${fotoId}`, 'PATCH', { fuerHomepage: wert }));
}

export function loescheFoto(api: ApiZugang, fotoId: string): Promise<void> {
  return api.sende<void>(`/foto/${fotoId}`, 'DELETE');
}

export function melde(api: ApiZugang, fotoId: string, grund: string): Promise<void> {
  return api.sende<void>(`/foto/${fotoId}/melden`, 'POST', { grund });
}
