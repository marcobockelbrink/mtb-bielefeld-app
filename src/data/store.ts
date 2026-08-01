/**
 * Der Zwischenspeicher der App.
 *
 * Gespeichert werden die **Rohdaten** (die iCal- und RSS-Antworten), nicht die
 * ausgewerteten Termine. Zwei Gründe:
 *  - Ein verbesserter Parser wirkt sofort auch auf bereits gespeicherte Daten.
 *  - Der gespeicherte Inhalt bleibt nachvollziehbar; ein Formatwechsel der App
 *    macht den Speicher nicht ungültig.
 *
 * Der eigentliche Speicher ist austauschbar, damit die Logik ohne
 * React Native getestet werden kann.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface CachedPayload {
  raw: string;
  /** Zeitpunkt des erfolgreichen Abrufs in Millisekunden. */
  fetchedAt: number;
}

const KEY_PREFIX = 'mtbie.cache.';

/** Speicher im Arbeitsspeicher — für Tests und als Notlösung. */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}

export async function readCache(store: KeyValueStore, key: string): Promise<CachedPayload | null> {
  try {
    const stored = await store.getItem(KEY_PREFIX + key);
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CachedPayload).raw === 'string' &&
      typeof (parsed as CachedPayload).fetchedAt === 'number'
    ) {
      return parsed as CachedPayload;
    }
    return null;
  } catch {
    // Ein beschädigter Speichereintrag darf die App nicht aufhalten.
    return null;
  }
}

export async function writeCache(
  store: KeyValueStore,
  key: string,
  payload: CachedPayload,
): Promise<void> {
  try {
    await store.setItem(KEY_PREFIX + key, JSON.stringify(payload));
  } catch {
    // Voller Speicher ist ärgerlich, aber kein Grund abzustürzen.
  }
}
