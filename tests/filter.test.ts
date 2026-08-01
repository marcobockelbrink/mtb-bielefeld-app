import { describe, expect, it } from 'vitest';

import { localDayKey } from '../src/data/ical/parseCalendar';
import {
  activeFilterCount,
  applyFilter,
  emptyFilter,
  groupByDay,
  isFilterActive,
  matchesFilter,
  pastEvents,
  upcomingOnly,
  type EventFilter,
} from '../src/features/events/filter';
import { formatAge, formatDayHeading, formatStars, formatTimeRange } from '../src/features/events/format';
import type { ClubEvent } from '../src/domain/types';

function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = overrides.start ?? new Date('2026-05-06T16:00:00Z');
  return {
    id: 'x#1',
    uid: 'x',
    title: 'Tour',
    start,
    end: overrides.end ?? new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Johannisberg, 33617 Bielefeld',
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

function filter(overrides: Partial<EventFilter> = {}): EventFilter {
  return { ...emptyFilter, ...overrides };
}

describe('Termine filtern', () => {
  it('lässt ohne Einschränkung alles durch', () => {
    const termine = [termin(), termin({ id: 'y#1', category: 'werkstatt' })];
    expect(applyFilter(termine, emptyFilter)).toHaveLength(2);
  });

  it('blendet abgesagte Termine standardmäßig aus', () => {
    const termine = [termin(), termin({ id: 'y#1', cancelled: true })];
    expect(applyFilter(termine, emptyFilter)).toHaveLength(1);
    expect(applyFilter(termine, filter({ hideCancelled: false }))).toHaveLength(2);
  });

  it('filtert nach Kategorie', () => {
    const termine = [termin({ category: 'tour' }), termin({ id: 'y#1', category: 'werkstatt' })];
    expect(applyFilter(termine, filter({ categories: ['werkstatt'] }))).toHaveLength(1);
  });

  it('filtert nach Ladies-Only', () => {
    const termine = [termin(), termin({ id: 'y#1', ladiesOnly: true })];
    expect(applyFilter(termine, filter({ ladiesOnly: true }))).toHaveLength(1);
  });

  describe('Sterne-Obergrenze', () => {
    it('lässt offene Angebote für Einsteiger sichtbar', () => {
      // Das MittwochsRudel ist mit "⭐ bis ⭐⭐⭐" ausgeschrieben. Wer nach
      // höchstens einem Stern filtert, muss es trotzdem sehen — es teilt sich
      // in Gruppen nach Können auf.
      const rudel = termin({ details: { guides: [], technique: { min: 1, max: 3 } } });
      expect(matchesFilter(rudel, filter({ maxTechniqueStars: 1 }))).toBe(true);
    });

    it('blendet zu schwere Termine aus', () => {
      const schwer = termin({ details: { guides: [], technique: { min: 3, max: 3 } } });
      expect(matchesFilter(schwer, filter({ maxTechniqueStars: 2 }))).toBe(false);
      expect(matchesFilter(schwer, filter({ maxTechniqueStars: 3 }))).toBe(true);
    });

    it('behält Termine ohne Angabe', () => {
      // Keine Angabe heißt nicht "zu schwer" — sonst verschwinden Termine,
      // bei denen der Verein die Einstufung schlicht vergessen hat.
      expect(matchesFilter(termin(), filter({ maxTechniqueStars: 1 }))).toBe(true);
    });

    it('gilt genauso für die Ausdauer', () => {
      const anstrengend = termin({ details: { guides: [], endurance: { min: 3, max: 3 } } });
      expect(matchesFilter(anstrengend, filter({ maxEnduranceStars: 2 }))).toBe(false);
    });
  });

  describe('Erfahrungsstufe', () => {
    it('trifft die gewählte Stufe', () => {
      const einsteiger = termin({ levels: ['einsteiger'] });
      const fortgeschritten = termin({ id: 'y#1', levels: ['fortgeschritten'] });
      const treffer = applyFilter([einsteiger, fortgeschritten], filter({ levels: ['einsteiger'] }));
      expect(treffer).toHaveLength(1);
      expect(treffer[0].levels).toEqual(['einsteiger']);
    });

    it('behält Termine ohne Stufenangabe', () => {
      expect(matchesFilter(termin({ levels: [] }), filter({ levels: ['einsteiger'] }))).toBe(true);
    });
  });

  describe('Suche', () => {
    it('sucht in Titel, Ort und Beschreibung', () => {
      const t = termin({ title: 'Ladies Only Tour', descriptionText: 'Guide ist Malte' });
      expect(matchesFilter(t, filter({ search: 'ladies' }))).toBe(true);
      expect(matchesFilter(t, filter({ search: 'johannisberg' }))).toBe(true);
      expect(matchesFilter(t, filter({ search: 'malte' }))).toBe(true);
      expect(matchesFilter(t, filter({ search: 'winterberg' }))).toBe(false);
    });

    it('verlangt alle Suchwörter, aber in beliebiger Reihenfolge', () => {
      const t = termin({ title: 'Ladies Only Tour' });
      expect(matchesFilter(t, filter({ search: 'tour ladies' }))).toBe(true);
      expect(matchesFilter(t, filter({ search: 'ladies enduro' }))).toBe(false);
    });
  });

  it('zählt gesetzte Einschränkungen', () => {
    expect(isFilterActive(emptyFilter)).toBe(false);
    const gesetzt = filter({ categories: ['tour'], levels: ['einsteiger'], maxTechniqueStars: 2 });
    expect(isFilterActive(gesetzt)).toBe(true);
    expect(activeFilterCount(gesetzt)).toBe(3);
  });
});

describe('Termine einteilen', () => {
  const jetzt = new Date('2026-05-06T12:00:00Z');
  const vergangen = termin({ id: 'a#1', start: new Date('2026-05-01T10:00:00Z') });
  const laufend = termin({
    id: 'b#1',
    start: new Date('2026-05-06T11:00:00Z'),
    end: new Date('2026-05-06T13:00:00Z'),
  });
  const kommend = termin({ id: 'c#1', start: new Date('2026-05-07T10:00:00Z') });

  it('zählt laufende Termine zu den kommenden', () => {
    expect(upcomingOnly([vergangen, laufend, kommend], jetzt).map((e) => e.id)).toEqual(['b#1', 'c#1']);
  });

  it('gibt vergangene Termine neueste zuerst zurück', () => {
    expect(pastEvents([vergangen, laufend, kommend], jetzt).map((e) => e.id)).toEqual(['a#1']);
  });

  it('gruppiert nach Kalendertag', () => {
    const gleicherTag = termin({ id: 'd#1', start: new Date('2026-05-07T16:00:00Z') });
    const abschnitte = groupByDay([kommend, gleicherTag], (date) => localDayKey(date, 'Europe/Berlin'));
    expect(abschnitte).toHaveLength(1);
    expect(abschnitte[0].events).toHaveLength(2);
  });
});

describe('Darstellung', () => {
  it('zeigt Zeitspannen in Vereinszeit', () => {
    const t = termin({
      start: new Date('2026-05-06T16:00:00Z'), // 18:00 Ortszeit
      end: new Date('2026-05-06T18:00:00Z'),
    });
    expect(formatTimeRange(t)).toBe('18:00 – 20:00');
  });

  it('kennzeichnet ganztägige Termine', () => {
    expect(formatTimeRange(termin({ allDay: true }))).toBe('ganztägig');
  });

  it('schreibt Sterne aus', () => {
    expect(formatStars({ min: 2, max: 2 })).toBe('⭐⭐');
    expect(formatStars({ min: 1, max: 3 })).toBe('⭐ bis ⭐⭐⭐');
    expect(formatStars(undefined)).toBeNull();
  });

  it('sagt "Heute" und "Morgen"', () => {
    const jetzt = new Date('2026-05-06T12:00:00Z');
    expect(formatDayHeading(new Date('2026-05-06T16:00:00Z'), jetzt)).toBe('Heute');
    expect(formatDayHeading(new Date('2026-05-07T16:00:00Z'), jetzt)).toBe('Morgen');
    expect(formatDayHeading(new Date('2026-05-08T16:00:00Z'), jetzt)).toBe('Freitag, 8. Mai');
  });

  it('benennt das Alter der Daten', () => {
    const jetzt = new Date('2026-05-06T12:00:00Z');
    expect(formatAge(new Date('2026-05-06T11:59:30Z'), jetzt)).toBe('gerade aktualisiert');
    expect(formatAge(new Date('2026-05-06T11:00:00Z'), jetzt)).toBe('vor 1 Stunde');
    expect(formatAge(new Date('2026-05-04T12:00:00Z'), jetzt)).toBe('vor 2 Tagen');
    expect(formatAge(null, jetzt)).toBe('noch nie aktualisiert');
  });
});
