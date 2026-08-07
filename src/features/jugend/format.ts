/**
 * Zeitanzeige für Jugendtrainings.
 *
 * Eigene Datei statt Rechnung im Bildschirm: Nur so lässt sich ohne Gerät und
 * in jeder Zeitzone prüfen, dass immer die Vereinszeit erscheint — nach dem
 * Muster von `src/features/events/format.ts`.
 */

import { CLUB_TIMEZONE } from '../../config';
import type { Training } from '../../data/jugend';

const datumFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const zeitFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * "Sonntag, 9. August · 10:30 Uhr", mit Ende "Sonntag, 9. August · 10:30 – 12:30 Uhr".
 *
 * Immer über `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'`, nie über
 * die Zeitzone des Geräts: Ein Telefon, das auf UTC steht, zeigte sonst
 * 08:30 statt 10:30 — und ein Kind stünde zwei Stunden zu früh am Parkplatz.
 */
export function formatiereTrainingszeit(training: Pick<Training, 'beginntAm' | 'endetAm'>): string {
  const datum = datumFormat.format(training.beginntAm);
  const beginn = zeitFormat.format(training.beginntAm);
  const zeit = training.endetAm ? `${beginn} – ${zeitFormat.format(training.endetAm)}` : beginn;
  return `${datum} · ${zeit} Uhr`;
}
