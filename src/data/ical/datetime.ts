/**
 * Liest die Datumsangaben aus iCal-Eigenschaften wie `DTSTART` oder `EXDATE`.
 */

import type { IcalProperty } from './tokenizer.ts';
import { fieldsToWallTime, instantToWallTime, wallTimeToInstant, type WallTime } from './timezone.ts';

export interface IcalDateTime {
  /** Ortszeit — Grundlage für das Ausrechnen von Serienterminen. */
  wall: WallTime;
  /** Zeitzone, in der `wall` gilt. */
  timeZone: string;
  /** Echter Zeitpunkt in Millisekunden seit 1970. */
  instant: number;
  /** Ganztägiger Termin ohne sinnvolle Uhrzeit. */
  allDay: boolean;
}

const DATE_TIME_PATTERN = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/**
 * Zerlegt einen einzelnen Datumswert.
 *
 * Drei Formen kommen im Vereinskalender vor:
 *  - `20231118T103000Z` — fester Zeitpunkt in UTC
 *  - `20230218T100000` mit `TZID=Europe/Berlin` — Ortszeit
 *  - `20230218` mit `VALUE=DATE` — ganztägig
 *
 * Eine Zeitangabe ganz ohne Zeitzone ("floating") gilt laut Norm in der Zeitzone
 * des Betrachters. Für einen Bielefelder Verein ist das praktisch immer die
 * Vereinszeitzone — alles andere würde Termine für Nutzer im Urlaub verschieben.
 */
export function parseDateValue(
  value: string,
  params: Record<string, string>,
  defaultTimeZone: string,
): IcalDateTime | null {
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utcFlag] = match;
  const isDateOnly = params.VALUE === 'DATE' || hour === undefined;
  const wall = fieldsToWallTime({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour ?? 0),
    minute: Number(minute ?? 0),
    second: Number(second ?? 0),
  });

  if (utcFlag) {
    // Bereits ein fester Zeitpunkt. Die Ortszeit leiten wir daraus ab, damit
    // Serientermine auch hier in Ortszeit weitergezählt werden können.
    return {
      wall: instantToWallTime(wall, defaultTimeZone),
      timeZone: defaultTimeZone,
      instant: wall,
      allDay: isDateOnly,
    };
  }

  const timeZone = params.TZID || defaultTimeZone;
  return {
    wall,
    timeZone,
    instant: wallTimeToInstant(wall, timeZone),
    allDay: isDateOnly,
  };
}

/** Wie `parseDateValue`, aber direkt aus einer Eigenschaft. */
export function parseDateProperty(
  property: IcalProperty | undefined,
  defaultTimeZone: string,
): IcalDateTime | null {
  if (!property) return null;
  return parseDateValue(property.value, property.params, defaultTimeZone);
}

/**
 * Liest eine `EXDATE`-Eigenschaft, die mehrere kommagetrennte Termine enthalten
 * kann, und liefert die ausgenommenen Zeitpunkte.
 */
export function parseExceptionDates(
  properties: IcalProperty[],
  defaultTimeZone: string,
): number[] {
  const instants: number[] = [];
  for (const property of properties) {
    if (property.name !== 'EXDATE') continue;
    for (const part of property.value.split(',')) {
      const parsed = parseDateValue(part, property.params, defaultTimeZone);
      if (parsed) instants.push(parsed.instant);
    }
  }
  return instants;
}
