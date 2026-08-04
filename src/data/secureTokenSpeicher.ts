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
 */

import * as SecureStore from 'expo-secure-store';

import type { TokenSpeicher } from './tokenSpeicher';

const SCHLUESSEL = 'mtbie.erneuerung';

export const secureTokenSpeicher: TokenSpeicher = {
  lies: () => SecureStore.getItemAsync(SCHLUESSEL),
  schreib: (token) => SecureStore.setItemAsync(SCHLUESSEL, token),
  loesche: () => SecureStore.deleteItemAsync(SCHLUESSEL),
};
