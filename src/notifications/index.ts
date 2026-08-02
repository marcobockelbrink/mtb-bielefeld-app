/**
 * Anbindung der Erinnerungen an das Betriebssystem.
 *
 * Bewusst ohne Server: Es werden ausschließlich **lokale** Meldungen geplant.
 * Das Handy weiß, wann das MittwochsRudel startet, und meldet sich selbst — der
 * Verein braucht dafür keinen Dienst zu betreiben und keine Geräte-Adressen zu
 * verwalten. Datenschutzrechtlich ist das die schlankste Lösung: Es verlässt
 * kein Gerätekennzeichen das Handy.
 *
 * Die Planungslogik steht in `scheduler.ts` und ist dort ohne Gerät geprüft.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ClubEvent } from '../domain/types';
import { formatShortDate, formatTime } from '../features/events/format';
import { diffReminders, planReminders, type PlannedReminder } from './scheduler';
import type { NotificationSettings } from './settings';

/** Kennzeichnet Meldungen dieser App in den Zusatzdaten. */
const REMINDER_KIND = 'termin-erinnerung';
const ANDROID_CHANNEL_ID = 'termine';

/** Legt fest, wie Meldungen bei geöffneter App erscheinen. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Fragt die Erlaubnis für Mitteilungen an.
 *
 * Wird erst aufgerufen, wenn der Nutzer Erinnerungen einschaltet — ungefragt
 * beim ersten Start danach zu fragen, ist der sicherste Weg zu einem Nein.
 */
export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Termin-Erinnerungen',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#076c9b',
    });
  }

  const bestehend = await Notifications.getPermissionsAsync();
  if (bestehend.granted) return true;
  if (!bestehend.canAskAgain) return false;

  const angefragt = await Notifications.requestPermissionsAsync();
  return angefragt.granted;
}

export async function hasPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

interface ScheduledReminder {
  identifier: string;
  eventId: string;
  triggerAt: Date;
}

/** Liest die bereits eingeplanten Erinnerungen dieser App aus. */
async function readScheduled(): Promise<ScheduledReminder[]> {
  const alle = await Notifications.getAllScheduledNotificationsAsync();
  const eigene: ScheduledReminder[] = [];

  for (const eintrag of alle) {
    const daten = eintrag.content.data as { kind?: string; eventId?: string; triggerAt?: number } | null;
    if (!daten || daten.kind !== REMINDER_KIND || !daten.eventId || !daten.triggerAt) continue;
    eigene.push({
      identifier: eintrag.identifier,
      eventId: daten.eventId,
      triggerAt: new Date(daten.triggerAt),
    });
  }
  return eigene;
}

async function schedule(reminder: PlannedReminder): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.title,
      body: reminder.body,
      data: {
        kind: REMINDER_KIND,
        eventId: reminder.eventId,
        // Die geplante Zeit mitzuspeichern erspart es, den Auslöser
        // plattformabhängig wieder auseinanderzunehmen.
        triggerAt: reminder.triggerAt.getTime(),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.triggerAt,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
  });
}

export interface SyncResult {
  scheduled: number;
  cancelled: number;
  /** Termine, die seit dem letzten Abgleich abgesagt wurden. */
  newlyCancelled: ClubEvent[];
}

/**
 * Gleicht die eingeplanten Erinnerungen mit der aktuellen Terminlage ab.
 *
 * Wird nach jedem Datenabruf aufgerufen — auch im Hintergrund. Dadurch wandern
 * verschobene Termine automatisch mit, und Absagen fallen auf.
 */
export async function syncReminders(
  events: ClubEvent[],
  settings: NotificationSettings,
  now: Date = new Date(),
): Promise<SyncResult> {
  const bestand = await readScheduled();

  // Absagen erkennen, bevor die Erinnerungen dazu verschwinden: `planReminders`
  // lässt abgesagte Termine weg, danach wäre die Spur weg.
  const vorgemerkt = new Set(bestand.map((eintrag) => eintrag.eventId));
  const newlyCancelled = settings.notifyOnCancellation
    ? events.filter((event) => event.cancelled && vorgemerkt.has(event.id))
    : [];

  const geplant = planReminders(events, settings, now);
  const { toSchedule, toCancelEventIds } = diffReminders(geplant, bestand);

  const abzubestellen = new Set(toCancelEventIds);
  for (const eintrag of bestand) {
    if (abzubestellen.has(eintrag.eventId)) {
      await Notifications.cancelScheduledNotificationAsync(eintrag.identifier);
    }
  }
  for (const reminder of toSchedule) {
    await schedule(reminder);
  }

  for (const event of newlyCancelled) {
    await notifyCancellation(event);
  }

  return { scheduled: toSchedule.length, cancelled: abzubestellen.size, newlyCancelled };
}

/** Meldet eine Absage sofort — dafür wartet niemand auf den nächsten Termin. */
async function notifyCancellation(event: ClubEvent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Abgesagt: ${event.title}`,
      body: `${formatShortDate(event.start)}, ${formatTime(event.start)} Uhr findet nicht statt.`,
      data: { kind: 'absage', eventId: event.id },
    },
    trigger: null, // sofort
  });
}

/** Entfernt alle von dieser App geplanten Erinnerungen. */
export async function cancelAllReminders(): Promise<void> {
  for (const eintrag of await readScheduled()) {
    await Notifications.cancelScheduledNotificationAsync(eintrag.identifier);
  }
}
