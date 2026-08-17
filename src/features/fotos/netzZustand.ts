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

/**
 * Ob das Gerät überhaupt eine Verbindung hat — WLAN oder Mobilfunk.
 *
 * Gebraucht, um den Ratschlag „prüf deine Verbindung" zu **belegen**,
 * statt ihn zu behaupten. `ApiFehler.ohneNetz` heißt nur, dass `fetch`
 * geworfen hat; auf einem Telefon mit 5G ist das etwas anderes als ein
 * Funkloch. Genau die Verwechslung hat den Foto-Upload unauffindbar
 * gemacht — die Screenshots vom 17.08.2026 zeigen „KEIN NETZ" bei vollem
 * 5G, und darunter einen Hinweis, das Bild warte auf Netz.
 *
 * `null` heißt „noch nicht gemessen" und ist ein eigener Zustand, kein
 * „nein": Dann wird nichts behauptet.
 */
export function useVerbunden(): boolean | null {
  const [verbunden, setVerbunden] = useState<boolean | null>(null);

  useEffect(() => {
    const abbestellen = NetInfo.addEventListener((zustand) => {
      // `isInternetReachable` ist die genauere Auskunft, steht aber kurz
      // nach dem Start eine Weile auf `null`, während `isConnected` schon
      // stimmt. Deshalb das Genauere zuerst und der Rückfall darunter.
      setVerbunden(zustand.isInternetReachable ?? zustand.isConnected ?? null);
    });
    return abbestellen;
  }, []);

  return verbunden;
}
