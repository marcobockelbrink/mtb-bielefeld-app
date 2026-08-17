/**
 * Die Anbindung an `NetInfo` — getrennt von der Entscheidung in `netz.ts`,
 * damit die ohne Gerät prüfbar bleibt.
 *
 * Dasselbe Muster wie `notifications/scheduler.ts` gegenüber
 * `notifications/index.ts`: Hier steht alles, was ein echtes Telefon
 * braucht, dort die Rechnung, die man testen kann.
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
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
    // `isInternetReachable` ist die genauere Auskunft, steht aber eine
    // Weile auf `null`, während `isConnected` schon stimmt. Deshalb das
    // Genauere zuerst und der Rückfall darunter.
    const auswerten = (zustand: NetInfoState) =>
      setVerbunden(zustand.isInternetReachable ?? zustand.isConnected ?? null);

    // **Einmal aktiv fragen, nicht nur zuhören.** `addEventListener`
    // meldet sich zuverlässig erst, wenn sich etwas *ändert*. Bleibt die
    // Verbindung, wie sie ist, kommt womöglich nie ein Ereignis — und der
    // Wert stünde ewig auf `null`. Genau daran ist mein erster Anlauf
    // gescheitert (18.08.2026): Die Unterscheidung „wirklich offline"
    // gegen „fetch ist gescheitert" hing an einer Messung, die nie eintraf,
    // und die App zeigte weiter „Kein Netz" bei vollem 5G.
    void NetInfo.fetch().then(auswerten).catch(() => {});

    return NetInfo.addEventListener(auswerten);
  }, []);

  return verbunden;
}
