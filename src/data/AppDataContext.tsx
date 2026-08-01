/**
 * Hält Termine und Beiträge für die ganze App bereit.
 *
 * Ein gemeinsamer Zustand statt eigener Abrufe je Bildschirm: Beim Wechsel
 * zwischen den Reitern soll nichts neu geladen werden, und Erinnerungen
 * brauchen dieselbe Terminliste wie die Anzeige.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ClubEvent, NewsItem } from '../domain/types';
import { asyncStorageStore } from './asyncStorageStore';
import { loadEvents, loadNews } from './repository';

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

interface AppData {
  events: DataSlice<ClubEvent[]>;
  news: DataSlice<NewsItem[]>;
  refresh: (options?: { force?: boolean }) => Promise<void>;
}

function emptySlice<T>(initial: T): DataSlice<T> {
  return { data: initial, loading: true, refreshing: false, fromCache: false, fetchedAt: null, error: null };
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<DataSlice<ClubEvent[]>>(() => emptySlice<ClubEvent[]>([]));
  const [news, setNews] = useState<DataSlice<NewsItem[]>>(() => emptySlice<NewsItem[]>([]));

  const refresh = useCallback(async (options: { force?: boolean } = {}) => {
    const force = options.force ?? false;
    setEvents((prev) => ({ ...prev, refreshing: force }));
    setNews((prev) => ({ ...prev, refreshing: force }));

    const deps = { store: asyncStorageStore };

    // Beide Quellen unabhängig voneinander: Ist die Website nicht erreichbar,
    // sollen die Termine trotzdem ankommen.
    const [terminErgebnis, newsErgebnis] = await Promise.allSettled([
      loadEvents(deps, { forceRefresh: force }),
      loadNews(deps, { forceRefresh: force }),
    ]);

    setEvents((prev) => applyResult(prev, terminErgebnis));
    setNews((prev) => applyResult(prev, newsErgebnis));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AppData>(() => ({ events, news, refresh }), [events, news, refresh]);
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
