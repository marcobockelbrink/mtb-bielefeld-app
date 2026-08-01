import { describe, expect, it } from 'vitest';

import { expandRecurrence, nthWeekdayOfMonth, parseRecurrenceRule } from '../src/data/ical/rrule';
import { fieldsToWallTime, instantToWallTime, wallTimeToFields } from '../src/data/ical/timezone';

const BERLIN = 'Europe/Berlin';

function wall(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return fieldsToWallTime({ year, month, day, hour, minute, second: 0 });
}

/** Zeigt einen Zeitpunkt als Bielefelder Ortszeit — so liest sich ein Fehlschlag lesbar. */
function ortszeit(instant: number): string {
  const f = wallTimeToFields(instantToWallTime(instant, BERLIN));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${f.year}-${pad(f.month)}-${pad(f.day)} ${pad(f.hour)}:${pad(f.minute)}`;
}

describe('Wiederholungsregeln lesen', () => {
  it('liest die MittwochsRudel-Regel', () => {
    const rule = parseRecurrenceRule('FREQ=WEEKLY;WKST=MO;UNTIL=20261021T215959Z;BYDAY=WE', BERLIN);
    expect(rule).toMatchObject({
      freq: 'WEEKLY',
      interval: 1,
      byDay: [{ weekday: 3 }],
      weekStart: 1,
    });
    expect(new Date(rule!.untilInstant!).toISOString()).toBe('2026-10-21T21:59:59.000Z');
  });

  it('liest Ordnungszahlen wie "letzter Samstag"', () => {
    const rule = parseRecurrenceRule('FREQ=MONTHLY;WKST=MO;BYDAY=-1SA', BERLIN);
    expect(rule!.byDay).toEqual([{ ordinal: -1, weekday: 6 }]);
  });

  it('weist unbekannte Frequenzen zurück', () => {
    expect(parseRecurrenceRule('FREQ=FORTNIGHTLY', BERLIN)).toBeNull();
  });
});

describe('Serientermine ausrechnen', () => {
  it('erzeugt wöchentliche Termine am richtigen Wochentag', () => {
    const rule = parseRecurrenceRule('FREQ=WEEKLY;WKST=MO;BYDAY=WE', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 5, 6, 18, 0), // Mittwoch
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 4, 1),
      windowEnd: Date.UTC(2026, 4, 31),
    });
    expect(instants.map(ortszeit)).toEqual([
      '2026-05-06 18:00',
      '2026-05-13 18:00',
      '2026-05-20 18:00',
      '2026-05-27 18:00',
    ]);
  });

  it('hält die Uhrzeit über die Zeitumstellung hinweg', () => {
    // Der Kern: Das Rudel startet vor und nach der Umstellung um 18:00 Ortszeit,
    // obwohl sich der tatsächliche Zeitpunkt um eine Stunde verschiebt.
    const rule = parseRecurrenceRule('FREQ=WEEKLY;BYDAY=WE', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 3, 25, 18, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 2, 1),
      windowEnd: Date.UTC(2026, 3, 10),
    });
    expect(instants.map(ortszeit)).toEqual([
      '2026-03-25 18:00',
      '2026-04-01 18:00',
      '2026-04-08 18:00',
    ]);
    // Zeitumstellung war am 29.03.: davor 17:00 UTC, danach 16:00 UTC.
    expect(new Date(instants[0]).toISOString()).toBe('2026-03-25T17:00:00.000Z');
    expect(new Date(instants[1]).toISOString()).toBe('2026-04-01T16:00:00.000Z');
  });

  it('beachtet INTERVAL', () => {
    const rule = parseRecurrenceRule('FREQ=WEEKLY;WKST=MO;INTERVAL=2;BYDAY=TH', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 5, 7, 19, 0), // Donnerstag
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 4, 1),
      windowEnd: Date.UTC(2026, 5, 15),
    });
    expect(instants.map(ortszeit)).toEqual([
      '2026-05-07 19:00',
      '2026-05-21 19:00',
      '2026-06-04 19:00',
    ]);
  });

  it('findet den letzten Samstag im Monat (Bike&Beer)', () => {
    const rule = parseRecurrenceRule('FREQ=MONTHLY;WKST=MO;BYDAY=-1SA', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 1, 31, 11, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2026, 4, 1),
    });
    expect(instants.map(ortszeit)).toEqual([
      '2026-01-31 11:00',
      '2026-02-28 11:00',
      '2026-03-28 11:00',
      '2026-04-25 11:00',
    ]);
  });

  it('findet den zweiten Mittwoch im Monat', () => {
    const rule = parseRecurrenceRule('FREQ=MONTHLY;WKST=MO;BYDAY=2WE', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 1, 14, 17, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2026, 3, 1),
    });
    expect(instants.map(ortszeit)).toEqual([
      '2026-01-14 17:00',
      '2026-02-11 17:00',
      '2026-03-11 17:00',
    ]);
  });

  it('hört bei UNTIL auf', () => {
    const rule = parseRecurrenceRule('FREQ=WEEKLY;BYDAY=WE;UNTIL=20260520T215959Z', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 5, 6, 18, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2026, 11, 31),
    });
    expect(instants.map(ortszeit)).toEqual(['2026-05-06 18:00', '2026-05-13 18:00', '2026-05-20 18:00']);
  });

  it('beachtet COUNT auch außerhalb des Fensters', () => {
    // COUNT zählt ab Serienstart. Wer erst ab Juni schaut, darf nicht plötzlich
    // fünf weitere Termine bekommen.
    const rule = parseRecurrenceRule('FREQ=WEEKLY;BYDAY=WE;COUNT=5', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 5, 6, 18, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 4, 20),
      windowEnd: Date.UTC(2026, 11, 31),
    });
    expect(instants.map(ortszeit)).toEqual(['2026-05-20 18:00', '2026-05-27 18:00', '2026-06-03 18:00']);
  });

  it('läuft bei endlosen Serien nicht davon', () => {
    const rule = parseRecurrenceRule('FREQ=DAILY', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2015, 1, 1, 8, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2026, 0, 8),
    });
    // 01.01. bis 07.01., jeweils 08:00 Ortszeit — der 08.01. um 08:00 liegt
    // bereits hinter dem Fensterende (08.01. 00:00 UTC).
    expect(instants).toHaveLength(7);
  });

  it('überspringt Monate ohne den passenden Tag', () => {
    const rule = parseRecurrenceRule('FREQ=MONTHLY', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 1, 31, 10, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2026, 3, 30),
    });
    // Februar hat keinen 31. — der Termin fällt aus, statt auf den 3. März zu rutschen.
    expect(instants.map(ortszeit)).toEqual(['2026-01-31 10:00', '2026-03-31 10:00']);
  });

  it('rechnet die Zeitumstellungsregel des Kalenders nach', () => {
    const rule = parseRecurrenceRule('FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', BERLIN)!;
    const instants = expandRecurrence({
      startWall: wall(2026, 3, 29, 2, 0),
      timeZone: BERLIN,
      rule,
      windowStart: Date.UTC(2026, 0, 1),
      windowEnd: Date.UTC(2028, 11, 31),
    });
    expect(instants.map((i) => ortszeit(i).slice(0, 10))).toEqual(['2026-03-29', '2027-03-28', '2028-03-26']);
  });
});

describe('nthWeekdayOfMonth', () => {
  it('findet positive Ordnungszahlen', () => {
    expect(nthWeekdayOfMonth(2026, 0, 3, 2)).toBe(14); // 2. Mittwoch im Januar 2026
  });

  it('findet negative Ordnungszahlen', () => {
    expect(nthWeekdayOfMonth(2026, 0, 6, -1)).toBe(31); // letzter Samstag im Januar 2026
  });

  it('gibt null zurück, wenn es den Tag nicht gibt', () => {
    expect(nthWeekdayOfMonth(2026, 1, 3, 5)).toBeNull(); // 5. Mittwoch im Februar 2026
  });
});
