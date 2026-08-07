import { describe, expect, it } from 'vitest';

import { baueTeilenText } from '../src/features/jugend/teilen';

const training = {
  id: 'k3f9', beginntAm: new Date('2026-08-09T08:30:00Z'), endetAm: null,
  ort: 'Wanderparkplatz Kalkofen', hinweis: null, plaetze: null,
  guidesNoetig: 2, zustand: 'veroeffentlicht' as const, absagegrund: null, belegt: 0,
};

describe('baueTeilenText', () => {
  it('nennt Zeit und Ort in Vereinszeit und hängt den Link an', () => {
    const text = baueTeilenText(training, 'https://api.mtb-bielefeld.de');
    expect(text).toContain('Sonntag, 9. August');
    expect(text).toContain('10:30');
    expect(text).toContain('Wanderparkplatz Kalkofen');
    expect(text).toContain('https://api.mtb-bielefeld.de/t/k3f9');
  });

  it('lässt sich für ein abgesagtes Training gar nicht erst bauen', () => {
    // Eine Einladung zu etwas, das ausfällt, wäre schlimmer als keine.
    expect(() => baueTeilenText({ ...training, zustand: 'abgesagt' }, 'https://x')).toThrow();
  });

  it('lässt sich auch für einen Entwurf nicht bauen', () => {
    // Noch kein Guide hat zugesagt, noch kein Elternteil kann sich sehen —
    // ein Entwurf ist kein Termin, den man weiterleitet.
    expect(() => baueTeilenText({ ...training, zustand: 'entwurf' }, 'https://x')).toThrow();
  });

  it('entfernt einen Schrägstrich am Ende der Basis-Adresse', () => {
    // `TEILEN_BASIS_URL` leitet sich von `API_BASE_URL` ab (`src/config.ts`)
    // — die endet nie mit einem Schrägstrich, aber ein Tippfehler dort soll
    // trotzdem keinen doppelten Schrägstrich im Link erzeugen.
    const text = baueTeilenText(training, 'https://api.mtb-bielefeld.de/');
    expect(text).toContain('https://api.mtb-bielefeld.de/t/k3f9');
    expect(text).not.toContain('.de//t/');
  });
});
