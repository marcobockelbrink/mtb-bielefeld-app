/**
 * Die Upload-Warteschlange — reine Logik, ohne React Native und ohne
 * Dateisystem (dasselbe Muster wie `notifications/scheduler.ts`).
 *
 * Warum es sie gibt: Bei Vereins-Events steht man im Wald. Ein Upload, der
 * scheitert und mit der App stirbt, ist ein Upload, den niemand wiederholt —
 * die Bilder sollen den Neustart überleben und nachlaufen, sobald wieder
 * Netz da ist. Was hier verwaltet wird, sind **Verweise** auf Kopien im
 * App-Verzeichnis (`warteschlangeSpeicher.ts` legt sie an); die Originale
 * aus der Mediathek gehören dem System und können jederzeit verschwinden.
 */

export interface Auftrag {
  /** Eigene Kennung — die Datei heißt genauso, das hält beides zusammen. */
  id: string;
  albumId: string;
  /** Pfad der Kopie im App-Verzeichnis, nicht der Mediathek-URI. */
  uri: string;
  /** Gescheiterte Versuche — für die Anzeige, nicht für ein Aufgeben. */
  versuche: number;
}

/** Unveränderlich: Jede Operation liefert eine neue Liste. */
export function fuegeHinzu(schlange: Auftrag[], auftraege: Auftrag[]): Auftrag[] {
  return [...schlange, ...auftraege];
}

export function entferne(schlange: Auftrag[], id: string): Auftrag[] {
  return schlange.filter((auftrag) => auftrag.id !== id);
}

export function vermerkeFehlschlag(schlange: Auftrag[], id: string): Auftrag[] {
  return schlange.map((auftrag) =>
    auftrag.id === id ? { ...auftrag, versuche: auftrag.versuche + 1 } : auftrag,
  );
}

export function fuerAlbum(schlange: Auftrag[], albumId: string): Auftrag[] {
  return schlange.filter((auftrag) => auftrag.albumId === albumId);
}

/**
 * Aus dem Speicher gelesen — und alles verworfen, was keine vollständige
 * Zeile ist. Ein halber Auftrag (App mitten im Schreiben beendet, altes
 * Format) würde sonst beim Abarbeiten werfen und die ganze Schlange
 * blockieren; ihn zu verlieren ist das kleinere Übel als sie festzuhalten.
 */
export function ausJson(roh: string | null): Auftrag[] {
  if (!roh) return [];
  try {
    const daten: unknown = JSON.parse(roh);
    if (!Array.isArray(daten)) return [];
    return daten.filter(
      (eintrag): eintrag is Auftrag =>
        typeof eintrag === 'object' &&
        eintrag !== null &&
        typeof (eintrag as Auftrag).id === 'string' &&
        typeof (eintrag as Auftrag).albumId === 'string' &&
        typeof (eintrag as Auftrag).uri === 'string' &&
        typeof (eintrag as Auftrag).versuche === 'number',
    );
  } catch {
    return [];
  }
}

export function zuJson(schlange: Auftrag[]): string {
  return JSON.stringify(schlange);
}

/**
 * Ist eine Upload-Runde restlos durch?
 *
 * Entscheidet, ob die Fortschrittskarte verschwinden darf. Der Anlass kam
 * aus der Beta am 19.08.2026, mit einem Bildschirmfoto: Nach dem Hochladen
 * stand dasselbe Foto **zweimal** auf der Seite — einmal in der
 * Fortschrittskarte mit dem Stempel „HOCHGELADEN", einmal im Raster
 * darunter mit dem Stempel „neu". Beides stimmte, und zusammen sah es aus
 * wie ein Fehler.
 *
 * Die Karte hat ihre Arbeit getan, sobald das Bild unten steht: Das Raster
 * ist die bessere Rückmeldung, denn es zeigt, was wirklich beim Verein
 * angekommen ist.
 *
 * **Nur bei `hochgeladen`, ausnahmslos.** `wartetAufWlan`, `keinNetz` und
 * `fehlgeschlagen` verlangen eine Entscheidung — verschwände die Karte
 * auch dann, wäre das Bild lautlos weg, und niemand käme auf die Idee,
 * dass es noch auf dem Gerät liegt und wartet.
 *
 * Eine leere Runde ist **nicht** durch: Dann gab es nichts zu tun, und
 * „fertig" wäre eine Aussage über nichts.
 */
export function rundeIstDurch(zustaende: string[]): boolean {
  return zustaende.length > 0 && zustaende.every((zustand) => zustand === 'hochgeladen');
}
