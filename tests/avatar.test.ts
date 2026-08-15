import { describe, expect, it } from 'vitest';

import { farbpaarFuer, initialen } from '../src/ui/avatarFarben';

describe('initialen', () => {
  it('nimmt den ersten Buchstaben von Vor- und Nachname', () => {
    expect(initialen('Anna Beispiel')).toBe('AB');
    expect(initialen('marco bockelbrink')).toBe('MB');
  });

  it('macht aus einem einzelnen Wort einen Buchstaben, nicht zwei', () => {
    // „MA" sähe nach einem Nachnamen aus, den es nicht gibt.
    expect(initialen('Malte')).toBe('M');
  });

  it('nimmt bei drei Namen den ersten und den letzten', () => {
    expect(initialen('Anna Maria Beispiel')).toBe('AB');
  });

  it('liefert auch für Unsinn etwas — nie einen leeren Kreis', () => {
    expect(initialen('')).toBe('?');
    expect(initialen('   ')).toBe('?');
  });
});

describe('farbpaarFuer', () => {
  it('gibt derselben Person immer dieselbe Farbe', () => {
    // Der ganze Zweck: kein gespeicherter Zustand, trotzdem wiedererkennbar
    // — über Geräte und Neustarts hinweg.
    expect(farbpaarFuer('Anna Beispiel')).toEqual(farbpaarFuer('Anna Beispiel'));
  });

  it('liefert immer ein vollständiges Paar', () => {
    for (const name of ['Anna', 'Bernd Muster', 'Clara', 'Malte Meier', '']) {
      const paar = farbpaarFuer(name);
      expect(paar.grund).toMatch(/^#[0-9a-f]{6}$/i);
      expect(paar.schrift).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('verteilt verschiedene Namen über mehr als eine Farbe', () => {
    const namen = ['Anna Beispiel', 'Bernd Muster', 'Clara Klein', 'Malte Meier', 'Nico Elchen'];
    const verschiedene = new Set(namen.map((n) => farbpaarFuer(n).grund));
    expect(verschiedene.size).toBeGreaterThan(1);
  });
});
