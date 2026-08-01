import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { loadEvents, loadNews } from '../src/data/repository';
import { createMemoryStore, readCache } from '../src/data/store';

const kalender = fs.readFileSync(path.join(__dirname, 'fixtures/kalender-auszug.ics'), 'utf8');
const feed = fs.readFileSync(path.join(__dirname, 'fixtures/news-feed.xml'), 'utf8');

function deps(fetchText: (url: string) => Promise<string>, now = () => 1_700_000_000_000) {
  return { store: createMemoryStore(), fetchText, now };
}

describe('Daten beschaffen', () => {
  it('holt Termine aus dem Netz und wertet sie aus', async () => {
    const result = await loadEvents(deps(async () => kalender), {
      now: new Date('2024-01-01T12:00:00Z'),
      windowDaysPast: 365 * 4,
      windowDaysFuture: 365 * 4,
    });

    expect(result.fromCache).toBe(false);
    expect(result.data.length).toBe(51);
    expect(result.error).toBeUndefined();
  });

  it('holt Beiträge aus dem Netz', async () => {
    const result = await loadNews(deps(async () => feed));
    expect(result.data).toHaveLength(6);
    expect(result.fromCache).toBe(false);
  });

  it('legt die Rohdaten in den Zwischenspeicher', async () => {
    const shared = deps(async () => feed);
    await loadNews(shared);

    const cached = await readCache(shared.store, 'news');
    expect(cached?.raw).toBe(feed);
    expect(cached?.fetchedAt).toBe(1_700_000_000_000);
  });

  it('fragt nicht erneut, solange der Speicher frisch ist', async () => {
    const fetchText = vi.fn(async () => feed);
    const shared = deps(fetchText);

    await loadNews(shared);
    const zweiter = await loadNews(shared);

    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(zweiter.fromCache).toBe(true);
  });

  it('fragt erneut, wenn der Speicher veraltet ist', async () => {
    const fetchText = vi.fn(async () => feed);
    let jetzt = 1_700_000_000_000;
    const shared = { store: createMemoryStore(), fetchText, now: () => jetzt };

    await loadNews(shared);
    jetzt += 31 * 60 * 1000; // Zwischenspeicher gilt 30 Minuten
    await loadNews(shared);

    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('erzwingt einen Abruf auf Wunsch', async () => {
    const fetchText = vi.fn(async () => feed);
    const shared = deps(fetchText);

    await loadNews(shared);
    await loadNews(shared, { forceRefresh: true });

    expect(fetchText).toHaveBeenCalledTimes(2);
  });

  it('liefert bei Netzfehler den letzten bekannten Stand', async () => {
    // Der Fall im Wald: Daten sind da, das Netz nicht.
    let online = true;
    const fetchText = vi.fn(async () => {
      if (!online) throw new Error('Kein Netz');
      return feed;
    });
    let jetzt = 1_700_000_000_000;
    const shared = { store: createMemoryStore(), fetchText, now: () => jetzt };

    await loadNews(shared);
    online = false;
    jetzt += 60 * 60 * 1000;
    const result = await loadNews(shared);

    expect(result.data).toHaveLength(6);
    expect(result.fromCache).toBe(true);
    expect(result.error?.message).toBe('Kein Netz');
    // Das Alter der Daten muss sichtbar bleiben, damit die App es anzeigen kann.
    expect(result.fetchedAt?.getTime()).toBe(1_700_000_000_000);
  });

  it('meldet den Fehler, wenn es gar keine Daten gibt', async () => {
    const shared = deps(async () => {
      throw new Error('Kein Netz');
    });
    await expect(loadNews(shared)).rejects.toThrow('Kein Netz');
  });

  it('übersteht einen beschädigten Speichereintrag', async () => {
    const shared = deps(async () => feed);
    await shared.store.setItem('mtbie.cache.news', 'kein gültiges JSON {{{');

    const result = await loadNews(shared);
    expect(result.data).toHaveLength(6);
    expect(result.fromCache).toBe(false);
  });
});
