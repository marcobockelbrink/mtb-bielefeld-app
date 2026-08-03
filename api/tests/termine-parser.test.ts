import { describe, expect, it } from 'vitest';

import { parseCalendar } from '../../src/data/ical/parseCalendar.ts';

/**
 * Beweist, dass der geteilte Parser aus der API heraus läuft — kein zweiter
 * Parser, keine Kopie. Der Kalender hier ist bewusst winzig und eingebettet:
 * Der Test soll die Erreichbarkeit belegen, nicht den Parser erneut prüfen —
 * das tun die Wurzel-Tests mit ihren Fixtures.
 */
const KALENDER = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:probe-1@test',
  'DTSTART;TZID=Europe/Berlin:20260810T180000',
  'DTEND;TZID=Europe/Berlin:20260810T200000',
  'SUMMARY:Proberunde',
  'DESCRIPTION:Teilnehmerzahl: 12\\nGäste: ja',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('geteilter Parser in der API', () => {
  it('parst einen Kalender', () => {
    const termine = parseCalendar(KALENDER, { now: new Date('2026-08-03T12:00:00Z') });
    expect(termine).toHaveLength(1);
    expect(termine[0]?.title).toBe('Proberunde');
    expect(termine[0]?.details.maxParticipants).toBe(12);
  });
});
