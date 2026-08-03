import { describe, expect, it } from 'vitest';

import type { ClubEvent } from '../src/domain/types';
import {
  detectNewCancellations,
  diffReminders,
  MAX_SCHEDULED_REMINDERS,
  planReminders,
} from '../src/notifications/scheduler';
import { defaultSettings, loadSettings, saveSettings } from '../src/notifications/settings';
import { createMemoryStore } from '../src/data/store';

const JETZT = new Date('2026-05-06T08:00:00Z');

function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = overrides.start ?? new Date('2026-05-06T16:00:00Z');
  return {
    id: `t#${start.getTime()}`,
    originalStartInstant: start.getTime(),
    uid: 't',
    title: 'MittwochsRudel',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Johannisberg info point, Dornberger Str. 53, 33615 Bielefeld',
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

const an = { ...defaultSettings, enabled: true, leadMinutes: 120 };

describe('Erinnerungen planen', () => {
  it('plant nichts, solange sie abgeschaltet sind', () => {
    expect(planReminders([termin()], defaultSettings, JETZT)).toEqual([]);
  });

  it('erinnert mit dem eingestellten Vorlauf', () => {
    const [erinnerung] = planReminders([termin()], an, JETZT);
    // Termin 18:00 Ortszeit (16:00 UTC), zwei Stunden Vorlauf.
    expect(erinnerung.triggerAt.toISOString()).toBe('2026-05-06T14:00:00.000Z');
    expect(erinnerung.title).toBe('MittwochsRudel');
    expect(erinnerung.body).toContain('18:00 Uhr');
    expect(erinnerung.body).toContain('Johannisberg');
  });

  it('nennt den Abfahrtsort, wenn er genauer ist als das Ortsfeld', () => {
    const t = termin({ details: { guides: [], meetingPoint: 'Parkplatz Eisgrund' } });
    expect(planReminders([t], an, JETZT)[0].body).toContain('Parkplatz Eisgrund');
  });

  it('lässt abgesagte Termine aus', () => {
    expect(planReminders([termin({ cancelled: true })], an, JETZT)).toEqual([]);
  });

  it('überspringt Termine, deren Vorlauf schon verstrichen ist', () => {
    // Termin in einer Stunde, Vorlauf zwei Stunden — der Zug ist abgefahren.
    const gleich = termin({ start: new Date('2026-05-06T09:00:00Z') });
    expect(planReminders([gleich], an, JETZT)).toEqual([]);
  });

  it('beachtet die gewählten Kategorien', () => {
    const termine = [termin({ category: 'treff' }), termin({ id: 'w#1', category: 'werkstatt' })];
    const nurWerkstatt = { ...an, categories: ['werkstatt' as const] };
    const geplant = planReminders(termine, nurWerkstatt, JETZT);
    expect(geplant).toHaveLength(1);
    expect(geplant[0].eventId).toBe('w#1');
  });

  it('plant chronologisch und begrenzt die Anzahl', () => {
    // iOS verwirft alles über 64 vorgemerkten Meldungen stillschweigend.
    const viele = Array.from({ length: 100 }, (_, i) =>
      termin({ start: new Date(JETZT.getTime() + (i + 1) * 24 * 60 * 60 * 1000) }),
    );
    const geplant = planReminders(viele, an, JETZT);

    expect(geplant).toHaveLength(MAX_SCHEDULED_REMINDERS);
    const zeiten = geplant.map((r) => r.triggerAt.getTime());
    expect([...zeiten].sort((a, b) => a - b)).toEqual(zeiten);
  });
});

describe('Absagen erkennen', () => {
  it('meldet einen vorgemerkten Termin, der abgesagt wurde', () => {
    const abgesagt = termin({ cancelled: true });
    expect(detectNewCancellations([abgesagt.id], [abgesagt])).toHaveLength(1);
  });

  it('schweigt bei Absagen, die niemanden betreffen', () => {
    const abgesagt = termin({ cancelled: true });
    expect(detectNewCancellations([], [abgesagt])).toEqual([]);
  });

  it('schweigt bei Terminen, die stattfinden', () => {
    const t = termin();
    expect(detectNewCancellations([t.id], [t])).toEqual([]);
  });
});

describe('Abgleich mit dem Bestand', () => {
  it('plant nur wirklich Neues ein', () => {
    const geplant = planReminders([termin()], an, JETZT);
    const bestand = geplant.map((r) => ({ eventId: r.eventId, triggerAt: r.triggerAt }));

    const { toSchedule, toCancelEventIds } = diffReminders(geplant, bestand);
    expect(toSchedule).toEqual([]);
    expect(toCancelEventIds).toEqual([]);
  });

  it('setzt eine Erinnerung bei verschobenem Termin neu', () => {
    const geplant = planReminders([termin()], an, JETZT);
    const alterBestand = [
      { eventId: geplant[0].eventId, triggerAt: new Date('2026-05-06T13:00:00Z') },
    ];

    const { toSchedule, toCancelEventIds } = diffReminders(geplant, alterBestand);
    expect(toSchedule).toHaveLength(1);
    expect(toCancelEventIds).toEqual([geplant[0].eventId]);
  });

  it('bestellt Erinnerungen ab, die nicht mehr vorgesehen sind', () => {
    const bestand = [{ eventId: 'weg#1', triggerAt: new Date('2026-05-06T14:00:00Z') }];
    const { toSchedule, toCancelEventIds } = diffReminders([], bestand);
    expect(toSchedule).toEqual([]);
    expect(toCancelEventIds).toEqual(['weg#1']);
  });
});

describe('Einstellungen speichern', () => {
  it('liefert Vorgaben, wenn nichts gespeichert ist', async () => {
    expect(await loadSettings(createMemoryStore())).toEqual(defaultSettings);
  });

  it('speichert und lädt', async () => {
    const store = createMemoryStore();
    const eigene = { ...defaultSettings, enabled: true, leadMinutes: 180, categories: ['tour' as const] };
    await saveSettings(store, eigene);
    expect(await loadSettings(store)).toEqual(eigene);
  });

  it('ergänzt fehlende Felder aus einer älteren Fassung', async () => {
    const store = createMemoryStore();
    await store.setItem('mtbie.notifications', JSON.stringify({ enabled: true }));

    const geladen = await loadSettings(store);
    expect(geladen.enabled).toBe(true);
    expect(geladen.leadMinutes).toBe(defaultSettings.leadMinutes);
    expect(geladen.notifyOnCancellation).toBe(defaultSettings.notifyOnCancellation);
  });

  it('übersteht beschädigte Einstellungen', async () => {
    const store = createMemoryStore();
    await store.setItem('mtbie.notifications', 'kaputt {{{');
    expect(await loadSettings(store)).toEqual(defaultSettings);
  });
});
