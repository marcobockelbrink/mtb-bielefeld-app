/**
 * Der schlüsselbundgestützte `TokenSpeicher` (iOS Keychain, Android Keystore).
 *
 * In einer eigenen Datei, getrennt von `tokenSpeicher.ts`: Der Import von
 * `expo-secure-store` zieht React Native nach, dessen Quelltext Flow-Syntax
 * enthält — vitest kann sie ohne Babel-Transformation für React Native nicht
 * einlesen. Bliebe dieser Import in `tokenSpeicher.ts`, würde jeder Test
 * scheitern, der von dort auch nur `speicherImArbeitsspeicher` einbindet.
 * Dasselbe Muster wie `asyncStorageStore.ts` gegenüber `store.ts`:
 * Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar bleibt; die
 * Anbindung ans Betriebssystem steht daneben, ungetestet, weil sie nur ein
 * dünner Aufruf der Plattform-API ist.
 *
 * **Im Browser gibt es keinen Schlüsselbund.** `npm run vorschau` baut und
 * rendert die Web-Fassung, um Renderfehler zu finden — dort scheiterte jeder
 * Aufruf mit `getValueWithKeyAsync is not a function`, weil expo-secure-store
 * im Browser keine Entsprechung hat. Ohne die Prüfung unten steht bei jedem
 * Vorschau-Lauf ein Fehler, und ein Werkzeug, das immer meckert, meldet bald
 * nichts mehr, worauf jemand hört.
 *
 * Die Antwort ist bewusst **nicht**, auf `localStorage` auszuweichen: Dort
 * läge ein Token, das sechzig Tage gilt, im Klartext und für jedes Skript auf
 * der Seite lesbar. Lieber gar keine Anmeldung als eine unsichere. Im Browser
 * meldet dieser Speicher deshalb ehrlich „nichts gespeichert" — die App
 * bleibt vollständig benutzbar, nur eben ohne Konto, und genau das ist im
 * Vorschau-Werkzeug auch richtig. Die echten Ziele sind iOS und Android.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { TokenSpeicher } from './tokenSpeicher';

const SCHLUESSEL = 'mtbie.erneuerung';

/** Kein Schlüsselbund vorhanden: nimmt nichts an und gibt nichts heraus. */
const ohneSchluesselbund: TokenSpeicher = {
  lies: async () => null,
  schreib: async () => {
    console.warn(
      'Kein Schlüsselbund auf dieser Plattform — die Anmeldung wird nicht gespeichert. ' +
        'Das ist im Browser normal; auf iOS und Android darf es nicht vorkommen.',
    );
  },
  loesche: async () => {},
};

const mitSchluesselbund: TokenSpeicher = {
  lies: () => SecureStore.getItemAsync(SCHLUESSEL),
  schreib: (token) => SecureStore.setItemAsync(SCHLUESSEL, token),
  loesche: () => SecureStore.deleteItemAsync(SCHLUESSEL),
};

export const secureTokenSpeicher: TokenSpeicher =
  Platform.OS === 'web' ? ohneSchluesselbund : mitSchluesselbund;
