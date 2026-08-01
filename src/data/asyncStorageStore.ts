/**
 * Anbindung des Zwischenspeichers an React Native.
 *
 * Getrennt von `store.ts`, damit die Speicherlogik ohne React Native prüfbar
 * bleibt — diese Datei ist die einzige, die AsyncStorage überhaupt kennt.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { KeyValueStore } from './store';

export const asyncStorageStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
