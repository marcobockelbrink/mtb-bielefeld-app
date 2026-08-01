/**
 * Die einzige Stelle, an der die App Daten beschafft.
 *
 * Die Bildschirme rufen `loadEvents` und `loadNews` auf und wissen nicht, ob
 * die Daten aus dem Netz oder aus dem Zwischenspeicher stammen. Genau hier
 * setzt später ein eigenes Backend an: Nur die beiden Funktionen unten müssen
 * dann eine andere Adresse abfragen — Bildschirme, Filter und Benachrichtigungen
 * bleiben unberührt.
 *
 * Grundregel: **Angezeigte Daten sind besser als keine.** Schlägt der Abruf
 * fehl, liefert die App den letzten bekannten Stand und sagt dazu, wie alt er
 * ist. Im Wald ohne Empfang ist das der Normalfall, nicht die Ausnahme.
 */

import { CACHE_TTL_MS, CALENDAR_ICS_URL, NEWS_RSS_URL } from '../config';
import type { ClubEvent, LoadResult, NewsItem } from '../domain/types';
import { parseCalendar, type ParseCalendarOptions } from './ical/parseCalendar';
import { parseFeed } from './rss/parseFeed';
import { readCache, writeCache, type KeyValueStore } from './store';

/** Nach dieser Zeit gilt ein Abruf als gescheitert. */
const REQUEST_TIMEOUT_MS = 15000;

export interface LoadOptions {
  /** Erzwingt einen Abruf, auch wenn der Zwischenspeicher noch frisch ist. */
  forceRefresh?: boolean;
}

export interface RepositoryDeps {
  store: KeyValueStore;
  fetchText?: (url: string) => Promise<string>;
  now?: () => number;
}

/** Holt Text von einer Adresse — mit Zeitgrenze, damit die App nicht hängt. */
export async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/calendar, application/rss+xml, text/xml, */*' },
    });
    if (!response.ok) {
      throw new Error(`Server antwortete mit ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Holt Rohdaten: erst der Zwischenspeicher, dann das Netz.
 *
 * Ist der Zwischenspeicher frisch, wird gar nicht erst gefragt. Ist er alt,
 * wird aktualisiert — und wenn das schiefgeht, gibt es den alten Stand
 * zusammen mit dem Fehler zurück.
 */
async function loadRaw(
  deps: RepositoryDeps,
  cacheKey: string,
  url: string,
  options: LoadOptions,
): Promise<LoadResult<string>> {
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchText ?? fetchText;

  const cached = await readCache(deps.store, cacheKey);
  const isFresh = cached !== null && now() - cached.fetchedAt < CACHE_TTL_MS;

  if (cached && isFresh && !options.forceRefresh) {
    return { data: cached.raw, fromCache: true, fetchedAt: new Date(cached.fetchedAt) };
  }

  try {
    const raw = await doFetch(url);
    const fetchedAt = now();
    await writeCache(deps.store, cacheKey, { raw, fetchedAt });
    return { data: raw, fromCache: false, fetchedAt: new Date(fetchedAt) };
  } catch (error) {
    if (cached) {
      return {
        data: cached.raw,
        fromCache: true,
        fetchedAt: new Date(cached.fetchedAt),
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    throw error;
  }
}

/** Alle Termine des Vereins, aufsteigend nach Startzeit. */
export async function loadEvents(
  deps: RepositoryDeps,
  options: LoadOptions & ParseCalendarOptions = {},
): Promise<LoadResult<ClubEvent[]>> {
  const result = await loadRaw(deps, 'kalender', CALENDAR_ICS_URL, options);
  return { ...result, data: parseCalendar(result.data, options) };
}

/** Die Beiträge aus "Aktuelles", neueste zuerst. */
export async function loadNews(
  deps: RepositoryDeps,
  options: LoadOptions = {},
): Promise<LoadResult<NewsItem[]>> {
  const result = await loadRaw(deps, 'news', NEWS_RSS_URL, options);
  return { ...result, data: parseFeed(result.data) };
}
