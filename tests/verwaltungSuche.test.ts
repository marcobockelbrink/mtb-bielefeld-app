import { describe, expect, it } from 'vitest';

import type { MitgliedZeile } from '../src/data/verwaltung';
import { passtZurSuche, sucheMitglieder } from '../src/features/verwaltung/suche';

function zeile(teil: Partial<MitgliedZeile> = {}): MitgliedZeile {
  return {
    id: 'm1',
    email: 'anna@example.org',
    rolle: 'mitglied',
    jugend: false,
    jugendGuide: false,
    gesehenAm: null,
    offeneEinladung: false,
    ...teil,
  };
}

describe('passtZurSuche', () => {
  it('lässt bei leerer Suche alles durch', () => {
    expect(passtZurSuche(zeile(), '')).toBe(true);
    expect(passtZurSuche(zeile(), '   ')).toBe(true);
  });

  it('findet einen Teil der Adresse, unabhängig von der Groß-/Kleinschreibung', () => {
    expect(passtZurSuche(zeile({ email: 'Malte@Example.org' }), 'malte')).toBe(true);
    expect(passtZurSuche(zeile({ email: 'malte@example.org' }), 'EXAMPLE')).toBe(true);
  });

  it('findet über die Rolle', () => {
    expect(passtZurSuche(zeile({ rolle: 'verwaltung' }), 'verwaltung')).toBe(true);
    expect(passtZurSuche(zeile({ rolle: 'mitglied' }), 'verwaltung')).toBe(false);
  });

  it('findet Jugend und Jugend-Guide über ihre Merkmale', () => {
    // Der zweite Zweck des Feldes: „jugend" ersetzt eine eigene
    // Filterleiste für etwas, das ein Wort erledigt.
    expect(passtZurSuche(zeile({ jugend: true }), 'jugend')).toBe(true);
    expect(passtZurSuche(zeile({ jugend: false }), 'jugend')).toBe(false);
    expect(passtZurSuche(zeile({ jugendGuide: true }), 'jugendguide')).toBe(true);
  });

  it('findet offene Einladungen', () => {
    expect(passtZurSuche(zeile({ offeneEinladung: true }), 'eingeladen')).toBe(true);
    expect(passtZurSuche(zeile(), 'eingeladen')).toBe(false);
  });

  it('verlangt alle Wörter, aber in beliebiger Reihenfolge', () => {
    // Dieselbe Regel wie in der Terminsuche — zwei Suchfelder derselben
    // App sollen sich nicht verschieden verhalten.
    const malte = zeile({ email: 'malte@example.org', rolle: 'guide' });
    expect(passtZurSuche(malte, 'malte guide')).toBe(true);
    expect(passtZurSuche(malte, 'guide malte')).toBe(true);
    expect(passtZurSuche(malte, 'malte verwaltung')).toBe(false);
  });

  it('stört sich nicht an mehrfachen Leerzeichen', () => {
    expect(passtZurSuche(zeile({ rolle: 'guide' }), '  anna   guide  ')).toBe(true);
  });

  it('sucht nicht in Feldern, die niemand tippt', () => {
    // Die Kennung ist eine UUID — träfe sie mit, fände „a" zufällig
    // irgendwen. Das Datum ebenso wenig: Es steht formatiert in der
    // Anzeige, aber roh im Objekt.
    const mit = zeile({ id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', gesehenAm: new Date('2026-08-01') });
    expect(passtZurSuche(mit, '4111')).toBe(false);
    expect(passtZurSuche(mit, '2026')).toBe(false);
  });
});

describe('sucheMitglieder', () => {
  const liste = [
    zeile({ email: 'anna@example.org' }),
    zeile({ email: 'malte@example.org', rolle: 'guide' }),
    zeile({ email: 'basti@example.org', jugend: true }),
  ];

  it('gibt bei leerer Suche die Liste unverändert zurück', () => {
    expect(sucheMitglieder(liste, '')).toEqual(liste);
  });

  it('behält die Reihenfolge der Liste bei', () => {
    // Die API sortiert; die Suche darf das nicht durcheinanderbringen.
    expect(sucheMitglieder(liste, 'example').map((z) => z.email)).toEqual([
      'anna@example.org',
      'malte@example.org',
      'basti@example.org',
    ]);
  });

  it('liefert eine leere Liste, wenn nichts passt', () => {
    expect(sucheMitglieder(liste, 'gibtsnicht')).toEqual([]);
  });
});
