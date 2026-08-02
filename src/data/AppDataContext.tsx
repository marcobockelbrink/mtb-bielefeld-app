/**
 * Hält Termine und Beiträge für die ganze App bereit.
 *
 * Ein gemeinsamer Zustand statt eigener Abrufe je Bildschirm: Beim Wechsel
 * zwischen den Reitern soll nichts neu geladen werden, und Erinnerungen
 * brauchen dieselbe Terminliste wie die Anzeige.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { ClubEvent, NewsItem } from '../domain/types';
import { NEWS_INITIAL_PAGES } from '../config';
import { asyncStorageStore } from './asyncStorageStore';
import { loadEvents, loadNewsPage } from './repository';

export interface DataSlice<T> {
  data: T;
  /** Erster Ladevorgang läuft noch — die Oberfläche zeigt einen Platzhalter. */
  loading: boolean;
  /** Nutzer hat zum Aktualisieren gezogen. */
  refreshing: boolean;
  /** Angezeigte Daten stammen aus dem Zwischenspeicher. */
  fromCache: boolean;
  fetchedAt: Date | null;
  /** Letzter Fehler. Liegen trotzdem Daten vor, werden sie weiter angezeigt. */
  error: Error | null;
}

/** Der News-Bereich kann blättern — die Website hat rund 150 Beiträge. */
export interface NewsSlice extends DataSlice<NewsItem[]> {
  /** Es gibt weitere Seiten im Archiv. */
  hasMore: boolean;
  /** Gerade wird nachgeladen. */
  loadingMore: boolean;
  /** Zuletzt geholte Seite der Übersicht. */
  page: number;
}

interface AppData {
  events: DataSlice<ClubEvent[]>;
  news: NewsSlice;
  refresh: (options?: { force?: boolean }) => Promise<void>;
  /** Holt die nächste Seite des Beitragsarchivs. */
  loadMoreNews: () => Promise<void>;
}

function emptySlice<T>(initial: T): DataSlice<T> {
  return { data: initial, loading: true, refreshing: false, fromCache: false, fetchedAt: null, error: null };
}

const AppDataContext = createContext<AppData | null>(null);

/**
 * Holt die ersten Seiten der Beitragsübersicht am Stück.
 *
 * Die Website zeigt fünf Beiträge je Seite — eine einzelne Seite wäre eine sehr
 * kurze Liste. Nacheinander statt gleichzeitig, damit die Website nicht mit
 * einem Schwung Anfragen belegt wird.
 */
async function ladeErsteBeitraege(force: boolean): Promise<NewsSlice> {
  const deps = { store: asyncStorageStore };
  const alle: NewsItem[] = [];
  const bekannt = new Set<string>();

  let hasMore = true;
  let fromCache = false;
  let fetchedAt: Date | null = null;
  let error: Error | null = null;
  let seite = 0;

  for (let n = 1; n <= NEWS_INITIAL_PAGES && hasMore; n++) {
    try {
      const ergebnis = await loadNewsPage(deps, n, { forceRefresh: force });
      seite = n;
      fromCache = fromCache || ergebnis.fromCache;
      fetchedAt = ergebnis.fetchedAt ?? fetchedAt;
      error = ergebnis.error ?? error;
      hasMore = ergebnis.data.hasMore;

      for (const beitrag of ergebnis.data.items) {
        if (bekannt.has(beitrag.id)) continue;
        bekannt.add(beitrag.id);
        alle.push(beitrag);
      }
    } catch (fehler) {
      // Je Seite abfangen: Bricht die Verbindung beim Nachladen ab, sollen die
      // bereits geholten Beiträge stehen bleiben. Alles zu verwerfen, weil
      // Seite 3 nicht kam, wäre die schlechtere Antwort.
      error = fehler instanceof Error ? fehler : new Error(String(fehler));
      // Ohne die fehlende Seite lässt sich nicht sagen, ob es weitergeht — der
      // Knopf zum Nachladen bleibt deshalb stehen, sofern schon etwas da ist.
      hasMore = alle.length > 0;
      break;
    }
  }

  // Sind gar keine Beiträge angekommen, ist der Fehler nicht zu beschönigen.
  if (alle.length === 0 && error) throw error;

  return {
    data: alle,
    loading: false,
    refreshing: false,
    fromCache,
    fetchedAt,
    error,
    hasMore,
    loadingMore: false,
    page: seite,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DataSlice<ClubEvent[]>>(() => emptySlice<ClubEvent[]>([]));
  const [news, setNews] = useState<NewsSlice>(() => ({
    ...emptySlice<NewsItem[]>([]),
    hasMore: true,
    loadingMore: false,
    page: 0,
  }));

  const refresh = useCallback(async (options: { force?: boolean } = {}) => {
    const force = options.force ?? false;
    setEvents((prev) => ({ ...prev, refreshing: force }));
    setNews((prev) => ({ ...prev, refreshing: force }));

    const deps = { store: asyncStorageStore };

    // Beide Quellen unabhängig voneinander: Ist die Website nicht erreichbar,
    // sollen die Termine trotzdem ankommen.
    const [terminErgebnis, newsErgebnis] = await Promise.allSettled([
      loadEvents(deps, { forceRefresh: force }),
      ladeErsteBeitraege(force),
    ]);

    setEvents((prev) => applyResult(prev, terminErgebnis));

    if (newsErgebnis.status === 'rejected') {
      const fehler =
        newsErgebnis.reason instanceof Error ? newsErgebnis.reason : new Error(String(newsErgebnis.reason));
      setNews((prev) => ({ ...prev, loading: false, refreshing: false, error: fehler }));
    } else {
      setNews({ ...newsErgebnis.value, loadingMore: false });
    }
  }, []);

  /**
   * Holt die nächste Seite des Archivs und hängt sie an.
   *
   * Doppelte Beiträge werden dabei entfernt: Veröffentlicht der Verein während
   * des Blätterns einen neuen Beitrag, verschieben sich alle anderen um einen
   * Platz nach hinten und tauchen sonst zweimal auf.
   */
  const naechsteSeite = useRef(1);
  const loadMoreNews = useCallback(async () => {
    let laeuftSchon = false;
    setNews((prev) => {
      laeuftSchon = prev.loadingMore || !prev.hasMore || prev.loading;
      if (!laeuftSchon) naechsteSeite.current = prev.page + 1;
      return laeuftSchon ? prev : { ...prev, loadingMore: true };
    });
    if (laeuftSchon) return;

    try {
      const naechste = await loadNewsPage({ store: asyncStorageStore }, naechsteSeite.current);
      setNews((prev) => {
        const bekannt = new Set(prev.data.map((beitrag) => beitrag.id));
        const neue = naechste.data.items.filter((beitrag) => !bekannt.has(beitrag.id));
        return {
          ...prev,
          data: [...prev.data, ...neue],
          hasMore: naechste.data.hasMore,
          loadingMore: false,
          page: prev.page + 1,
        };
      });
    } catch {
      // Nachladen darf still scheitern — das Vorhandene bleibt stehen.
      setNews((prev) => ({ ...prev, loadingMore: false }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AppData>(
    () => ({ events, news, refresh, loadMoreNews }),
    [events, news, refresh, loadMoreNews],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

/**
 * Übernimmt ein Abrufergebnis in den Zustand.
 *
 * Bei einem Fehlschlag bleiben vorhandene Daten stehen — ein leerer Bildschirm
 * wäre die schlechtere Antwort als eine Liste mit Hinweis auf ihr Alter.
 */
function applyResult<T>(previous: DataSlice<T>, result: PromiseSettledResult<{
  data: T;
  fromCache: boolean;
  fetchedAt: Date | null;
  error?: Error;
}>): DataSlice<T> {
  if (result.status === 'rejected') {
    const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
    return { ...previous, loading: false, refreshing: false, error };
  }

  return {
    data: result.value.data,
    loading: false,
    refreshing: false,
    fromCache: result.value.fromCache,
    fetchedAt: result.value.fetchedAt,
    error: result.value.error ?? null,
  };
}

export function useAppData(): AppData {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData muss innerhalb von AppDataProvider verwendet werden');
  return context;
}
