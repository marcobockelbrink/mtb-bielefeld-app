/**
 * Darf jetzt hochgeladen werden? — die WLAN-Regel („10a"/„10b").
 *
 * Die Entscheidung selbst ist **reine Rechenlogik ohne React Native**, damit
 * sie ohne Gerät prüfbar bleibt (dasselbe Muster wie
 * `notifications/scheduler.ts` gegenüber `notifications/index.ts`). Die
 * Anbindung an `NetInfo` steht daneben in `netzZustand.ts`.
 *
 * Warum es die Regel gibt: Eine Tour bringt leicht dreißig Bilder mit, und
 * die über Mobilfunk zu schicken kostet spürbar Datenvolumen. Voreinstellung
 * ist deshalb „nur über WLAN" — mit zwei Auswegen, damit niemand festsitzt:
 * eine Freigrenze für kleine Bilder und ein Knopf im Album, der genau diesen
 * Stapel einmalig durchlässt.
 */

/** Wie viel über Mobilfunk trotzdem sofort rausgehen darf. */
export type Freigrenze = 'nie' | '5mb' | '20mb';

export const FREIGRENZEN: Array<{ wert: Freigrenze; label: string; bytes: number }> = [
  { wert: 'nie', label: 'Nie', bytes: 0 },
  { wert: '5mb', label: '5 MB', bytes: 5 * 1024 * 1024 },
  { wert: '20mb', label: '20 MB', bytes: 20 * 1024 * 1024 },
];

export function grenzeInBytes(freigrenze: Freigrenze): number {
  return FREIGRENZEN.find((g) => g.wert === freigrenze)?.bytes ?? 0;
}

export interface UploadRegel {
  /** Die Einstellung aus `Einstellungen → Uploads`. */
  nurUeberWlan: boolean;
  freigrenze: Freigrenze;
  /** Aus `NetInfo` — `null`, solange es noch niemand gemessen hat. */
  imWlan: boolean | null;
  /** Der Knopf „Jetzt über Mobilfunk laden" für genau diesen Stapel. */
  mobilfunkErlaubt: boolean;
}

/**
 * Die eine Entscheidung — und sie fällt bewusst großzügig aus.
 *
 * `imWlan === null` heißt: Wir wissen es (noch) nicht. Dann wird
 * hochgeladen. Ein Upload, der wegen einer unklaren Messung stillsteht,
 * wäre genau der Fehler aus dem Bericht vom 15.08.2026 — nur mit anderer
 * Begründung. Lieber ein paar Megabyte über Mobilfunk als eine App, die
 * schweigend nichts tut.
 *
 * Die Größe wird **nach** dem Verkleinern gemessen: Ein 48-Megapixel-Foto,
 * das als JPEG 2 MB wiegt, soll nicht auf WLAN warten, weil das Original
 * 20 MB hat.
 */
export function darfJetztHochladen(regel: UploadRegel, bytesNachVerkleinern: number): boolean {
  if (!regel.nurUeberWlan) return true;
  if (regel.mobilfunkErlaubt) return true;
  if (regel.imWlan !== false) return true;

  return bytesNachVerkleinern <= grenzeInBytes(regel.freigrenze);
}
