/**
 * Anmeldung der Hintergrund-Aktualisierung beim Betriebssystem.
 *
 * Zweck ist vor allem der Absage-Alarm: Sagt der Verein das MittwochsRudel
 * kurzfristig ab, soll das Handy sich melden, ohne dass jemand die App öffnet.
 *
 * ## Was das Betriebssystem daraus macht
 *
 * Wann der Auftrag wirklich läuft, entscheidet allein das System — die
 * angegebene Zeitspanne ist eine Untergrenze, keine Zusage:
 *
 * - **Android** hält sich meist grob daran, verschiebt aber im Energiesparmodus
 *   oder wenn die App länger nicht benutzt wurde.
 * - **iOS** ist deutlich sparsamer und führt solche Aufträge oft nur in eigenen
 *   Zeitfenstern aus, gern nachts. Kurze Intervalle werden dort ignoriert.
 *
 * Der Absage-Alarm ist deshalb ein **Zusatz, keine Garantie**. Wer sicher gehen
 * will, öffnet die App — dann wird ohnehin abgeglichen. Genau so steht es auch
 * in den Einstellungen, damit sich niemand auf etwas verlässt, das das
 * Betriebssystem nicht zusagt.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { asyncStorageStore } from '../data/asyncStorageStore';
import { loadEvents } from '../data/repository';
import { syncReminders } from './index';
import {
  BACKGROUND_REFRESH_TASK,
  REFRESH_INTERVAL_MINUTES,
  runBackgroundRefresh,
} from './backgroundRefresh';
import { loadSettings } from './settings';

/**
 * Der Auftrag muss im Modulrumpf bekannt gemacht werden, nicht erst in einer
 * Komponente: Das System startet die App im Hintergrund in einer frischen
 * Umgebung und erwartet, dass der Auftrag dann bereits registriert ist.
 */
TaskManager.defineTask(BACKGROUND_REFRESH_TASK, async () => {
  const outcome = await runBackgroundRefresh({
    loadSettings: () => loadSettings(asyncStorageStore),
    loadEvents: async () => {
      // Erzwungener Abruf: Der Zwischenspeicher wäre hier nutzlos — gesucht ist
      // ja gerade die Änderung gegenüber dem gespeicherten Stand.
      const result = await loadEvents({ store: asyncStorageStore }, { forceRefresh: true });
      return result.data;
    },
    syncReminders,
  });

  return outcome === 'fehlgeschlagen'
    ? BackgroundTask.BackgroundTaskResult.Failed
    : BackgroundTask.BackgroundTaskResult.Success;
});

/**
 * Hält die Anmeldung des Auftrags im Einklang mit den Einstellungen.
 *
 * Sind Erinnerungen aus, wird der Auftrag abgemeldet statt nur übersprungen —
 * das System soll die App dann gar nicht erst aufwecken.
 */
export async function updateBackgroundRefreshRegistration(enabled: boolean): Promise<void> {
  try {
    const registriert = await TaskManager.isTaskRegisteredAsync(BACKGROUND_REFRESH_TASK);

    if (!enabled) {
      if (registriert) await BackgroundTask.unregisterTaskAsync(BACKGROUND_REFRESH_TASK);
      return;
    }

    // Auf Geräten mit eingeschränktem Hintergrundbetrieb (Energiesparmodus,
    // Bildschirmzeit-Beschränkungen) ist die Anmeldung zwecklos.
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

    if (!registriert) {
      await BackgroundTask.registerTaskAsync(BACKGROUND_REFRESH_TASK, {
        minimumInterval: REFRESH_INTERVAL_MINUTES,
      });
    }
  } catch {
    // Ohne Hintergrundauftrag funktioniert die App vollständig weiter; beim
    // nächsten Start wird es erneut versucht.
  }
}

/** Ob das System Hintergrundaufträge für diese App überhaupt zulässt. */
export async function isBackgroundRefreshAvailable(): Promise<boolean> {
  try {
    return (await BackgroundTask.getStatusAsync()) === BackgroundTask.BackgroundTaskStatus.Available;
  } catch {
    return false;
  }
}
