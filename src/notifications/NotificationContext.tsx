/**
 * Hält die Erinnerungs-Einstellungen bereit und hält die geplanten Meldungen
 * mit der Terminlage in Übereinstimmung.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { asyncStorageStore } from '../data/asyncStorageStore';
import { useAppData } from '../data/AppDataContext';
import { cancelAllReminders, hasPermission, requestPermission, syncReminders } from './index';
import { defaultSettings, loadSettings, saveSettings, type NotificationSettings } from './settings';

interface NotificationState {
  settings: NotificationSettings;
  /** Einstellungen wurden noch nicht vom Speicher gelesen. */
  loading: boolean;
  /** Erlaubnis für Mitteilungen liegt vor. */
  permitted: boolean;
  /**
   * Ändert die Einstellungen. Beim Einschalten wird die Erlaubnis angefragt;
   * wird sie verweigert, bleiben die Erinnerungen aus.
   */
  update: (changes: Partial<NotificationSettings>) => Promise<void>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { events } = useAppData();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [permitted, setPermitted] = useState(false);

  useEffect(() => {
    void (async () => {
      const gespeichert = await loadSettings(asyncStorageStore);
      setSettings(gespeichert);
      setPermitted(await hasPermission());
      setLoading(false);
    })();
  }, []);

  const update = useCallback(
    async (changes: Partial<NotificationSettings>) => {
      let next = { ...settings, ...changes };

      if (next.enabled && !settings.enabled) {
        const erlaubt = await requestPermission();
        setPermitted(erlaubt);
        // Ohne Erlaubnis wäre "eingeschaltet" eine Lüge — die App würde
        // Erinnerungen versprechen, die nie erscheinen.
        if (!erlaubt) next = { ...next, enabled: false };
      }

      setSettings(next);
      await saveSettings(asyncStorageStore, next);

      if (!next.enabled) await cancelAllReminders();
    },
    [settings],
  );

  // Erinnerungen nachziehen, sobald sich Termine oder Einstellungen ändern.
  // Ein Verweis auf den letzten Abgleich verhindert, dass jede Neuzeichnung
  // der Oberfläche einen weiteren Abgleich auslöst.
  const lastSync = useRef<string>('');
  useEffect(() => {
    if (loading || events.loading) return;

    const kennung = `${settings.enabled}|${settings.leadMinutes}|${settings.categories.join(',')}|${events.data.length}|${events.fetchedAt?.getTime() ?? 0}`;
    if (kennung === lastSync.current) return;
    lastSync.current = kennung;

    void syncReminders(events.data, settings).catch(() => {
      // Ein fehlgeschlagener Abgleich darf die App nicht stören; beim nächsten
      // Datenabruf wird es erneut versucht.
    });
  }, [events.data, events.fetchedAt, events.loading, loading, settings]);

  const value = useMemo<NotificationState>(
    () => ({ settings, loading, permitted, update }),
    [settings, loading, permitted, update],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationState {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications muss innerhalb von NotificationProvider verwendet werden');
  return context;
}
