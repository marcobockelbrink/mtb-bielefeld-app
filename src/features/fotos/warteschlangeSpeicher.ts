/**
 * Die Anbindung der Warteschlange an das Gerät: AsyncStorage für die Liste,
 * das App-Verzeichnis für die Bildkopien.
 *
 * **Warum kopieren?** Der Picker liefert URIs in einen Zwischenspeicher, den
 * das System jederzeit räumen darf. Eine Schlange, die den Neustart
 * überlebt, deren Dateien aber nicht, wäre eine Liste toter Verweise —
 * deshalb wandert jedes Bild sofort als Kopie nach
 * `documentDirectory/fotowarteschlange/` und wird erst nach gelungenem
 * Upload (oder beim Aufgeben) wieder gelöscht.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { ausJson, zuJson, type Auftrag } from './warteschlange';

const SCHLUESSEL = 'foto-warteschlange';

function ordner(): Directory {
  return new Directory(Paths.document, 'fotowarteschlange');
}

export async function liesSchlange(): Promise<Auftrag[]> {
  return ausJson(await AsyncStorage.getItem(SCHLUESSEL));
}

export async function schreibSchlange(schlange: Auftrag[]): Promise<void> {
  await AsyncStorage.setItem(SCHLUESSEL, zuJson(schlange));
}

/** Kopiert ein Bild ins App-Verzeichnis und liefert den fertigen Auftrag. */
export function kopiereInsAppVerzeichnis(albumId: string, quellUri: string): Auftrag {
  const ziel = ordner();
  if (!ziel.exists) ziel.create({ intermediates: true });

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const datei = new File(ziel, `${id}.jpg`);
  new File(quellUri).copy(datei);

  return { id, albumId, uri: datei.uri, versuche: 0 };
}

/** Nach gelungenem Upload — oder beim Aufgeben. Fehlt sie schon, auch gut. */
export function loescheKopie(auftrag: Auftrag): void {
  try {
    const datei = new File(auftrag.uri);
    if (datei.exists) datei.delete();
  } catch {
    // Eine Kopie, die sich nicht löschen lässt, hält nichts auf — sie wird
    // beim nächsten Aufräumen wieder versucht.
  }
}
