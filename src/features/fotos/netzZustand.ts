/**
 * Die Anbindung an `NetInfo` — getrennt von der Entscheidung in `netz.ts`,
 * damit die ohne Gerät prüfbar bleibt.
 *
 * Dasselbe Muster wie `notifications/scheduler.ts` gegenüber
 * `notifications/index.ts`: Hier steht alles, was ein echtes Telefon
 * braucht, dort die Rechnung, die man testen kann.
 */

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * `null`, solange nichts gemessen wurde — und das ist ein eigener Zustand,
 * kein „nein". `darfJetztHochladen` lädt in dem Fall hoch, statt zu warten.
 */
export function useImWlan(): boolean | null {
  const [imWlan, setImWlan] = useState<boolean | null>(null);

  useEffect(() => {
    const abbestellen = NetInfo.addEventListener((zustand) => {
      setImWlan(zustand.type === 'wifi' && zustand.isConnected !== false);
    });
    return abbestellen;
  }, []);

  return imWlan;
}
