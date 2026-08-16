/**
 * Welche Erinnerungen wann fällig sind.
 *
 * Reine Rechenlogik ohne Bezug zu Expo oder React Native — dadurch prüfbar,
 * ohne ein Gerät zu starten. Die Anbindung an das Betriebssystem passiert in
 * `index.ts`.
 */

import type { ClubEvent } from '../domain/types';
import { formatShortDate, formatTime } from '../features/events/format';
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
 * Was der gewählte Vorlauf in Uhrzeiten heißt — Befund „H2" aus dem
 * Usability-Review vom 15.08.2026.
 *
 * „2 Stunden vorher" ist eine Rechenaufgabe, keine Auskunft. Der Satz
 * nimmt sie ab, und zwar am **nächsten wirklich anstehenden Termin**: Ein
 * erfundenes Beispiel wäre zwar auch greifbar, aber „bei deiner Tour am
 * Mittwoch" beantwortet die Frage, die jemand tatsächlich hat.
 *
 * Zwei Fälle führen bewusst auf das allgemeine Beispiel zurück:
 * - Es steht nichts an, das zu den Einstellungen passt.
 * - Der Weckzeitpunkt liegt schon in der Vergangenheit. Dann *würde* für
 *   diesen Termin nichts mehr kommen (`planReminders` wirft ihn weg), und
 *   „meldet sich" wäre schlicht falsch.
 */
export function beschreibeVorlauf(
  leadMinutes: number,
  naechsterStart: Date | null,
  now: Date = new Date(),
): string {
  if (naechsterStart) {
    const weckzeit = new Date(naechsterStart.getTime() - leadMinutes * 60 * 1000);
    if (weckzeit.getTime() > now.getTime()) {
      // Fällt die Erinnerung auf einen anderen Tag als der Termin (bei „Am
      // Tag vorher" der Normalfall), muss das Datum mit — sonst liest sich
      // „um 20:00 Uhr" als der Abend des Termins selbst.
      const anderertag = formatShortDate(weckzeit) !== formatShortDate(naechsterStart);
      const wann = anderertag
        ? `am ${formatShortDate(weckzeit)} um ${formatTime(weckzeit)} Uhr`
        : `um ${formatTime(weckzeit)} Uhr`;
      return `Beim nächsten Termin am ${formatShortDate(naechsterStart)} um ${formatTime(naechsterStart)} Uhr meldet sich dein Handy ${wann}.`;
    }
  }

  // Das allgemeine Beispiel. 20:00 Uhr, weil die Touren des Vereins abends
  // starten — die Zahl wirkt dadurch nicht willkürlich.
  //
  // Bewusst in Minuten gerechnet statt über ein `Date`: Die Formatierer
  // arbeiten in Vereinszeit, ein hier gebautes `Date` entstünde aber in der
  // Zeitzone des Geräts. Auf einem Telefon in Bielefeld fiele der
  // Unterschied nie auf, in der Prüfung auf einem Rechner mit UTC sofort.
  const START = 20 * 60;
  const roh = START - leadMinutes;
  const tageVorher = roh < 0 ? Math.ceil(-roh / (24 * 60)) : 0;
  const minuten = ((roh % (24 * 60)) + 24 * 60) % (24 * 60);
  const uhrzeit = `${String(Math.floor(minuten / 60)).padStart(2, '0')}:${String(minuten % 60).padStart(2, '0')}`;
  const tagText = tageVorher === 0 ? '' : tageVorher === 1 ? ' am Tag davor' : ` ${tageVorher} Tage davor`;

  return `Zum Beispiel: Tour um 20:00 Uhr, Erinnerung${tagText} um ${uhrzeit} Uhr.`;
}

/**
 * Der nächste Termin, für den nach den Einstellungen erinnert würde.
 *
 * Getrennt von `beschreibeVorlauf`, damit der Satz auch ohne Terminliste
 * prüfbar bleibt — und weil die Auswahlregel dieselbe sein muss wie in
 * `planReminders`. Liefe sie auseinander, nennte der Satz einen Termin, zu
 * dem nie eine Meldung käme.
 */
export function naechsterErinnerterTermin(
  events: ClubEvent[],
  settings: NotificationSettings,
  now: Date = new Date(),
): Date | null {
  const kommend = events
    .filter((event) => !event.cancelled)
    .filter((event) => settings.categories.length === 0 || settings.categories.includes(event.category))
    .filter((event) => event.start.getTime() > now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return kommend[0]?.start ?? null;
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
