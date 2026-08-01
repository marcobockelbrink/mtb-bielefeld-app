/**
 * Was bei einer Aktualisierung im Hintergrund passieren soll.
 *
 * Reine Ablauflogik ohne Expo und ohne React Native — dadurch prüfbar, ohne ein
 * Gerät zu starten. Die Anmeldung beim Betriebssystem steht in
 * `backgroundTask.ts`.
 */

import type { ClubEvent } from '../domain/types';
import type { SyncResult } from './index';
import type { NotificationSettings } from './settings';

export const BACKGROUND_REFRESH_TASK = 'mtbie-termine-aktualisieren';

/**
 * Angestrebter Abstand zwischen zwei Läufen, in Minuten.
 *
 * Drei Stunden sind ein Kompromiss: Die Standard-Vorwarnzeit für Erinnerungen
 * beträgt zwei Stunden, eine Absage am Nachmittag soll also noch ankommen.
 * Kürzer zu wählen kostet Akku und Datenvolumen, ohne auf iOS irgendetwas zu
 * ändern — dort entscheidet ohnehin das System.
 */
export const REFRESH_INTERVAL_MINUTES = 180;

export type RefreshOutcome = 'uebersprungen' | 'aktualisiert' | 'fehlgeschlagen';

export interface BackgroundRefreshDeps {
  loadSettings: () => Promise<NotificationSettings>;
  loadEvents: () => Promise<ClubEvent[]>;
  syncReminders: (events: ClubEvent[], settings: NotificationSettings) => Promise<SyncResult>;
}

/**
 * Der Ablauf einer Hintergrund-Aktualisierung.
 *
 * Sind Erinnerungen abgeschaltet, wird gar nichts geladen: Ein
 * Hintergrundauftrag, der ohne Nutzen Daten zieht, verbraucht fremdes
 * Datenvolumen und fremden Akku.
 *
 * Fehler werden geschluckt und als Ergebnis gemeldet, statt zu fliegen. Kein
 * Netz ist im Hintergrund der Normalfall; das System versucht es beim nächsten
 * Fenster erneut.
 */
export async function runBackgroundRefresh(deps: BackgroundRefreshDeps): Promise<RefreshOutcome> {
  try {
    const settings = await deps.loadSettings();
    if (!settings.enabled) return 'uebersprungen';

    const events = await deps.loadEvents();
    // `syncReminders` erkennt dabei auch Absagen und meldet sie sofort.
    await deps.syncReminders(events, settings);
    return 'aktualisiert';
  } catch {
    return 'fehlgeschlagen';
  }
}
