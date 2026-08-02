import { describe, expect, it } from 'vitest';

import { serialisiereFehler } from '../src/protokoll.ts';

describe('serialisiereFehler', () => {
  it('behält Meldung und Stapel', () => {
    const serialisiert = serialisiereFehler(new Error('Anbieter antwortet nicht')) as {
      nachricht: string;
      stapel: string;
    };

    // Ohne diesen Serialisierer schriebe pino `{}` — der bewusst laute
    // Fehler käme beim Betreiber als leeres Objekt an und wäre wieder still.
    expect(serialisiert.nachricht).toBe('Anbieter antwortet nicht');
    expect(serialisiert.stapel).toContain('Anbieter antwortet nicht');
  });

  it('nimmt die Ursache mit', () => {
    const serialisiert = serialisiereFehler(
      new Error('oben', { cause: new Error('unten') }),
    ) as { ursache: string };

    expect(serialisiert.ursache).toContain('unten');
  });

  it('reicht durch, was gar kein Fehler ist', () => {
    expect(serialisiereFehler('nur Text')).toBe('nur Text');
  });
});
