import { describe, expect, it } from 'vitest';

import {
  fieldsToWallTime,
  instantToWallTime,
  timeZoneOffsetMs,
  wallTimeToFields,
  wallTimeToInstant,
} from '../src/data/ical/timezone';

const BERLIN = 'Europe/Berlin';
const HOUR = 60 * 60 * 1000;

describe('Zeitzonenumrechnung', () => {
  it('erkennt Winterzeit (UTC+1)', () => {
    const januar = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(timeZoneOffsetMs(januar, BERLIN)).toBe(HOUR);
  });

  it('erkennt Sommerzeit (UTC+2)', () => {
    const juli = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(timeZoneOffsetMs(juli, BERLIN)).toBe(2 * HOUR);
  });

  it('rechnet Ortszeit in einen Zeitpunkt um', () => {
    // 18:00 Uhr Bielefelder Ortszeit im Winter = 17:00 UTC
    const winter = wallTimeToInstant(fieldsToWallTime({ year: 2026, month: 1, day: 14, hour: 18, minute: 0, second: 0 }), BERLIN);
    expect(new Date(winter).toISOString()).toBe('2026-01-14T17:00:00.000Z');

    // 18:00 Uhr im Sommer = 16:00 UTC
    const sommer = wallTimeToInstant(fieldsToWallTime({ year: 2026, month: 7, day: 15, hour: 18, minute: 0, second: 0 }), BERLIN);
    expect(new Date(sommer).toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });

  it('ist in beide Richtungen umkehrbar', () => {
    for (const month of [1, 3, 4, 7, 10, 11, 12]) {
      const wall = fieldsToWallTime({ year: 2026, month, day: 15, hour: 18, minute: 30, second: 0 });
      const roundTrip = instantToWallTime(wallTimeToInstant(wall, BERLIN), BERLIN);
      expect(wallTimeToFields(roundTrip)).toEqual(wallTimeToFields(wall));
    }
  });

  it('trifft die Umstellungstage genau', () => {
    // Sommerzeit beginnt am 29.03.2026 um 02:00 Ortszeit.
    const davor = Date.UTC(2026, 2, 29, 0, 59, 0);
    const danach = Date.UTC(2026, 2, 29, 1, 1, 0);
    expect(timeZoneOffsetMs(davor, BERLIN)).toBe(HOUR);
    expect(timeZoneOffsetMs(danach, BERLIN)).toBe(2 * HOUR);
  });

  it('behandelt Europe/Amsterdam wie Europe/Berlin', () => {
    const zeitpunkt = Date.UTC(2026, 6, 15, 12, 0, 0);
    expect(timeZoneOffsetMs(zeitpunkt, 'Europe/Amsterdam')).toBe(timeZoneOffsetMs(zeitpunkt, BERLIN));
  });
});
