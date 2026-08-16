import { describe, expect, it } from 'vitest';

import type { ClubEvent } from '../src/domain/types';
import { beschreibeErlaubnis } from '../src/notifications/erlaubnisText';
import { beschreibeVorlauf, naechsterErinnerterTermin } from '../src/notifications/scheduler';
import { defaultSettings, type NotificationSettings } from '../src/notifications/settings';

// Beide Befunde aus dem Usability-Review vom 15.08.2026: H1 (ein Schalter,
// der wortlos zurückspringt) und H2 („2 Stunden vorher" ohne Uhrzeit).

function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = overrides.start ?? new Date('2026-08-19T18:00:00Z');
  return {
    id: 'e1',
    title: 'MittwochsRudel',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Johannisberg',
    category: 'tour',
    levels: [],
    ladiesOnly: false,
    cancelled: false,
    descriptionText: '',
    details: { guides: [] },
    ...overrides,
  } as ClubEvent;
}

function einstellungen(teil: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...defaultSettings, enabled: true, ...teil };
}

describe('beschreibeErlaubnis (H1)', () => {
  it('sagt nichts, wenn die Erlaubnis vorliegt', () => {
    expect(beschreibeErlaubnis('erlaubt')).toBeNull();
  });

  it('verweist bei blockierten Mitteilungen in die Handy-Einstellungen', () => {
    // Der eigentliche Befund: Hier fragt das System nicht mehr nach. Ohne
    // diesen Hinweis tippt jemand ewig auf einen Schalter, der zurückspringt.
    const hinweis = beschreibeErlaubnis('blockiert');
    expect(hinweis?.zuEinstellungen).toBe(true);
    expect(hinweis?.text).toContain('Handy-Einstellungen');
  });

  it('bietet nach einer bloßen Ablehnung keinen Weg in die Einstellungen an', () => {
    // Dort wäre nichts zu tun — das System fragt beim nächsten Tippen von
    // selbst wieder. Ein Knopf dorthin wäre eine falsche Fährte.
    const hinweis = beschreibeErlaubnis('abgelehnt');
    expect(hinweis?.zuEinstellungen).toBe(false);
    expect(hinweis?.text).toContain('noch einmal');
  });

  it('unterscheidet die beiden Fälle im Wortlaut', () => {
    expect(beschreibeErlaubnis('blockiert')?.text).not.toBe(
      beschreibeErlaubnis('abgelehnt')?.text,
    );
  });
});

describe('beschreibeVorlauf (H2)', () => {
  const jetzt = new Date('2026-08-17T09:00:00Z');

  it('rechnet die Weckzeit am nächsten Termin aus', () => {
    // 18:00 UTC ist 20:00 Vereinszeit; zwei Stunden davor also 18:00.
    const satz = beschreibeVorlauf(120, new Date('2026-08-19T18:00:00Z'), jetzt);
    expect(satz).toContain('um 20:00 Uhr');
    expect(satz).toContain('meldet sich dein Handy um 18:00 Uhr');
  });

  it('nennt das Datum mit, wenn die Erinnerung auf einen anderen Tag fällt', () => {
    // „Am Tag vorher" bei einer Tour um 20:00 weckt um 20:00 — ohne Datum
    // läse sich das als der Abend des Termins selbst.
    const satz = beschreibeVorlauf(24 * 60, new Date('2026-08-19T18:00:00Z'), jetzt);
    expect(satz).toContain('Mi., 19.08.');
    expect(satz).toContain('Di., 18.08.');
  });

  it('fällt auf das allgemeine Beispiel zurück, wenn nichts ansteht', () => {
    expect(beschreibeVorlauf(120, null, jetzt)).toBe(
      'Zum Beispiel: Tour um 20:00 Uhr, Erinnerung um 18:00 Uhr.',
    );
  });

  it('fällt zurück, wenn die Weckzeit schon vorbei ist', () => {
    // `planReminders` wirft solche Termine weg — „meldet sich" wäre eine
    // Zusage, die nichts einlöst.
    const gleich = new Date(jetzt.getTime() + 30 * 60 * 1000);
    expect(beschreibeVorlauf(120, gleich, jetzt)).toContain('Zum Beispiel');
  });

  it('schreibt beim allgemeinen Beispiel den Vortag dazu', () => {
    expect(beschreibeVorlauf(24 * 60, null, jetzt)).toBe(
      'Zum Beispiel: Tour um 20:00 Uhr, Erinnerung am Tag davor um 20:00 Uhr.',
    );
  });

  it('rechnet das allgemeine Beispiel über Mitternacht zurück', () => {
    // 12 Stunden vor 20:00 ist 08:00 desselben Tages, 21 Stunden davor
    // 23:00 des Vortags. Die Modulo-Rechnung darf hier nicht negativ werden.
    expect(beschreibeVorlauf(12 * 60, null, jetzt)).toContain('um 08:00 Uhr');
    expect(beschreibeVorlauf(21 * 60, null, jetzt)).toContain('am Tag davor um 23:00 Uhr');
  });
});

describe('naechsterErinnerterTermin', () => {
  const jetzt = new Date('2026-08-17T09:00:00Z');

  it('nimmt den frühesten kommenden Termin', () => {
    const spaeter = termin({ id: 'b', start: new Date('2026-08-26T18:00:00Z') });
    const frueher = termin({ id: 'a', start: new Date('2026-08-19T18:00:00Z') });

    expect(naechsterErinnerterTermin([spaeter, frueher], einstellungen(), jetzt)).toEqual(
      frueher.start,
    );
  });

  it('übergeht Vergangenes, Abgesagtes und nicht gewählte Kategorien', () => {
    // Dieselbe Auswahl wie `planReminders` — liefe sie auseinander, nennte
    // der Satz einen Termin, zu dem nie eine Meldung käme.
    const vorbei = termin({ id: 'a', start: new Date('2026-08-10T18:00:00Z') });
    const abgesagt = termin({ id: 'b', start: new Date('2026-08-18T18:00:00Z'), cancelled: true });
    const andereArt = termin({ id: 'c', start: new Date('2026-08-19T18:00:00Z'), category: 'werkstatt' });
    const passend = termin({ id: 'd', start: new Date('2026-08-20T18:00:00Z') });

    const treffer = naechsterErinnerterTermin(
      [vorbei, abgesagt, andereArt, passend],
      einstellungen({ categories: ['tour'] }),
      jetzt,
    );
    expect(treffer).toEqual(passend.start);
  });

  it('liefert null, wenn nichts passt', () => {
    expect(naechsterErinnerterTermin([], einstellungen(), jetzt)).toBeNull();
  });
});
