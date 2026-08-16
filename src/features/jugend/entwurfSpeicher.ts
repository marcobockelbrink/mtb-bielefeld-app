/**
 * Die Anbindung des Trainings-Entwurfs an das Gerät — getrennt von der
 * Rechnung in `entwurf.ts`, damit die ohne Gerät prüfbar bleibt.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { ausJson, type TrainingsEntwurf } from './entwurf';

const SCHLUESSEL = 'jugendtraining-entwurf';

export async function liesEntwurf(): Promise<TrainingsEntwurf | null> {
  return ausJson(await AsyncStorage.getItem(SCHLUESSEL));
}

export async function schreibEntwurf(entwurf: TrainingsEntwurf): Promise<void> {
  await AsyncStorage.setItem(SCHLUESSEL, JSON.stringify(entwurf));
}

/** Nach dem Anlegen — und wenn jemand den Entwurf ausdrücklich verwirft. */
export async function loescheEntwurf(): Promise<void> {
  await AsyncStorage.removeItem(SCHLUESSEL);
}
