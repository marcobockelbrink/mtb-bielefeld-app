import { describe, expect, it } from 'vitest';

import type { ClubEvent } from '../src/domain/types';
import { terminSchluessel } from '../src/domain/terminSchluessel';

function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = overrides.start ?? new Date('2026-08-13T16:00:00Z');
  return {
    id: 'x#1',
    originalStartInstant: start.getTime(),
    uid: 'x',
    title: 'Oerli Runde',
    start,
    end: overrides.end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Wanderparkplatz Kalkofen, Oerlinghausen',
    descriptionHtml: '',
    descriptionText: '',
    category: 'tour',
    levels: [],
    ladiesOnly: false,
    cancelled: false,
    recurring: false,
    details: { guides: [] },
    ...overrides,
  };
}

describe('terminSchluessel', () => {
  it('behält bei einem Einzeltermin die uid als Schlüssel, auch wenn start sich ändert', () => {
    const original = termin({ uid: 'einzeln@mtb-bielefeld.de' });
    const verschoben = termin({
      uid: 'einzeln@mtb-bielefeld.de',
      start: new Date('2026-08-20T17:00:00Z'),
      // originalStartInstant bleibt bei einem Einzeltermin gleich `start`
      // der Definition — hier absichtlich unverändert gelassen, um zu
      // zeigen, dass die uid allein trägt.
    });
    expect(terminSchluessel(verschoben)).toBe(terminSchluessel(original));
    expect(terminSchluessel(original)).toBe('einzeln@mtb-bielefeld.de');
  });

  it('unterscheidet zwei Einzeltermine derselben Serie an ihrem originalStartInstant', () => {
    const erster = termin({
      uid: 'rudel@mtb-bielefeld.de',
      recurring: true,
      originalStartInstant: new Date('2026-08-05T16:00:00Z').getTime(),
    });
    const zweiter = termin({
      uid: 'rudel@mtb-bielefeld.de',
      recurring: true,
      originalStartInstant: new Date('2026-08-12T16:00:00Z').getTime(),
    });
    expect(terminSchluessel(erster)).not.toBe(terminSchluessel(zweiter));
  });

  it('bleibt bei einem verschobenen Serientermin gleich, weil originalStartInstant stehen bleibt', () => {
    const originalZeitpunkt = new Date('2026-08-12T16:00:00Z').getTime();
    const vorher = termin({
      uid: 'rudel@mtb-bielefeld.de',
      recurring: true,
      originalStartInstant: originalZeitpunkt,
      start: new Date(originalZeitpunkt),
    });
    const verschoben = termin({
      uid: 'rudel@mtb-bielefeld.de',
      recurring: true,
      originalStartInstant: originalZeitpunkt,
      start: new Date('2026-08-12T18:00:00Z'),
    });
    expect(terminSchluessel(verschoben)).toBe(terminSchluessel(vorher));
  });
});
