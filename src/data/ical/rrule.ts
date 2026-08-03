/**
 * Rechnet Wiederholungsregeln (`RRULE`) in einzelne Termine um.
 *
 * Der Vereinskalender nutzt davon:
 *  - `FREQ=WEEKLY;BYDAY=WE` — MittwochsRudel
 *  - `FREQ=WEEKLY;INTERVAL=2;BYDAY=TH` — alle zwei Wochen
 *  - `FREQ=MONTHLY;BYDAY=-1SA` — Bike&Beer am letzten Samstag
 *  - `FREQ=MONTHLY;BYDAY=2WE` — zweiter Mittwoch im Monat
 *  - `FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU` — Zeitumstellung
 *
 * Gerechnet wird durchgehend in Ortszeit. Erst zum Schluss entsteht daraus ein
 * echter Zeitpunkt — nur so bleibt das Rudel über die Zeitumstellung hinweg um
 * 18:00 Uhr und wandert nicht auf 17:00 Uhr.
 */

import { wallTimeToInstant, type WallTime } from './timezone.ts';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ByDayEntry {
  /** z.B. 2 für "zweiter Mittwoch", -1 für "letzter Samstag". */
  ordinal?: number;
  /** 0 = Sonntag … 6 = Samstag. */
  weekday: number;
}

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  count?: number;
  /** Ende der Serie als echter Zeitpunkt. */
  untilInstant?: number;
  byDay: ByDayEntry[];
  byMonth: number[];
  byMonthDay: number[];
  /** Wochenanfang, wichtig bei `INTERVAL` größer eins. */
  weekStart: number;
}

const WEEKDAY_CODES: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * Obergrenze für die Anzahl durchlaufener Zeitabschnitte.
 *
 * Serien ohne Enddatum (der Kalender enthält solche) würden sonst endlos
 * weiterlaufen. Der Wert reicht für tägliche Termine über gut 25 Jahre.
 */
const MAX_PERIODS = 10000;

/**
 * Liest eine `RRULE`-Zeile.
 *
 * `UNTIL` steht laut Norm in UTC, wird von manchen Programmen aber als Ortszeit
 * geschrieben; beides wird akzeptiert.
 */
export function parseRecurrenceRule(value: string, defaultTimeZone: string): RecurrenceRule | null {
  const parts: Record<string, string> = {};
  for (const segment of value.split(';')) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    parts[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1);
  }

  const freq = parts.FREQ?.toUpperCase();
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') {
    return null;
  }

  const byDay: ByDayEntry[] = [];
  for (const token of splitList(parts.BYDAY)) {
    const match = /^([+-]?\d+)?([A-Z]{2})$/.exec(token.toUpperCase());
    if (!match) continue;
    // Gruppe 2 ist im Muster nicht optional — bei einem Treffer ist sie immer
    // gesetzt. `noUncheckedIndexedAccess` kennt das Muster nicht, deshalb die
    // explizite Prüfung statt eines `!`.
    const code = match[2];
    if (code === undefined) continue;
    const weekday = WEEKDAY_CODES[code];
    if (weekday === undefined) continue;
    byDay.push({ ordinal: match[1] ? Number(match[1]) : undefined, weekday });
  }

  const interval = Number(parts.INTERVAL ?? '1');
  const count = parts.COUNT ? Number(parts.COUNT) : undefined;

  let untilInstant: number | undefined;
  if (parts.UNTIL) {
    const until = parseUntil(parts.UNTIL, defaultTimeZone);
    if (until !== null) untilInstant = until;
  }

  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    count: count && Number.isFinite(count) && count > 0 ? count : undefined,
    untilInstant,
    byDay,
    byMonth: splitList(parts.BYMONTH).map(Number).filter(Number.isFinite),
    byMonthDay: splitList(parts.BYMONTHDAY).map(Number).filter(Number.isFinite),
    weekStart: WEEKDAY_CODES[parts.WKST?.toUpperCase() ?? ''] ?? 1,
  };
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').filter((entry) => entry.length > 0);
}

function parseUntil(value: string, defaultTimeZone: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utcFlag] = match;
  const wall = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 23),
    Number(minute ?? 59),
    Number(second ?? 59),
  );
  return utcFlag ? wall : wallTimeToInstant(wall, defaultTimeZone);
}

export interface ExpansionOptions {
  /** Startzeitpunkt der Serie in Ortszeit. */
  startWall: WallTime;
  timeZone: string;
  rule: RecurrenceRule;
  /** Nur Termine ab diesem Zeitpunkt werden zurückgegeben. */
  windowStart: number;
  /** Nur Termine bis zu diesem Zeitpunkt werden zurückgegeben. */
  windowEnd: number;
}

/**
 * Rechnet die Serie aus und liefert die Startzeitpunkte der Einzeltermine.
 *
 * Gezählt wird ab dem Serienstart, damit `COUNT` stimmt — zurückgegeben werden
 * aber nur die Termine im gefragten Zeitfenster.
 */
export function expandRecurrence(options: ExpansionOptions): number[] {
  const { startWall, timeZone, rule, windowStart, windowEnd } = options;
  const startDate = new Date(startWall);
  const timeOfDayMs =
    startDate.getUTCHours() * 3600000 +
    startDate.getUTCMinutes() * 60000 +
    startDate.getUTCSeconds() * 1000;

  const results: number[] = [];
  let emitted = 0;
  let periodStart = alignToPeriodStart(startWall, rule);

  for (let period = 0; period < MAX_PERIODS; period++) {
    const candidates = candidatesInPeriod(periodStart, rule, startDate, timeOfDayMs);

    for (const candidateWall of candidates) {
      if (candidateWall < startWall) continue;
      const instant = wallTimeToInstant(candidateWall, timeZone);
      if (rule.untilInstant !== undefined && instant > rule.untilInstant) return results;

      emitted++;
      if (rule.count !== undefined && emitted > rule.count) return results;
      if (instant > windowEnd) return results;
      if (instant >= windowStart) results.push(instant);
    }

    periodStart = advancePeriod(periodStart, rule);
    // Ein ganzer Zeitabschnitt jenseits des Fensters: es kommt nichts mehr.
    if (wallTimeToInstant(periodStart, timeZone) > windowEnd) break;
  }

  return results;
}

/** Beginn des Zeitabschnitts, in dem der Serienstart liegt. */
function alignToPeriodStart(startWall: WallTime, rule: RecurrenceRule): WallTime {
  const date = new Date(startWall);
  switch (rule.freq) {
    case 'DAILY':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    case 'WEEKLY': {
      const offset = (date.getUTCDay() - rule.weekStart + 7) % 7;
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - offset);
    }
    case 'MONTHLY':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case 'YEARLY':
      return Date.UTC(date.getUTCFullYear(), 0, 1);
  }
}

function advancePeriod(periodStart: WallTime, rule: RecurrenceRule): WallTime {
  const date = new Date(periodStart);
  switch (rule.freq) {
    case 'DAILY':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + rule.interval);
    case 'WEEKLY':
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + 7 * rule.interval,
      );
    case 'MONTHLY':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + rule.interval, 1);
    case 'YEARLY':
      return Date.UTC(date.getUTCFullYear() + rule.interval, 0, 1);
  }
}

/** Alle Termine eines einzelnen Zeitabschnitts, aufsteigend sortiert. */
function candidatesInPeriod(
  periodStart: WallTime,
  rule: RecurrenceRule,
  startDate: Date,
  timeOfDayMs: number,
): WallTime[] {
  const date = new Date(periodStart);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const days: WallTime[] = [];

  switch (rule.freq) {
    case 'DAILY': {
      if (rule.byDay.length > 0 && !rule.byDay.some((entry) => entry.weekday === date.getUTCDay())) {
        break;
      }
      days.push(periodStart);
      break;
    }
    case 'WEEKLY': {
      const weekdays =
        rule.byDay.length > 0 ? rule.byDay.map((entry) => entry.weekday) : [startDate.getUTCDay()];
      for (const weekday of new Set(weekdays)) {
        const offset = (weekday - rule.weekStart + 7) % 7;
        days.push(Date.UTC(year, month, date.getUTCDate() + offset));
      }
      break;
    }
    case 'MONTHLY': {
      days.push(...monthlyDays(year, month, rule, startDate));
      break;
    }
    case 'YEARLY': {
      const months = rule.byMonth.length > 0 ? rule.byMonth : [startDate.getUTCMonth() + 1];
      for (const monthNumber of months) {
        days.push(...monthlyDays(year, monthNumber - 1, rule, startDate));
      }
      break;
    }
  }

  const withinByMonth =
    rule.byMonth.length > 0 && rule.freq !== 'YEARLY'
      ? days.filter((day) => rule.byMonth.includes(new Date(day).getUTCMonth() + 1))
      : days;

  return withinByMonth.map((day) => day + timeOfDayMs).sort((a, b) => a - b);
}

/** Die passenden Tage eines Monats — je nach `BYDAY` / `BYMONTHDAY`. */
function monthlyDays(year: number, month: number, rule: RecurrenceRule, startDate: Date): WallTime[] {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const days: WallTime[] = [];

  if (rule.byDay.length > 0) {
    for (const entry of rule.byDay) {
      if (entry.ordinal === undefined) {
        for (let day = 1; day <= daysInMonth; day++) {
          if (new Date(Date.UTC(year, month, day)).getUTCDay() === entry.weekday) {
            days.push(Date.UTC(year, month, day));
          }
        }
      } else {
        const day = nthWeekdayOfMonth(year, month, entry.weekday, entry.ordinal);
        if (day !== null) days.push(Date.UTC(year, month, day));
      }
    }
  } else if (rule.byMonthDay.length > 0) {
    for (const monthDay of rule.byMonthDay) {
      const day = monthDay > 0 ? monthDay : daysInMonth + monthDay + 1;
      if (day >= 1 && day <= daysInMonth) days.push(Date.UTC(year, month, day));
    }
  } else {
    // Ohne nähere Angabe gilt der Tag des Serienstarts. Monate, die diesen Tag
    // nicht haben (der 31. im Februar), fallen aus — so schreibt es die Norm vor.
    const day = startDate.getUTCDate();
    if (day <= daysInMonth) days.push(Date.UTC(year, month, day));
  }

  return days;
}

/**
 * Findet z.B. den zweiten Mittwoch (`ordinal` 2) oder letzten Samstag
 * (`ordinal` -1) eines Monats. Gibt `null` zurück, wenn es ihn nicht gibt.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: number,
): number | null {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  if (ordinal > 0) {
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const day = 1 + ((weekday - firstWeekday + 7) % 7) + (ordinal - 1) * 7;
    return day <= daysInMonth ? day : null;
  }

  if (ordinal < 0) {
    const lastWeekday = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay();
    const day = daysInMonth - ((lastWeekday - weekday + 7) % 7) + (ordinal + 1) * 7;
    return day >= 1 ? day : null;
  }

  return null;
}
