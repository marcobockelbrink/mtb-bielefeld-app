/**
 * Die Anbindung des Gelesen-Stands an das Gerät.
 *
 * Getrennt von `gelesen.ts` — dasselbe Muster wie bei der
 * Upload-Warteschlange und dem Trainings-Entwurf: Die Rechenlogik bleibt
 * ohne React Native prüfbar, hier steht nur das Lesen und Schreiben.
 *
 * Der Speicher kommt als Parameter herein, damit auch dieser Teil ohne
 * Gerät geprüft werden kann (`createMemoryStore()` in `data/store.ts`).
 */

import type { KeyValueStore } from '../../data/store';
import { ausJson, ersterStand, zuJson, type GelesenStand } from './gelesen';

const SCHLUESSEL = 'mtbie.gelesen';

/**
 * Liest den Stand — und legt ihn beim ersten Mal an.
 *
 * Das Anlegen gehört hierher und nicht in den Aufrufer: Der Zeitpunkt des
 * ersten Starts ist die Grundlage der ganzen Unterscheidung (siehe
 * `gelesen.ts`), und er darf nur **einmal** entstehen. Würde jeder
 * Aufrufer ihn selbst setzen, verschöbe sich der Startpunkt bei jedem
 * Fehlschlag beim Schreiben nach vorn — und alles Neue wäre wieder
 * gelesen.
 */
export async function liesGelesen(store: KeyValueStore, jetzt: Date): Promise<GelesenStand> {
  let gespeichert: GelesenStand | null = null;
  try {
    gespeichert = ausJson(await store.getItem(SCHLUESSEL));
  } catch {
    // Lesefehler wie beschädigte Daten behandeln: neu anfangen.
  }
  if (gespeichert) return gespeichert;

  const frisch = ersterStand(jetzt);
  await schreibGelesen(store, frisch);
  return frisch;
}

export async function schreibGelesen(store: KeyValueStore, stand: GelesenStand): Promise<void> {
  try {
    await store.setItem(SCHLUESSEL, zuJson(stand));
  } catch {
    // Voller Speicher ist ärgerlich, aber kein Grund abzustürzen — dann
    // stehen eben ein paar Punkte zu viel da.
  }
}
