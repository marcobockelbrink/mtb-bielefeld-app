import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { localDayKey, parseCalendar } from '../src/data/ical/parseCalendar';
import { instantToWallTime, wallTimeToFields } from '../src/data/ical/timezone';
import type { ClubEvent } from '../src/domain/types';

const BERLIN = 'Europe/Berlin';

/**
 * Ausschnitt aus dem echten Vereinskalender, eingefroren als Testdatei.
 * Enthält bewusst die schwierigen Fälle: Serien mit Ausnahmeterminen,
 * verschobene Einzeltermine, Absagen und einen ganztägigen Termin.
 */
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/kalender-auszug.ics'), 'utf8');

/** Der ganze Zeitraum der Testdatei, damit die Tests nicht mit dem Datum kippen. */
function parseAll(): ClubEvent[] {
  return parseCalendar(fixture, {
    now: new Date('2024-01-01T12:00:00Z'),
    windowDaysPast: 365 * 4,
    windowDaysFuture: 365 * 4,
  });
}

function ortszeit(date: Date) {
  return wallTimeToFields(instantToWallTime(date.getTime(), BERLIN));
}

describe('Kalender einlesen', () => {
  const events = parseAll();

  it('liest den Kalenderauszug ohne Fehler', () => {
    // 35 Kalendereinträge, davon 8 Serien — daraus werden 51 Einzeltermine.
    expect(events.length).toBe(51);
  });

  it('liefert die Termine aufsteigend nach Startzeit', () => {
    const zeiten = events.map((event) => event.start.getTime());
    expect([...zeiten].sort((a, b) => a - b)).toEqual(zeiten);
  });

  it('vergibt eindeutige Kennungen', () => {
    const ids = events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gibt jedem Termin ein Ende nach dem Start', () => {
    for (const event of events) {
      expect(event.end.getTime()).toBeGreaterThanOrEqual(event.start.getTime());
    }
  });

  it('erkennt den ganztägigen Termin', () => {
    const festival = events.find((event) => event.title.includes('BIKE Festival'));
    expect(festival?.allDay).toBe(true);
  });
});

describe('Serientermine', () => {
  const events = parseAll();
  const rudel = events.filter((event) => /Mitt?wochsRudel/i.test(event.title));

  it('legt das MittwochsRudel auf Mittwoche', () => {
    expect(rudel.length).toBeGreaterThan(10);
    for (const event of rudel) {
      // 3 = Mittwoch
      expect(new Date(instantToWallTime(event.start.getTime(), BERLIN)).getUTCDay()).toBe(3);
    }
  });

  it('behält die Ortszeit über die Zeitumstellung hinweg bei', () => {
    // Die Downcountry-Serie läuft monatlich von November 2021 bis August 2022
    // und damit über die Umstellung im März 2022. Sie muss durchgehend um
    // 19:00 Uhr Ortszeit stattfinden — auch wenn sich der Zeitpunkt in UTC
    // dabei von 18:00 auf 17:00 verschiebt.
    const serie = events.filter((event) => event.title.startsWith('Downcountry'));
    expect(serie.length).toBe(10);
    for (const event of serie) {
      expect(ortszeit(event.start).hour).toBe(19);
    }

    const winter = serie.find((event) => event.start < new Date('2022-03-27'))!;
    const sommer = serie.find((event) => event.start > new Date('2022-03-27'))!;
    expect(winter.start.toISOString()).toMatch(/T18:00/);
    expect(sommer.start.toISOString()).toMatch(/T17:00/);
  });

  it('lässt Ausnahmetermine (EXDATE) weg', () => {
    // Die Serie ab 24.09.2025 läuft laut Regel bis Ende März 2026, hat aber 22
    // Ausnahmetermine für die Winterpause. Übrig bleiben fünf Mittwoche im
    // September und Oktober — der 24.12.2025 gehört nicht dazu.
    const serie = rudel.filter(
      (event) => event.start >= new Date('2025-09-24') && event.start < new Date('2026-04-01'),
    );
    expect(serie.map((event) => localDayKey(event.start, BERLIN))).toEqual([
      '2025-09-24',
      '2025-10-01',
      '2025-10-08',
      '2025-10-15',
      '2025-10-22',
    ]);
    expect(serie.every((event) => ortszeit(event.start).hour === 17)).toBe(true);
  });

  it('markiert Serientermine als solche', () => {
    expect(rudel.every((event) => event.recurring)).toBe(true);
  });
});

describe('Geänderte Einzeltermine', () => {
  const events = parseAll();

  it('übernimmt die verschobene Uhrzeit', () => {
    // Im Kalender: Serientermin am 14.01.2023 um 11:00 Uhr, verschoben auf
    // 10:00 Uhr und im Titel als ausgefallen markiert.
    const tag = events.filter((event) => localDayKey(event.start, BERLIN) === '2023-01-14');
    const verschoben = tag.find((event) => event.title.includes('witterungsbedingt'));

    expect(verschoben).toBeDefined();
    expect(ortszeit(verschoben!.start).hour).toBe(10);
    // Der ursprüngliche 11:00-Termin darf nicht zusätzlich auftauchen.
    expect(tag.filter((event) => ortszeit(event.start).hour === 11)).toHaveLength(0);
  });

  it('erkennt die Absage', () => {
    const abgesagt = events.find((event) => event.title.includes('witterungsbedingt'));
    expect(abgesagt?.cancelled).toBe(true);
  });

  it('erkennt Absagen mit vorangestellter Markierung', () => {
    const abgesagt = events.find(
      (event) => localDayKey(event.start, BERLIN) === '2023-03-11' && event.cancelled,
    );
    expect(abgesagt).toBeDefined();
    // Die Markierung selbst gehört nicht in den angezeigten Titel.
    expect(abgesagt!.title).not.toMatch(/ABGESAGT/i);
  });
});

describe('Auswertung der Termininhalte', () => {
  const events = parseAll();

  it('ordnet nahezu alle Termine einer Kategorie zu', () => {
    const unklar = events.filter((event) => event.category === 'sonstiges');
    expect(unklar.length / events.length).toBeLessThan(0.05);
  });

  it('erkennt Ladies-Only-Touren', () => {
    const ladies = events.filter((event) => event.ladiesOnly);
    expect(ladies.length).toBeGreaterThan(0);
    expect(ladies.every((event) => /ladies/i.test(event.title))).toBe(true);
  });

  it('liest bei den meisten Touren eine Fahrtechnik-Einstufung', () => {
    const touren = events.filter((event) => event.category === 'tour');
    const mitEinstufung = touren.filter((event) => event.details.technique);
    expect(mitEinstufung.length / touren.length).toBeGreaterThan(0.7);
  });

  it('stuft das MittwochsRudel nicht als Könner-Termin ein', () => {
    const rudel = events.filter((event) => /Mitt?wochsRudel/i.test(event.title));
    expect(rudel.some((event) => event.levels.includes('koenner'))).toBe(false);
  });
});

describe('originalStartInstant', () => {
  it('ist bei einem gewöhnlichen Termin der Startzeitpunkt', () => {
    const raw = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:einzel@test',
      'DTSTART;TZID=Europe/Berlin:20260812T180000',
      'DTEND;TZID=Europe/Berlin:20260812T200000',
      'SUMMARY:Feierabendrunde',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const [termin] = parseCalendar(raw, { now: new Date('2026-08-03T12:00:00Z') });
    expect(termin?.originalStartInstant).toBe(termin?.start.getTime());
  });

  it('überlebt die Verschiebung eines Einzeltermins einer Serie', () => {
    // Das MittwochsRudel wird am 12.08. von 18:00 auf 19:00 verschoben. Die
    // Kennung `id` ändert sich dadurch — `originalStartInstant` nicht: Er
    // zeigt weiter auf den ursprünglichen Zeitpunkt. Genau daran hängen
    // die Anmeldungen der API.
    const raw = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:rudel@test',
      'DTSTART;TZID=Europe/Berlin:20260805T180000',
      'DTEND;TZID=Europe/Berlin:20260805T200000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'SUMMARY:MittwochsRudel',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:rudel@test',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260812T180000',
      'DTSTART;TZID=Europe/Berlin:20260812T190000',
      'DTEND;TZID=Europe/Berlin:20260812T210000',
      'SUMMARY:MittwochsRudel',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const termine = parseCalendar(raw, { now: new Date('2026-08-03T12:00:00Z') });
    const verschoben = termine.find((t) => t.start.getHours() === 19);
    const urspruenglich = new Date('2026-08-12T18:00:00+02:00').getTime();

    expect(verschoben).toBeDefined();
    expect(verschoben?.originalStartInstant).toBe(urspruenglich);
    expect(verschoben?.originalStartInstant).not.toBe(verschoben?.start.getTime());
  });
});

describe('localDayKey', () => {
  it('rechnet in Vereinszeit, nicht in UTC', () => {
    // 31.12. um 23:00 Ortszeit ist in UTC bereits der 31.12. um 22:00 —
    // der Termin gehört trotzdem in die Liste des 31.
    expect(localDayKey(new Date('2025-12-31T22:00:00Z'), BERLIN)).toBe('2025-12-31');
    // 01.01. um 00:30 Ortszeit ist in UTC noch der 31.12.
    expect(localDayKey(new Date('2025-12-31T23:30:00Z'), BERLIN)).toBe('2026-01-01');
  });
});
