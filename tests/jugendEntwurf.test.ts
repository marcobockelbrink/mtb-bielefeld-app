import { describe, expect, it } from 'vitest';

import { ausJson, hatInhalt, istFrisch, type TrainingsEntwurf } from '../src/features/jugend/entwurf';

const JETZT = new Date('2026-08-16T12:00:00Z');

function entwurf(teil: Partial<TrainingsEntwurf> = {}): TrainingsEntwurf {
  return {
    datum: null,
    uhrzeit: null,
    ort: '',
    hinweis: '',
    plaetze: '',
    guidesNoetig: '2',
    standAm: JETZT.getTime(),
    ...teil,
  };
}

describe('hatInhalt', () => {
  it('hält ein unangetastetes Formular für leer', () => {
    expect(hatInhalt(entwurf())).toBe(false);
  });

  it('zählt das vorbelegte Guides-Feld nicht als Inhalt', () => {
    // Sonst wäre jedes einmal geöffnete Formular ein „Entwurf", und die
    // Rückfrage käme, ohne dass jemand etwas getippt hätte.
    expect(hatInhalt(entwurf({ guidesNoetig: '3' }))).toBe(false);
  });

  it('erkennt jedes wirklich gefüllte Feld', () => {
    expect(hatInhalt(entwurf({ ort: 'Eisgrund' }))).toBe(true);
    expect(hatInhalt(entwurf({ datum: '2026-09-01T00:00:00.000Z' }))).toBe(true);
    expect(hatInhalt(entwurf({ plaetze: '8' }))).toBe(true);
  });

  it('hält reine Leerzeichen nicht für Inhalt', () => {
    expect(hatInhalt(entwurf({ ort: '   ' }))).toBe(false);
  });
});

describe('istFrisch', () => {
  it('bietet einen Entwurf von heute an', () => {
    expect(istFrisch(entwurf(), JETZT)).toBe(true);
  });

  it('lässt einen drei Wochen alten liegen', () => {
    // Ein alter Entwurf ist kein Angebot, sondern eine Irritation: Das
    // Training, um das es ging, ist längst gelaufen.
    const alt = entwurf({ standAm: JETZT.getTime() - 21 * 24 * 60 * 60 * 1000 });
    expect(istFrisch(alt, JETZT)).toBe(false);
  });
});

describe('ausJson', () => {
  it('übersteht die Reise durch den Speicher', () => {
    const vorher = entwurf({ ort: 'Eisgrund', plaetze: '8' });
    expect(ausJson(JSON.stringify(vorher))).toEqual(vorher);
  });

  it('verwirft Kaputtes, statt halbe Entwürfe zu bauen', () => {
    // Ein Formular, das befüllt aussieht und sich falsch verhält, wäre
    // schlimmer als ein leeres.
    expect(ausJson(null)).toBeNull();
    expect(ausJson('kein json {')).toBeNull();
    expect(ausJson('{"ort":"Eisgrund"}')).toBeNull();
  });
});
