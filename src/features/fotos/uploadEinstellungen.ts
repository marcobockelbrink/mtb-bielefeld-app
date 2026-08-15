/**
 * Die Einstellung „Nur über WLAN hochladen" — Speicher und Hook.
 *
 * Bewusst **nicht** in `notifications/settings.ts`: Das sind Erinnerungen,
 * das hier ist der Datentarif. Zwei Dinge, die nur zufällig beide
 * Einstellungen sind.
 *
 * Voreinstellung ist **an**, mit 5 MB Freigrenze: Eine Tour bringt leicht
 * dreißig Bilder mit, und die ungefragt über Mobilfunk zu schicken wäre die
 * unangenehmere Überraschung als ein paar Bilder, die warten.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import type { Freigrenze } from './netz';

const SCHLUESSEL = 'foto-upload-einstellungen';

export interface UploadEinstellungen {
  nurUeberWlan: boolean;
  freigrenze: Freigrenze;
}

export const VORGABE: UploadEinstellungen = { nurUeberWlan: true, freigrenze: '5mb' };

/** Kaputtes verwerfen statt daran ersticken — wie bei der Warteschlange. */
export function ausJson(roh: string | null): UploadEinstellungen {
  if (!roh) return VORGABE;
  try {
    const daten: unknown = JSON.parse(roh);
    if (typeof daten !== 'object' || daten === null) return VORGABE;
    const eintrag = daten as Partial<UploadEinstellungen>;
    return {
      nurUeberWlan:
        typeof eintrag.nurUeberWlan === 'boolean' ? eintrag.nurUeberWlan : VORGABE.nurUeberWlan,
      freigrenze:
        eintrag.freigrenze === 'nie' || eintrag.freigrenze === '5mb' || eintrag.freigrenze === '20mb'
          ? eintrag.freigrenze
          : VORGABE.freigrenze,
    };
  } catch {
    return VORGABE;
  }
}

export async function lies(): Promise<UploadEinstellungen> {
  return ausJson(await AsyncStorage.getItem(SCHLUESSEL));
}

export async function schreib(werte: UploadEinstellungen): Promise<void> {
  await AsyncStorage.setItem(SCHLUESSEL, JSON.stringify(werte));
}

export function useUploadEinstellungen() {
  const [werte, setWerte] = useState<UploadEinstellungen>(VORGABE);

  useEffect(() => {
    void lies().then(setWerte);
  }, []);

  const aendere = useCallback(async (teil: Partial<UploadEinstellungen>) => {
    // Erst anzeigen, dann schreiben: Ein Schalter, der eine Sekunde nichts
    // tut, wird zweimal gedrückt — dieselbe Regel wie beim Jugend-Abo.
    setWerte((alt) => {
      const neu = { ...alt, ...teil };
      void schreib(neu);
      return neu;
    });
  }, []);

  return { werte, aendere };
}
