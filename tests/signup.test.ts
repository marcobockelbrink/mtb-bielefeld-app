import { describe, expect, it } from 'vitest';

import type { ClubEvent } from '../src/domain/types';
import {
  buildSignupBody,
  buildSignupMailto,
  buildSignupSubject,
  offersMailSignup,
} from '../src/features/events/signup';

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

describe('buildSignupSubject', () => {
  it('nennt Termin und Datum, damit die Mail im Postfach zuzuordnen ist', () => {
    expect(buildSignupSubject(termin())).toBe('Anmeldung: Oerli Runde am 13.08.2026');
  });
});

describe('buildSignupBody', () => {
  it('nennt Tag, Uhrzeit und Treffpunkt in Vereinszeit', () => {
    const text = buildSignupBody(termin());
    expect(text).toContain('Donnerstag, 13. August um 18:00 Uhr');
    expect(text).toContain('Treffpunkt: Wanderparkplatz Kalkofen, Oerlinghausen');
  });

  it('bevorzugt den Abfahrtsort aus der Beschreibung vor dem Kalenderfeld', () => {
    const text = buildSignupBody(
      termin({ details: { guides: [], meetingPoint: 'Parkplatz Eisgrund' } }),
    );
    expect(text).toContain('Treffpunkt: Parkplatz Eisgrund');
    expect(text).not.toContain('Kalkofen');
  });

  it('lässt bei einem ganztägigen Termin die Uhrzeit weg', () => {
    const text = buildSignupBody(termin({ allDay: true }));
    expect(text).toContain('am Donnerstag, 13. August mitfahren');
    expect(text).not.toContain('Uhr');
  });

  it('lässt die Treffpunktzeile weg, wenn kein Ort bekannt ist', () => {
    const text = buildSignupBody(termin({ location: undefined }));
    expect(text).not.toContain('Treffpunkt:');
  });

  it('trennt Zeilen mit CRLF, sonst setzen manche Mail-Programme alles in eine Zeile', () => {
    expect(buildSignupBody(termin())).toContain('\r\n');
  });
});

describe('buildSignupMailto', () => {
  it('kodiert Betreff und Text, damit Umlaute und Umbrüche ankommen', () => {
    const url = buildSignupMailto(termin(), 'angebote@mtb-bielefeld.de');
    expect(url.startsWith('mailto:angebote@mtb-bielefeld.de?')).toBe(true);
    expect(url).toContain('subject=Anmeldung%3A%20Oerli%20Runde');
    // Gru%C3%9Fe = "Grüße" in UTF-8, %0D%0A = CRLF
    expect(url).toContain('Gr%C3%BC%C3%9Fe');
    expect(url).toContain('%0D%0A');
    expect(url).not.toContain(' ');
  });
});

describe('offersMailSignup', () => {
  it('bietet die Anmeldung bei einem normalen Termin an', () => {
    expect(offersMailSignup(termin())).toBe(true);
  });

  it('bietet sie bei einem abgesagten Termin nicht an', () => {
    expect(offersMailSignup(termin({ cancelled: true }))).toBe(false);
  });

  it('tritt zurück, wenn der Termin eine eigene Anmeldeadresse nennt', () => {
    const mitLink = termin({
      details: { guides: [], signupUrl: 'https://mtb-bielefeld.de/anmeldung' },
    });
    expect(offersMailSignup(mitLink)).toBe(false);
  });
});
