/**
 * Deutschsprachige Aufbereitung von Datum, Uhrzeit und Tourdaten.
 *
 * Alle Zeitangaben werden in Vereinszeit gezeigt. Wer aus dem Urlaub in eine
 * andere Zeitzone schaut, soll trotzdem die Uhrzeit sehen, die am Treffpunkt
 * gilt — alles andere wäre eine Falle.
 */

import { CLUB_TIMEZONE } from '../../config';
import { localDayKey } from '../../data/ical/parseCalendar';
import type { ClubEvent, StarRange } from '../../domain/types';

const timeFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
});

const weekdayLongFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const weekdayShortFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});

const dateWithYearFormat = new Intl.DateTimeFormat('de-DE', {
  timeZone: CLUB_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "18:00" */
export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** "18:00 – 20:00", oder nur die Startzeit, wenn kein sinnvolles Ende bekannt ist. */
export function formatTimeRange(event: ClubEvent): string {
  if (event.allDay) return 'ganztägig';
  const start = formatTime(event.start);
  if (event.end.getTime() <= event.start.getTime()) return start;
  return `${start} – ${formatTime(event.end)}`;
}

/** "Mittwoch, 30. September" */
export function formatLongDate(date: Date): string {
  return weekdayLongFormat.format(date);
}

/** "Mi., 30.09." */
export function formatShortDate(date: Date): string {
  return weekdayShortFormat.format(date);
}

/** "30.09.2026" */
export function formatDateWithYear(date: Date): string {
  return dateWithYearFormat.format(date);
}

/**
 * Überschrift für einen Tag in der Terminliste.
 *
 * "Heute" und "Morgen" sind im Alltag deutlich schneller zu erfassen als ein
 * Datum — gerade das ist die häufigste Frage an die App.
 */
export function formatDayHeading(date: Date, now: Date = new Date()): string {
  const heute = localDayKey(now, CLUB_TIMEZONE);
  const morgen = localDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000), CLUB_TIMEZONE);
  const tag = localDayKey(date, CLUB_TIMEZONE);

  if (tag === heute) return 'Heute';
  if (tag === morgen) return 'Morgen';
  return formatLongDate(date);
}

/** "⭐⭐" bei festem Wert, "⭐ bis ⭐⭐⭐" bei einer Spanne. */
export function formatStars(range: StarRange | undefined): string | null {
  if (!range) return null;
  const stars = (count: number) => '⭐'.repeat(count);
  return range.min === range.max ? stars(range.min) : `${stars(range.min)} bis ${stars(range.max)}`;
}

/**
 * Wie alt die angezeigten Daten sind.
 *
 * Wird eingeblendet, sobald die App aus dem Zwischenspeicher liest — damit
 * niemand einer wochenalten Terminliste vertraut.
 */
export function formatAge(fetchedAt: Date | null, now: Date = new Date()): string {
  if (!fetchedAt) return 'noch nie aktualisiert';

  const minutes = Math.floor((now.getTime() - fetchedAt.getTime()) / 60000);
  if (minutes < 1) return 'gerade aktualisiert';
  if (minutes < 60) return `vor ${minutes} Minute${minutes === 1 ? '' : 'n'}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Stunde${hours === 1 ? '' : 'n'}`;

  const days = Math.floor(hours / 24);
  return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
}

/** Kurze Zusammenfassung der Tourdaten für die Listenkarte, z.B. "22 km · 450 hm". */
export function formatRideSummary(event: ClubEvent): string | null {
  const teile: string[] = [];
  if (event.details.distanceKm) teile.push(`${formatNumber(event.details.distanceKm)} km`);
  if (event.details.elevationM) teile.push(`${formatNumber(event.details.elevationM)} hm`);
  if (event.details.trailShare) teile.push(`Trails: ${event.details.trailShare}`);
  return teile.length > 0 ? teile.join(' · ') : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/**
 * Karten-Adresse für den Treffpunkt.
 *
 * `geo:`-Adressen öffnen auf Android die bevorzugte Karten-App; iOS versteht
 * sie nicht, dort führt der Weg über Apple Karten. Beides erledigt die
 * aufrufende Stelle je nach Plattform.
 */
export function mapsQuery(event: ClubEvent): string | null {
  const ziel = event.location ?? event.details.meetingPoint;
  if (!ziel) return null;
  // Ohne Ortsangabe im Text hilft der Zusatz, damit die Suche in Bielefeld landet.
  return /bielefeld|oerlinghausen|\d{5}/i.test(ziel) ? ziel : `${ziel}, Bielefeld`;
}
