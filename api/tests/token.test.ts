import { describe, expect, it } from 'vitest';

import { erzeugeToken, hashe } from '../src/token.ts';

describe('erzeugeToken', () => {
  it('liefert bei jedem Aufruf einen anderen Wert', () => {
    const werte = new Set(Array.from({ length: 500 }, () => erzeugeToken()));
    expect(werte.size).toBe(500);
  });

  it('enthält nichts, was in einer Adresse kodiert werden müsste', () => {
    expect(erzeugeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('hashe', () => {
  it('liefert für gleiche Eingabe denselben Hash', () => {
    expect(hashe('abc')).toBe(hashe('abc'));
  });

  it('liefert für verschiedene Eingaben verschiedene Hashes', () => {
    expect(hashe('abc')).not.toBe(hashe('abd'));
  });

  it('gibt den Klartext nicht preis', () => {
    expect(hashe('geheim')).not.toContain('geheim');
    expect(hashe('geheim')).toHaveLength(64);
  });
});
