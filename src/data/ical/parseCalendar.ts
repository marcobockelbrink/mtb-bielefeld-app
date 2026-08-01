/**
 * Baut aus einer iCalendar-Datei die Terminliste der App.
 *
 * Der schwierige Teil sind Serien. Google Kalender speichert sie als
 * Haupttermin mit `RRULE` plus zwei Sorten Abweichungen:
 *  - `EXDATE` — ein Einzeltermin der Serie fällt aus
 *  - eigener Eintrag mit `RECURRENCE-ID` — ein Einzeltermin wurde geändert,
 *    etwa verschoben oder umbenannt ("MittwochsRudel -NEUE ABFAHRTSZEIT 17Uhr-")
 *
 * Beides muss berücksichtigt werden, sonst zeigt die App Termine an, die es
 * nicht gibt, oder die falsche Uhrzeit.
 */

import {
  CLUB_TIMEZONE,
  EXPANSION_WINDOW_DAYS_FUTURE,
  EXPANSION_WINDOW_DAYS_PAST,
} from '../../config';
import type { ClubEvent } from '../../domain/types';
import { classifyCategory, classifyLevels, cleanTitle, isCancelled, isLadiesOnly } from '../parse/classify';
import { parseRideDetails } from '../parse/description';
import { htmlToText } from '../parse/html';
import { parseDateProperty, parseExceptionDates, type IcalDateTime } from './datetime';
import { expandRecurrence, parseRecurrenceRule, type RecurrenceRule } from './rrule';
import { instantToWallTime } from './timezone';
import { extractComponents, parseProperties, unescapeText, type IcalProperty } from './tokenizer';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fällt `DTEND` aus, nimmt die Norm eine Stunde an — passt zu den Vereinsterminen. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

interface RawEvent {
  uid: string;
  summary: string;
  descriptionHtml: string;
  location?: string;
  status?: string;
  start: IcalDateTime;
  durationMs: number;
  rule: RecurrenceRule | null;
  exceptionInstants: number[];
  /** Gesetzt, wenn dieser Eintrag einen Einzeltermin einer Serie ersetzt. */
  recurrenceInstant: number | null;
}

export interface ParseCalendarOptions {
  /** Bezugszeitpunkt für das Zeitfenster — in Tests fest vorgegeben. */
  now?: Date;
  timeZone?: string;
  windowDaysPast?: number;
  windowDaysFuture?: number;
}

/** Liest den Kalender und liefert die Einzeltermine, aufsteigend nach Startzeit. */
export function parseCalendar(raw: string, options: ParseCalendarOptions = {}): ClubEvent[] {
  const timeZone = options.timeZone ?? CLUB_TIMEZONE;
  const now = options.now ?? new Date();
  const windowStart =
    now.getTime() - (options.windowDaysPast ?? EXPANSION_WINDOW_DAYS_PAST) * DAY_MS;
  const windowEnd =
    now.getTime() + (options.windowDaysFuture ?? EXPANSION_WINDOW_DAYS_FUTURE) * DAY_MS;

  const components = extractComponents(parseProperties(raw), 'VEVENT');
  const rawEvents = components
    .map((component) => toRawEvent(component, timeZone))
    .filter((event): event is RawEvent => event !== null);

  const events: ClubEvent[] = [];
  for (const group of groupByUid(rawEvents)) {
    events.push(...expandGroup(group, timeZone, windowStart, windowEnd));
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}

function findProperty(component: IcalProperty[], name: string): IcalProperty | undefined {
  return component.find((property) => property.name === name);
}

function toRawEvent(component: IcalProperty[], timeZone: string): RawEvent | null {
  const start = parseDateProperty(findProperty(component, 'DTSTART'), timeZone);
  if (!start) return null;

  const uid = findProperty(component, 'UID')?.value ?? `ohne-uid-${start.instant}`;
  const end = parseDateProperty(findProperty(component, 'DTEND'), timeZone);
  const durationMs = end
    ? Math.max(0, end.instant - start.instant)
    : start.allDay
      ? DAY_MS
      : DEFAULT_DURATION_MS;

  const ruleValue = findProperty(component, 'RRULE')?.value;
  const recurrenceId = parseDateProperty(findProperty(component, 'RECURRENCE-ID'), timeZone);

  return {
    uid,
    summary: unescapeText(findProperty(component, 'SUMMARY')?.value ?? ''),
    descriptionHtml: unescapeText(findProperty(component, 'DESCRIPTION')?.value ?? ''),
    location: unescapeText(findProperty(component, 'LOCATION')?.value ?? '') || undefined,
    status: findProperty(component, 'STATUS')?.value,
    start,
    durationMs,
    rule: ruleValue ? parseRecurrenceRule(ruleValue, timeZone) : null,
    exceptionInstants: parseExceptionDates(component, timeZone),
    recurrenceInstant: recurrenceId ? recurrenceId.instant : null,
  };
}

interface EventGroup {
  master: RawEvent | null;
  overrides: RawEvent[];
}

function groupByUid(rawEvents: RawEvent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of rawEvents) {
    let group = groups.get(event.uid);
    if (!group) {
      group = { master: null, overrides: [] };
      groups.set(event.uid, group);
    }
    if (event.recurrenceInstant === null) {
      // Bei doppelten Haupteinträgen gewinnt der zuletzt gelesene.
      group.master = event;
    } else {
      group.overrides.push(event);
    }
  }
  return [...groups.values()];
}

function expandGroup(
  group: EventGroup,
  timeZone: string,
  windowStart: number,
  windowEnd: number,
): ClubEvent[] {
  const { master, overrides } = group;
  const overrideByInstant = new Map<number, RawEvent>();
  for (const override of overrides) {
    if (override.recurrenceInstant !== null) overrideByInstant.set(override.recurrenceInstant, override);
  }

  const events: ClubEvent[] = [];
  const usedOverrides = new Set<number>();

  if (master) {
    const exceptions = new Set(master.exceptionInstants);

    if (master.rule) {
      const instants = expandRecurrence({
        startWall: master.start.wall,
        timeZone: master.start.timeZone,
        rule: master.rule,
        // Etwas Vorlauf, damit ein verschobener Einzeltermin, dessen
        // ursprünglicher Platz knapp vor dem Fenster lag, nicht verloren geht.
        windowStart: windowStart - 7 * DAY_MS,
        windowEnd: windowEnd + 7 * DAY_MS,
      });

      for (const instant of instants) {
        if (exceptions.has(instant)) continue;

        const override = overrideByInstant.get(instant);
        if (override) {
          usedOverrides.add(instant);
          if (isWithin(override.start.instant, windowStart, windowEnd)) {
            events.push(buildEvent(override, override.start.instant, true));
          }
          continue;
        }
        if (isWithin(instant, windowStart, windowEnd)) {
          events.push(buildEvent(master, instant, true));
        }
      }
    } else if (isWithin(master.start.instant, windowStart, windowEnd)) {
      events.push(buildEvent(master, master.start.instant, false));
    }
  }

  // Geänderte Einzeltermine, die oben nicht drankamen — etwa weil der
  // Haupteintrag fehlt oder der Termin aus dem Zeitfenster heraus verschoben
  // wurde. Ohne diesen Schritt würden sie stillschweigend verschwinden.
  for (const override of overrides) {
    if (override.recurrenceInstant !== null && usedOverrides.has(override.recurrenceInstant)) continue;
    if (isWithin(override.start.instant, windowStart, windowEnd)) {
      events.push(buildEvent(override, override.start.instant, true));
    }
  }

  return events;
}

function isWithin(instant: number, windowStart: number, windowEnd: number): boolean {
  return instant >= windowStart && instant <= windowEnd;
}

function buildEvent(raw: RawEvent, startInstant: number, recurring: boolean): ClubEvent {
  const descriptionText = htmlToText(raw.descriptionHtml);
  const title = cleanTitle(raw.summary);

  return {
    id: `${raw.uid}#${startInstant}`,
    uid: raw.uid,
    title: title || 'Termin',
    start: new Date(startInstant),
    end: new Date(startInstant + raw.durationMs),
    allDay: raw.start.allDay,
    location: raw.location,
    descriptionHtml: raw.descriptionHtml,
    descriptionText,
    category: classifyCategory(raw.summary, descriptionText),
    levels: classifyLevels(raw.summary, descriptionText),
    ladiesOnly: isLadiesOnly(raw.summary, descriptionText),
    cancelled: isCancelled(raw.summary, raw.status),
    recurring,
    details: parseRideDetails(descriptionText),
  };
}

/**
 * Ortszeit eines Termins als Tagesschlüssel `JJJJ-MM-TT`.
 *
 * Wird zum Gruppieren nach Tagen gebraucht. Über die Zeitzone des Vereins, denn
 * ein Termin am 31.12. um 23:00 Uhr gehört in die Liste des 31., auch wenn er
 * in UTC schon am 1.1. liegt.
 */
export function localDayKey(date: Date, timeZone: string = CLUB_TIMEZONE): string {
  const wall = new Date(instantToWallTime(date.getTime(), timeZone));
  const month = String(wall.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wall.getUTCDate()).padStart(2, '0');
  return `${wall.getUTCFullYear()}-${month}-${day}`;
}
