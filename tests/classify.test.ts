import { describe, expect, it } from 'vitest';

import {
  classifyCategory,
  classifyLevels,
  cleanTitle,
  isCancelled,
  isLadiesOnly,
} from '../src/data/parse/classify';

describe('Kategorien', () => {
  it.each([
    ['MittwochsRudel', 'treff'],
    ['MitwochsRudel', 'treff'], // Schreibvariante aus dem Kalender
    ['FreitagsFlow', 'treff'],
    ['Bike&Beer', 'treff'],
    ['Tour für Fortgeschrittene', 'tour'],
    ['Ladies Only Enduro Tour', 'tour'],
    ['Gravel Spezial - 12 Halden Tour', 'tour'],
    ['eMTB-Tour Bad Salzuflen/Herford', 'tour'],
    ['Fahrtechnik Fortgeschritten', 'fahrtechnik'],
    ['Training - Kurventechnik im Gelände', 'fahrtechnik'],
    ['Sprungtraining der Jugend', 'jugend'],
    ['Bikepark Willingen', 'ausflug'],
    ['Trailground Brilon', 'ausflug'],
    ['Werkstatt Schnupperkurs', 'werkstatt'],
    ['Weihnachtsfeier', 'verein'],
    ['Outlet und Flohmarkt im Berghotel Quellental', 'verein'],
  ])('ordnet "%s" als %s ein', (title, expected) => {
    expect(classifyCategory(title)).toBe(expected);
  });

  it('bevorzugt den Titel gegenüber der Beschreibung', () => {
    expect(classifyCategory('Bikepark Willingen', 'Eine schöne Tour mit dem Rad')).toBe('ausflug');
  });

  it('greift auf die Beschreibung zurück, wenn der Titel nichts hergibt', () => {
    expect(classifyCategory('Samstagstermin', 'Gemeinsame Ausfahrt über die Trails')).toBe('tour');
  });

  it('gibt "sonstiges" zurück, statt zu raten', () => {
    expect(classifyCategory('Austausch zur aktuellen Situation im Wald')).toBe('sonstiges');
  });
});

describe('Erfahrungsstufen', () => {
  it('erkennt einzelne Stufen', () => {
    expect(classifyLevels('Tour für Einsteiger')).toEqual(['einsteiger']);
    expect(classifyLevels('Tour für Fortgeschrittene')).toEqual(['fortgeschritten']);
  });

  it('erkennt zusammengezogene Angaben', () => {
    expect(classifyLevels('Tour für Ein- und Aufsteiger mit Grundkondition').sort()).toEqual([
      'aufsteiger',
      'einsteiger',
    ]);
  });

  it('hält "Profil" nicht für "Profi"', () => {
    // Diese Zeile steht in jeder MittwochsRudel-Beschreibung. Ohne saubere
    // Wortgrenze galten 183 Termine fälschlich als Könner-Termine.
    const beschreibung = 'Die Route, das Profil und der Schwierigkeitsgrad ergeben sich spontan.';
    expect(classifyLevels('MittwochsRudel', beschreibung)).toEqual([]);
  });

  it('erkennt echte Könner-Termine', () => {
    expect(classifyLevels('Bikepark Willingen', 'Für Könner geeignet')).toContain('koenner');
  });
});

describe('Weitere Merkmale', () => {
  it('erkennt Ladies-Only-Termine', () => {
    expect(isLadiesOnly('Ladies Only Tour')).toBe(true);
    expect(isLadiesOnly('Tour')).toBe(false);
  });

  it('erkennt Absagen im Titel', () => {
    expect(isCancelled('-ABGESAGT- Tour für Fortgeschrittene')).toBe(true);
    expect(isCancelled('Tour für Fortgeschrittene (fällt witterungsbedingt leider aus!!)')).toBe(true);
    expect(isCancelled('Tour für Fortgeschrittene')).toBe(false);
  });

  it('erkennt Absagen über den Kalenderstatus', () => {
    expect(isCancelled('Tour', 'CANCELLED')).toBe(true);
    expect(isCancelled('Tour', 'CONFIRMED')).toBe(false);
  });

  it('räumt Titel für die Anzeige auf', () => {
    expect(cleanTitle('-ABGESAGT- Tour für Fortgeschrittene')).toBe('Tour für Fortgeschrittene');
    expect(cleanTitle('MittwochsRudel  "Black Edition" ')).toBe('MittwochsRudel "Black Edition"');
  });
});
