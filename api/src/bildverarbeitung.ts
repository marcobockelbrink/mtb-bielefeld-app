/**
 * Aus einem hochgeladenen Bild werden drei Fassungen — und dabei fliegen die
 * Metadaten raus.
 *
 * ## Die Reihenfolge ist der ganze Trick
 *
 *     Aufnahmezeit lesen → drehen → verkleinern → Metadaten fallen lassen
 *
 * Wer sie ändert, verliert entweder das Datum oder bekommt gekippte Bilder:
 * Die Ausrichtung eines Handyfotos steht **im EXIF**, nicht in den Pixeln.
 * Ein Hochformat-Foto ist in der Datei quer und trägt daneben den Vermerk
 * „bitte um 90° drehen". Entfernt man den Vermerk, ohne ihn vorher
 * anzuwenden, liegt das Bild auf der Seite — und zwar überall dort, wo man
 * es später sieht, aber in keinem Test, der nur Dateigrößen prüft.
 *
 * ## Warum die Metadaten überhaupt weg müssen
 *
 * Handyfotos tragen GPS-Koordinaten, Gerätenamen und Zeitstempel. Ein Bild
 * vom Jugendtraining verrät sonst auf den Meter genau, wo sich regelmäßig
 * Kinder aufhalten. Das ist der Grund, warum diese Datei existiert.
 *
 * **Auch das Original wird gestrippt** — abweichend vom ersten Entwurf, in
 * dem es unverändert bleiben sollte. Denn genau das Original lädt die
 * Verwaltung herunter und stellt es auf die Vereinsseite; bliebe es
 * unangetastet, wären die Koordinaten überall dort, wo sie am wenigsten
 * hingehören. „Original" heißt hier deshalb: volle Auflösung, nicht
 * unveränderte Datei.
 */

import { createHash } from 'node:crypto';

import exifReader from 'exif-reader';
import sharp from 'sharp';

/** Lange Kante je Fassung. `original` behält seine Maße. */
export const KANTEN = { vorschau: 400, anzeige: 2000 } as const;

/**
 * Was hereinkommen darf.
 *
 * HEIC fehlt mit Absicht: Die App wandelt vorher nach JPEG
 * (`expo-image-manipulator`), und damit bleibt der Server frei von
 * `libheif`, das im Alpine-Abbild nicht mitkommt. Käme hier trotzdem HEIC
 * an, ist das ein Fehler der App und keiner, den der Server stillschweigend
 * ausbügeln sollte.
 */
export const ERLAUBTE_FORMATE = new Set(['jpeg', 'png', 'webp']);

/** Mehr als das nimmt niemand mit dem Telefon auf, und was darüber liegt, will etwas anderes. */
export const HOECHSTGROESSE_BYTES = 25 * 1024 * 1024;

export interface Fassungen {
  vorschau: Buffer;
  anzeige: Buffer;
  original: Buffer;
}

export interface VerarbeitetesBild {
  /** SHA-256 der **hochgeladenen** Datei — die Grundlage der Doppelten-Erkennung. */
  pruefsumme: string;
  /** Aus dem EXIF gerettet, bevor es verschwindet. */
  aufgenommenAm: Date | null;
  /** Maße nach dem Drehen, also die, die ein Mensch sieht. */
  breite: number;
  hoehe: number;
  bytes: number;
  fassungen: Fassungen;
}

export class BildFehler extends Error {}

/**
 * Die Aufnahmezeit aus dem EXIF, oder `null`.
 *
 * `DateTimeOriginal` ist der Moment des Auslösens; `DateTime` ist der der
 * letzten Änderung und wäre bei einem durch WhatsApp gelaufenen Bild das
 * Datum der Weiterleitung. Deshalb in dieser Reihenfolge.
 *
 * Der ganze Zugriff steht in einem `try`: `exif-reader` wirft bei
 * beschädigten Blöcken, und ein kaputtes EXIF ist kein Grund, den Upload
 * scheitern zu lassen. Dann ist das Bild eben ohne Datum — sortiert wird
 * hilfsweise nach Hochladezeit.
 */
export function liesAufnahmezeit(exif: Buffer | undefined): Date | null {
  if (!exif) return null;

  try {
    const daten = exifReader(exif);
    const wert = daten?.Photo?.DateTimeOriginal ?? daten?.Image?.DateTime;

    if (wert instanceof Date && !Number.isNaN(wert.getTime())) return wert;
  } catch {
    return null;
  }

  return null;
}

/**
 * Prüft, verarbeitet, liefert drei Fassungen.
 *
 * Wirft `BildFehler` mit einem Satz, der einem Menschen etwas sagt — die
 * Endpunkte reichen ihn als 400 durch. Alles andere wäre ein 500 auf einen
 * Fehler des Aufrufers.
 */
export async function verarbeite(eingabe: Buffer): Promise<VerarbeitetesBild> {
  if (eingabe.length === 0) {
    throw new BildFehler('Die Datei ist leer.');
  }
  if (eingabe.length > HOECHSTGROESSE_BYTES) {
    throw new BildFehler(
      `Das Bild ist größer als ${Math.round(HOECHSTGROESSE_BYTES / 1024 / 1024)} MB.`,
    );
  }

  let kopf;
  try {
    kopf = await sharp(eingabe).metadata();
  } catch {
    throw new BildFehler('Das ist kein Bild, das wir lesen können.');
  }

  if (!kopf.format || !ERLAUBTE_FORMATE.has(kopf.format)) {
    throw new BildFehler(
      `Dieses Format nehmen wir nicht an (${kopf.format ?? 'unbekannt'}). Erlaubt sind JPEG, PNG und WebP.`,
    );
  }

  const aufgenommenAm = liesAufnahmezeit(kopf.exif);

  // `rotate()` ohne Argument wendet die EXIF-Ausrichtung an. Steht sie auf
  // dem Normalwert, kostet der Aufruf nichts; steht sie auf 6 oder 8, ist er
  // der Unterschied zwischen einem Bild und einem gekippten Bild.
  //
  // Kein `withMetadata()` irgendwo: sharp gibt Metadaten nur weiter, wenn man
  // ausdrücklich darum bittet. Das Weglassen **ist** hier das Strippen.
  const gedreht = sharp(eingabe).rotate();

  const [original, anzeige, vorschau] = await Promise.all([
    gedreht.clone().jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true }),
    gedreht
      .clone()
      .resize({ width: KANTEN.anzeige, height: KANTEN.anzeige, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
    gedreht
      .clone()
      .resize({ width: KANTEN.vorschau, height: KANTEN.vorschau, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer(),
  ]);

  return {
    pruefsumme: createHash('sha256').update(eingabe).digest('hex'),
    aufgenommenAm,
    breite: original.info.width,
    hoehe: original.info.height,
    bytes: eingabe.length,
    fassungen: { vorschau, anzeige, original: original.data },
  };
}

/** Kantenlänge eines Profilbilds. Klein, quadratisch, immer gleich. */
export const AVATAR_KANTE = 256;

/**
 * Ein Profilbild: quadratisch zugeschnitten, 256×256, ohne Metadaten.
 *
 * `fit: 'cover'` schneidet die lange Seite ab, statt zu verzerren — ein
 * gestauchtes Gesicht wäre schlimmer als ein knapper Ausschnitt. `position:
 * 'attention'` sucht dabei die interessanteste Stelle statt stur die Mitte;
 * bei Porträts trifft das meist den Kopf.
 *
 * Dieselbe Reihenfolge wie bei den Albumbildern: drehen, dann zuschneiden,
 * dann Metadaten fallen lassen. Auch hier gilt: Handyfotos tragen GPS.
 */
export async function verarbeiteAvatar(eingabe: Buffer): Promise<Buffer> {
  if (eingabe.length === 0) throw new BildFehler('Die Datei ist leer.');
  if (eingabe.length > HOECHSTGROESSE_BYTES) {
    throw new BildFehler('Das Bild ist zu groß.');
  }

  let kopf;
  try {
    kopf = await sharp(eingabe).metadata();
  } catch {
    throw new BildFehler('Das ist kein Bild, das wir lesen können.');
  }
  if (!kopf.format || !ERLAUBTE_FORMATE.has(kopf.format)) {
    throw new BildFehler('Dieses Format nehmen wir nicht an.');
  }

  return sharp(eingabe)
    .rotate()
    .resize(AVATAR_KANTE, AVATAR_KANTE, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 85 })
    .toBuffer();
}
