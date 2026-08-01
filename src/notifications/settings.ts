/**
 * Einstellungen für Erinnerungen — was der Verein nicht steuert, sondern jeder
 * für sich.
 */

import type { EventCategory } from '../domain/types';
import type { KeyValueStore } from '../data/store';

export interface NotificationSettings {
  /** Erinnerungen überhaupt gewünscht. */
  enabled: boolean;
  /** Wie lange vorher erinnert wird. */
  leadMinutes: number;
  /**
   * Nur diese Kategorien. Leer bedeutet: alle.
   * Wer nur zum Schraubertreff will, soll nicht wegen jeder Tour piepen.
   */
  categories: EventCategory[];
  /** Sofortmeldung, wenn ein vorgemerkter Termin abgesagt wird. */
  notifyOnCancellation: boolean;
}

export const defaultSettings: NotificationSettings = {
  enabled: false,
  leadMinutes: 120,
  categories: [],
  notifyOnCancellation: true,
};

/** Zur Auswahl angebotene Vorlaufzeiten. */
export const LEAD_TIME_OPTIONS = [
  { minutes: 60, label: '1 Stunde vorher' },
  { minutes: 120, label: '2 Stunden vorher' },
  { minutes: 180, label: '3 Stunden vorher' },
  { minutes: 12 * 60, label: '12 Stunden vorher' },
  { minutes: 24 * 60, label: 'Am Tag vorher' },
] as const;

const STORAGE_KEY = 'mtbie.notifications';

export async function loadSettings(store: KeyValueStore): Promise<NotificationSettings> {
  try {
    const stored = await store.getItem(STORAGE_KEY);
    if (!stored) return defaultSettings;
    const parsed = JSON.parse(stored) as Partial<NotificationSettings>;
    // Feldweise zusammenführen: Ältere Fassungen der App kennen neue Felder
    // noch nicht, und die Einstellungen sollen einen Umzug überstehen.
    return {
      enabled: parsed.enabled ?? defaultSettings.enabled,
      leadMinutes:
        typeof parsed.leadMinutes === 'number' && parsed.leadMinutes > 0
          ? parsed.leadMinutes
          : defaultSettings.leadMinutes,
      categories: Array.isArray(parsed.categories) ? parsed.categories : defaultSettings.categories,
      notifyOnCancellation: parsed.notifyOnCancellation ?? defaultSettings.notifyOnCancellation,
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(store: KeyValueStore, settings: NotificationSettings): Promise<void> {
  try {
    await store.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nicht speichern zu können ist ärgerlich, aber kein Absturzgrund.
  }
}
