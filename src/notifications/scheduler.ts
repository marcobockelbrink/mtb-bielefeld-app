/**
 * Welche Erinnerungen wann fällig sind.
 *
 * Reine Rechenlogik ohne Bezug zu Expo oder React Native — dadurch prüfbar,
 * ohne ein Gerät zu starten. Die Anbindung an das Betriebssystem passiert in
 * `index.ts`.
 */

import type { ClubEvent } from '../domain/types';
import { formatTime } from '../features/events/format';
import type { NotificationSettings } from './settings';

export interface PlannedReminder {
  /** Entspricht `ClubEvent.id` — darüber wird abgeglichen und abbestellt. */
  eventId: string;
  title: string;
  body: string;
  /** Zeitpunkt, zu dem die Meldung erscheinen soll. */
  triggerAt: Date;
}

/**
 * iOS erlaubt höchstens 64 vorgemerkte Meldungen pro App; darüber hinaus
 * verwirft das System stillschweigend. Mit Abstand darunter zu bleiben ist
 * sicherer, und weiter als ein paar Wochen im Voraus plant ohnehin niemand.
 */
export const MAX_SCHEDULED_REMINDERS = 40;

/**
 * Stellt die Erinnerungen zusammen, die eingeplant werden sollen.
 *
 * Absichtlich ohne Zustand: Es wird immer die vollständige Liste berechnet und
 * anschließend mit dem eingeplanten Bestand abgeglichen. Das ist robuster als
 * einzelne Meldungen fortzuschreiben — bei Terminverschiebungen im Kalender
 * würden sonst Karteileichen zurückbleiben.
 */
export function planReminders(
  events: ClubEvent[],
  settings: NotificationSettings,
  now: Date = new Date(),
): PlannedReminder[] {
  if (!settings.enabled) return [];

  const leadMs = settings.leadMinutes * 60 * 1000;

  return events
    .filter((event) => !event.cancelled)
    .filter((event) => settings.categories.length === 0 || settings.categories.includes(event.category))
    .map((event) => ({
      eventId: event.id,
      title: event.title,
      body: reminderBody(event),
      triggerAt: new Date(event.start.getTime() - leadMs),
    }))
    // Termine, deren Vorlaufzeit schon verstrichen ist, fallen weg — eine
    // Erinnerung an etwas, das gleich beginnt, hilft niemandem mehr.
    .filter((reminder) => reminder.triggerAt.getTime() > now.getTime())
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime())
    .slice(0, MAX_SCHEDULED_REMINDERS);
}

/** Der Text der Erinnerung: Uhrzeit und Treffpunkt, mehr braucht es nicht. */
function reminderBody(event: ClubEvent): string {
  const zeit = event.allDay ? 'ganztägig' : `${formatTime(event.start)} Uhr`;
  const ort = event.details.meetingPoint ?? event.location;
  return ort ? `${zeit} · ${ort}` : zeit;
}

/**
 * Findet Termine, die seit dem letzten Abgleich abgesagt wurden.
 *
 * Der praktische Nutzen der App: Wer sich das MittwochsRudel vorgemerkt hat,
 * erfährt von der Absage, bevor er im Regen am Johannisberg steht.
 *
 * `knownEventIds` sind die Termine, für die bisher eine Erinnerung vorlag.
 */
export function detectNewCancellations(knownEventIds: string[], events: ClubEvent[]): ClubEvent[] {
  const known = new Set(knownEventIds);
  return events.filter((event) => event.cancelled && known.has(event.id));
}

/**
 * Vergleicht Soll und Ist und sagt, was neu einzuplanen und was abzubestellen ist.
 *
 * Ein Abgleich statt "alles löschen und neu setzen" — sonst würde jede
 * Aktualisierung im Hintergrund sämtliche Meldungen kurz wegnehmen und neu
 * setzen, was auf Android als Flackern sichtbar werden kann.
 */
export function diffReminders(
  planned: PlannedReminder[],
  scheduled: { eventId: string; triggerAt: Date }[],
): { toSchedule: PlannedReminder[]; toCancelEventIds: string[] } {
  const scheduledByEvent = new Map(scheduled.map((entry) => [entry.eventId, entry.triggerAt.getTime()]));
  const plannedIds = new Set(planned.map((reminder) => reminder.eventId));

  const toSchedule = planned.filter((reminder) => {
    const bestehend = scheduledByEvent.get(reminder.eventId);
    // Neu, oder der Termin wurde verschoben.
    return bestehend === undefined || bestehend !== reminder.triggerAt.getTime();
  });

  const toCancelEventIds = scheduled
    .filter((entry) => !plannedIds.has(entry.eventId) || toSchedule.some((r) => r.eventId === entry.eventId))
    .map((entry) => entry.eventId);

  return { toSchedule, toCancelEventIds };
}
