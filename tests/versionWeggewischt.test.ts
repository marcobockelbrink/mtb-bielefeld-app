import { describe, expect, it } from 'vitest';

import { createMemoryStore } from '../src/data/store';
import { liesWeggewischt, merkeWeggewischt } from '../src/features/version/weggewischt';

describe('weggewischt', () => {
  it('merkt sich die Fassung und gibt sie wieder heraus', () => {
    // Die **Nummer**, nicht ein Ja/Nein: Ein Wahrheitswert bliebe für
    // immer stehen, und die nächste Fassung käme nie zur Sprache.
    const store = createMemoryStore();
    return merkeWeggewischt(store, '1.6.0').then(async () => {
      expect(await liesWeggewischt(store)).toBe('1.6.0');
    });
  });

  it('meldet ohne Eintrag null', async () => {
    expect(await liesWeggewischt(createMemoryStore())).toBeNull();
  });

  it('hält einen Lesefehler für „nichts weggewischt"', async () => {
    /**
     * Die harmlosere Richtung: Der Hinweis erscheint einmal zu oft.
     * Andersherum verschwände er dauerhaft, und niemand fände je heraus,
     * warum — ein stiller Fehler, der genau das abschaltet, was auf ein
     * Update aufmerksam machen soll.
     */
    const kaputt = {
      getItem: () => Promise.reject(new Error('Speicher nicht lesbar')),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.resolve(),
    };
    expect(await liesWeggewischt(kaputt)).toBeNull();
  });

  it('stürzt beim Wegwischen nicht ab, wenn der Speicher klemmt', async () => {
    // Der Hinweis kommt dann beim nächsten Start wieder. Ein Absturz beim
    // Wegwischen wäre die schlechtere Antwort.
    const kaputt = {
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.reject(new Error('voll')),
      removeItem: () => Promise.resolve(),
    };
    await expect(merkeWeggewischt(kaputt, '1.6.0')).resolves.toBeUndefined();
  });
});
