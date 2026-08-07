/**
 * Reine Rechenlogik für das Anlegen-Formular (`app/jugend/neu.tsx`).
 *
 * Ohne React Native, damit sie ohne Gerät prüfbar bleibt — nach demselben
 * Muster wie `src/data/ical/`.
 */

import { CLUB_TIMEZONE } from '../../config';
import { fieldsToWallTime, wallTimeToFields, wallTimeToInstant } from '../../data/ical/timezone';

const DATUM = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const UHRZEIT = /^(\d{1,2}):(\d{2})$/;

/**
 * Datum ("10.08.2026") und Uhrzeit ("10:30") aus dem Formular zu einem
 * echten Zeitpunkt — in Bielefelder Ortszeit gerechnet, nicht in der
 * Zeitzone des Geräts (siehe `src/data/ical/timezone.ts`, dieselbe
 * Begründung wie beim MittwochsRudel: Ein Gerät auf UTC legte sonst ein
 * Training zwei Stunden zu früh an).
 *
 * `null` bei jeder Eingabe, die nicht dem Muster entspricht oder kein
 * echtes Datum ergibt (etwa "31.02.2026") — das Formular zeigt dann seinen
 * eigenen Hinweis, statt eine kaputte Zeit an die API zu schicken.
 */
export function leseZeitpunkt(datum: string, uhrzeit: string): Date | null {
  const dMatch = DATUM.exec(datum.trim());
  const uMatch = UHRZEIT.exec(uhrzeit.trim());
  if (!dMatch || !uMatch) return null;

  const tag = Number(dMatch[1]);
  const monat = Number(dMatch[2]);
  const jahr = Number(dMatch[3]);
  const stunde = Number(uMatch[1]);
  const minute = Number(uMatch[2]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31 || stunde > 23 || minute > 59) return null;

  const wall = fieldsToWallTime({ year: jahr, month: monat, day: tag, hour: stunde, minute, second: 0 });
  // `Date.UTC` normalisiert einen Tag wie den 31. Februar klaglos in den
  // März — die Probe zurück deckt das auf, statt ein anderes Datum
  // anzulegen als eingetippt wurde.
  const zurueck = wallTimeToFields(wall);
  if (zurueck.year !== jahr || zurueck.month !== monat || zurueck.day !== tag) return null;

  return new Date(wallTimeToInstant(wall, CLUB_TIMEZONE));
}

/**
 * Ein optionales Zahlenfeld ("Plätze", "Benötigte Guides"): leer bedeutet
 * bewusst nichts angeben (unbegrenzt bzw. der Standard der API), nicht null
 * im Sinn von "ungültig". Deshalb drei Ausgänge statt zweier — eine leere
 * Eingabe und eine kaputte Eingabe dürfen sich nicht gleich verhalten, sonst
 * würde "abc" stillschweigend als "unbegrenzt" ankommen.
 */
export function leseOptionaleAnzahl(text: string): number | null | 'ungueltig' {
  const getrimmt = text.trim();
  if (getrimmt === '') return null;
  const zahl = Number(getrimmt);
  return Number.isInteger(zahl) && zahl > 0 ? zahl : 'ungueltig';
}
