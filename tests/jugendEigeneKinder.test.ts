import { describe, expect, it } from 'vitest';

import type { TrainingDetails } from '../src/data/jugend';
import { darfNochAnmelden, eigeneKinder } from '../src/features/jugend/eigeneKinder';

function training(
  kinder: TrainingDetails['kinder'],
  zustand: TrainingDetails['zustand'] = 'veroeffentlicht',
): TrainingDetails {
  return {
    id: 'abc',
    beginntAm: new Date('2026-08-10T08:30:00.000Z'),
    endetAm: null,
    ort: 'Hermannsweg',
    hinweis: null,
    plaetze: 12,
    guidesNoetig: 2,
    zustand,
    absagegrund: null,
    belegt: kinder.length,
    kinder,
    guideZusagen: 0,
  };
}

const meins = { id: 'k1', anzeige: 'Lena', eigene: true };
const zweites = { id: 'k2', anzeige: 'Finn', eigene: true };
const fremd = { id: 'k3', anzeige: 'ein Kind', eigene: false };

describe('eigeneKinder', () => {
  it('behält nur die eigenen und lässt fremde weg', () => {
    expect(eigeneKinder(training([meins, fremd, zweites]))).toEqual([meins, zweites]);
  });

  it('ist leer, wenn niemand angemeldet ist', () => {
    expect(eigeneKinder(training([]))).toEqual([]);
  });

  // Das ist der Fall, der vorher gar nicht ging: Nach einem Neustart der App
  // war die Kennung weg und das Kind nie wieder abzumelden.
  it('findet das eigene Kind auch, wenn nur fremde daneben stehen', () => {
    expect(eigeneKinder(training([fremd, fremd, meins])).map((k) => k.id)).toEqual(['k1']);
  });
});

describe('darfNochAnmelden', () => {
  it('lässt das Formular stehen, solange erst ein Kind angemeldet ist', () => {
    expect(darfNochAnmelden(training([meins]))).toBe(true);
  });

  it('blendet es aus, sobald das Kontingent ausgeschöpft ist', () => {
    expect(darfNochAnmelden(training([meins, zweites]))).toBe(false);
  });

  // Fremde Kinder dürfen das eigene Kontingent nicht aufbrauchen.
  it('zählt fremde Kinder nicht mit', () => {
    expect(darfNochAnmelden(training([fremd, fremd, fremd, meins]))).toBe(true);
  });

  it('blendet es bei einem abgesagten Training aus', () => {
    expect(darfNochAnmelden(training([], 'abgesagt'))).toBe(false);
  });

  // Ein Entwurf sehen nur Guides, und `POST …/kinder` antwortet darauf mit
  // 409. Ein Formular davor wäre eine Einladung ins Leere.
  it('blendet es bei einem Entwurf aus', () => {
    expect(darfNochAnmelden(training([], 'entwurf'))).toBe(false);
  });

});
