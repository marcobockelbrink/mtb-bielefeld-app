/**
 * Welche Fassung beim Update-Hinweis zuletzt weggewischt wurde.
 *
 * Getrennt von `pruefung.ts` — dasselbe Muster wie bei `gelesen.ts` und
 * `gelesenSpeicher.ts`: Die Rechenlogik bleibt ohne React Native prüfbar,
 * hier steht nur das Lesen und Schreiben.
 *
 * Gespeichert wird die **Fassungsnummer**, nicht ein Ja/Nein. Ein
 * Wahrheitswert bliebe für immer stehen, und die nächste Fassung käme nie
 * zur Sprache; die Nummer wischt sich beim nächsten Update von selbst weg
 * (siehe `zeigeHinweis`).
 */

import type { KeyValueStore } from '../../data/store';

const SCHLUESSEL = 'mtbie.updateHinweisWeggewischt';

export async function liesWeggewischt(store: KeyValueStore): Promise<string | null> {
  try {
    return await store.getItem(SCHLUESSEL);
  } catch {
    // Ein Lesefehler heißt „nichts weggewischt" — dann erscheint der
    // Hinweis einmal zu oft. Das ist die harmlosere Richtung: andersherum
    // verschwände er dauerhaft, und niemand fände je heraus, warum.
    return null;
  }
}

export async function merkeWeggewischt(store: KeyValueStore, fassung: string): Promise<void> {
  try {
    await store.setItem(SCHLUESSEL, fassung);
  } catch {
    // Verworfen: Der Hinweis kommt dann beim nächsten Start wieder. Ein
    // Absturz beim Wegwischen wäre die schlechtere Antwort.
  }
}
