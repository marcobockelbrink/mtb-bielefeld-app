/**
 * Hält die Erinnerungs-Einstellungen bereit und hält die geplanten Meldungen
 * mit der Terminlage in Übereinstimmung.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { asyncStorageStore } from '../data/asyncStorageStore';
import { useAppData } from '../data/AppDataContext';
import { isBackgroundRefreshAvailable, updateBackgroundRefreshRegistration } from './backgroundTask';
import {
  cancelAllReminders,
  hasPermission,
  requestPermission,
  syncReminders,
  type ErlaubnisErgebnis,
} from './index';
import { defaultSettings, loadSettings, saveSettings, type NotificationSettings } from './settings';

interface NotificationState {
  settings: NotificationSettings;
  /** Einstellungen wurden noch nicht vom Speicher gelesen. */
  loading: boolean;
  /** Erlaubnis für Mitteilungen liegt vor. */
  permitted: boolean;
  /**
   * Das System lässt Aktualisierungen im Hintergrund zu. Ist das nicht der Fall
   * (Energiesparmodus, Beschränkungen), bemerkt die App Absagen erst beim
   * nächsten Öffnen — und sagt das in den Einstellungen auch.
   */
  backgroundAvailable: boolean;
  /**
   * Ändert die Einstellungen. Beim Einschalten wird die Erlaubnis angefragt;
   * wird sie verweigert, bleiben die Erinnerungen aus.
   */
  update: (changes: Partial<NotificationSettings>) => Promise<void>;
  /**
   * Wie die letzte Anfrage ausgegangen ist — `null`, solange keine lief.
   *
   * Ohne das blieb der Fehlschlag unsichtbar (Befund „H1"): `update` setzt
   * `enabled` wieder auf `false`, und damit war jede Bedingung, die eine
   * Warnung hätte zeigen können, ebenfalls wieder falsch. Der Schalter
   * sprang zurück, und das war die ganze Auskunft.
   */
  letzteErlaubnis: ErlaubnisErgebnis | null;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { events } = useAppData();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [permitted, setPermitted] = useState(false);
  const [backgroundAvailable, setBackgroundAvailable] = useState(false);
  const [letzteErlaubnis, setLetzteErlaubnis] = useState<ErlaubnisErgebnis | null>(null);

  useEffect(() => {
    void (async () => {
      const gespeichert = await loadSettings(asyncStorageStore);
      setSettings(gespeichert);
      setPermitted(await hasPermission());
      setBackgroundAvailable(await isBackgroundRefreshAvailable());
      setLoading(false);
    })();
  }, []);

  // Der Hintergrundauftrag folgt den Einstellungen: Wer keine Erinnerungen
  // will, dessen Handy soll auch nicht dafür aufgeweckt werden.
  useEffect(() => {
    if (loading) return;
    void updateBackgroundRefreshRegistration(settings.enabled);
  }, [loading, settings.enabled]);

  const update = useCallback(
    async (changes: Partial<NotificationSettings>) => {
      let next = { ...settings, ...changes };

      if (next.enabled && !settings.enabled) {
        const ergebnis = await requestPermission();
        setLetzteErlaubnis(ergebnis);
        setPermitted(ergebnis === 'erlaubt');
        // Ohne Erlaubnis wäre "eingeschaltet" eine Lüge — die App würde
        // Erinnerungen versprechen, die nie erscheinen. Warum der Schalter
        // zurückspringt, sagt jetzt `letzteErlaubnis` in der Oberfläche.
        if (ergebnis !== 'erlaubt') next = { ...next, enabled: false };
      }

      // Ein Ausschalten ist eine Entscheidung, keine Fehlermeldung: Der
      // alte Hinweis hat sich damit erledigt.
      if (!next.enabled && changes.enabled === false) setLetzteErlaubnis(null);

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
    () => ({ settings, loading, permitted, backgroundAvailable, update, letzteErlaubnis }),
    [settings, loading, permitted, backgroundAvailable, update, letzteErlaubnis],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationState {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications muss innerhalb von NotificationProvider verwendet werden');
  return context;
}
