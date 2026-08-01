import { describe, expect, it, vi } from 'vitest';

import type { ClubEvent } from '../src/domain/types';
import { runBackgroundRefresh, type BackgroundRefreshDeps } from '../src/notifications/backgroundRefresh';
import { defaultSettings, type NotificationSettings } from '../src/notifications/settings';

function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = new Date('2026-05-06T16:00:00Z');
  return {
    id: 't#1',
    uid: 't',
    title: 'MittwochsRudel',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    descriptionHtml: '',
    descriptionText: '',
    category: 'treff',
    levels: [],
    ladiesOnly: false,
    cancelled: false,
    recurring: true,
    details: { guides: [] },
    ...overrides,
  };
}

function deps(overrides: Partial<BackgroundRefreshDeps> = {}): BackgroundRefreshDeps {
  return {
    loadSettings: async () => ({ ...defaultSettings, enabled: true }),
    loadEvents: async () => [termin()],
    syncReminders: async () => ({ scheduled: 1, cancelled: 0, newlyCancelled: [] }),
    ...overrides,
  };
}

describe('Aktualisierung im Hintergrund', () => {
  it('lädt nichts, wenn Erinnerungen abgeschaltet sind', async () => {
    // Ein Hintergrundauftrag, der ohne Nutzen Daten zieht, verbraucht fremdes
    // Datenvolumen und fremden Akku.
    const loadEvents = vi.fn(async () => [termin()]);
    const ergebnis = await runBackgroundRefresh(
      deps({ loadSettings: async () => defaultSettings, loadEvents }),
    );

    expect(ergebnis).toBe('uebersprungen');
    expect(loadEvents).not.toHaveBeenCalled();
  });

  it('lädt und gleicht ab, wenn Erinnerungen an sind', async () => {
    const syncReminders = vi.fn(async () => ({ scheduled: 1, cancelled: 0, newlyCancelled: [] }));
    const ergebnis = await runBackgroundRefresh(deps({ syncReminders }));

    expect(ergebnis).toBe('aktualisiert');
    expect(syncReminders).toHaveBeenCalledOnce();
  });

  it('gibt die geladenen Termine an den Abgleich weiter', async () => {
    const abgesagt = termin({ cancelled: true });
    let uebergeben: ClubEvent[] = [];

    await runBackgroundRefresh(
      deps({
        loadEvents: async () => [abgesagt],
        syncReminders: async (events) => {
          uebergeben = events;
          return { scheduled: 0, cancelled: 1, newlyCancelled: [abgesagt] };
        },
      }),
    );

    expect(uebergeben).toEqual([abgesagt]);
  });

  it('meldet einen Fehlschlag, wenn das Netz fehlt', async () => {
    // Im Hintergrund der Normalfall — das System versucht es später erneut.
    const ergebnis = await runBackgroundRefresh(
      deps({
        loadEvents: async () => {
          throw new Error('Kein Netz');
        },
      }),
    );

    expect(ergebnis).toBe('fehlgeschlagen');
  });

  it('bricht nicht ab, wenn die Einstellungen nicht lesbar sind', async () => {
    const ergebnis = await runBackgroundRefresh(
      deps({
        loadSettings: async () => {
          throw new Error('Speicher kaputt');
        },
      }),
    );

    expect(ergebnis).toBe('fehlgeschlagen');
  });

  it('meldet einen Fehlschlag, wenn der Abgleich scheitert', async () => {
    const ergebnis = await runBackgroundRefresh(
      deps({
        syncReminders: async () => {
          throw new Error('Mitteilung abgelehnt');
        },
      }),
    );

    expect(ergebnis).toBe('fehlgeschlagen');
  });

  it('beachtet die Kategorienauswahl, indem es sie durchreicht', async () => {
    const eigene: NotificationSettings = {
      ...defaultSettings,
      enabled: true,
      categories: ['werkstatt'],
    };
    let verwendet: NotificationSettings | null = null;

    await runBackgroundRefresh(
      deps({
        loadSettings: async () => eigene,
        syncReminders: async (_events, settings) => {
          verwendet = settings;
          return { scheduled: 0, cancelled: 0, newlyCancelled: [] };
        },
      }),
    );

    expect(verwendet).toEqual(eigene);
  });
});
