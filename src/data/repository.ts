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

import { CACHE_TTL_MS, CALENDAR_ICS_URL, NEWS_RSS_URL, newsPageUrl, websiteUrl } from '../config';
import type { ClubEvent, LoadResult, NewsItem } from '../domain/types';
import { parseCalendar, type ParseCalendarOptions } from './ical/parseCalendar';
import { parseFeed } from './rss/parseFeed';
import { hasNextPage, parseArticle, parseEntries } from './web/parseEntries';
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

/**
 * Eine Seite der Beitragsübersicht.
 *
 * Gelesen wird die HTML-Seite der Website, nicht der RSS-Feed: Nur dort stehen
 * die Themen ("Racing", "Jugend", …) und nur dort lässt sich blättern. Näheres
 * in `data/web/parseEntries.ts`.
 *
 * Scheitert das Auswerten — etwa weil die Website umgebaut wurde —, greift der
 * RSS-Feed als Rückfallebene. Der kennt keine Themen, liefert aber wenigstens
 * die neuesten Beiträge.
 */
export async function loadNewsPage(
  deps: RepositoryDeps,
  seite: number,
  options: LoadOptions = {},
): Promise<LoadResult<{ items: NewsItem[]; hasMore: boolean }>> {
  const result = await loadRaw(deps, `beitraege-${seite}`, newsPageUrl(seite), options);
  const items = parseEntries(result.data);

  if (items.length > 0) {
    return { ...result, data: { items, hasMore: hasNextPage(result.data) } };
  }

  // Rückfallebene: nur für die erste Seite sinnvoll, der Feed kennt keine
  // Seitenzahlen.
  if (seite > 1) return { ...result, data: { items: [], hasMore: false } };

  const feed = await loadRaw(deps, 'news', NEWS_RSS_URL, options);
  return { ...feed, data: { items: parseFeed(feed.data), hasMore: false } };
}

/**
 * Der vollständige Text eines Beitrags.
 *
 * Sowohl die Übersicht als auch der RSS-Feed kürzen nach wenigen Zeilen ab und
 * hängen "Lies mehr…" an. Der ganze Beitrag steht nur auf seiner eigenen Seite
 * und wird deshalb erst geholt, wenn ihn jemand öffnet.
 */
export async function loadArticle(
  deps: RepositoryDeps,
  link: string,
  options: LoadOptions = {},
): Promise<LoadResult<NewsItem | null>> {
  const pfad = link.replace(/^https?:\/\/[^/]+/, '');
  const result = await loadRaw(deps, `beitrag${pfad.replace(/\W+/g, '-')}`, websiteUrl(pfad), options);
  return { ...result, data: parseArticle(result.data, link) };
}

/** Die Beiträge aus dem RSS-Feed, neueste zuerst. Rückfallebene und Notnagel. */
export async function loadNews(
  deps: RepositoryDeps,
  options: LoadOptions = {},
): Promise<LoadResult<NewsItem[]>> {
  const result = await loadRaw(deps, 'news', NEWS_RSS_URL, options);
  return { ...result, data: parseFeed(result.data) };
}
