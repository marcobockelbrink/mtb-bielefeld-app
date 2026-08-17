/**
 * Warum ein Bild nicht hochgeladen wurde — und zwar **wahrheitsgemäß**.
 *
 * ## Der Anlass
 *
 * Aus der Beta gemeldet (16.08.2026): „Der Server ist nicht erreichbar,
 * keine Verbindung" — bei Albumbildern wie beim Profilbild. Nachgemessen
 * am Prüfserver: In einer Woche kam **kein einziger** Upload an, während
 * jede andere Anfrage derselben App ankam. Ein Multipart-POST von Hand
 * (`curl`) ging durch und wurde ordentlich mit 401 beantwortet. Der
 * Netzweg war also nie das Problem.
 *
 * Die Anfrage verließ das Telefon nie. Der Fehler passierte **vor** dem
 * Senden — beim Vorbereiten des Bildes — und `beschreibeJugendFehler`
 * beantwortete jeden Fehler, der kein `ApiFehler` war, mit „Der Verein ist
 * gerade nicht erreichbar." Damit zeigte die App eine Woche lang auf das
 * Netz, während der Fehler zwei Zeilen vorher lag.
 *
 * **Das ist die eigentliche Lehre**, unabhängig von der Ursache: Ein
 * Auffangbecken, das jeden unbekannten Fehler in eine konkrete Behauptung
 * übersetzt, macht aus einem lösbaren Problem ein unauffindbares. Lieber
 * ein technischer Satz, den ein Mensch weiterreichen kann, als eine
 * glatte Erklärung, die in die Irre führt.
 */

import { ApiFehler } from '../../data/api';
import { beschreibeJugendFehler } from '../jugend/jugendFehler';

/**
 * In welchem Schritt es scheiterte.
 *
 * Die Unterscheidung ist der Kern: `vorbereiten` heißt Verkleinern und
 * Umwandeln auf dem Gerät, `senden` heißt der Weg zum Verein. Sie zu
 * verwechseln hat hier eine Woche gekostet.
 */
export type UploadSchritt = 'vorbereiten' | 'senden';

const EINLEITUNG: Record<UploadSchritt, string> = {
  vorbereiten: 'Das Bild ließ sich auf dem Gerät nicht vorbereiten',
  senden: 'Das Bild ließ sich nicht senden',
};

export function beschreibeUploadFehler(
  fehler: unknown,
  schritt: UploadSchritt,
  /**
   * Ob das Gerät nachweislich Netz hat (`useVerbunden`). `null` heißt
   * „nicht gemessen" — dann wird nichts behauptet.
   */
  verbunden: boolean | null = null,
): string {
  if (fehler instanceof ApiFehler) {
    // **Der Fall aus den Screenshots vom 17.08.2026.** `fetch` hat
    // geworfen, aber das Telefon hing an 5G. Dann ist „prüf deine
    // Verbindung" nachweislich falsch, und der Originaltext ist das
    // einzige, was weiterhilft.
    if (fehler.ohneNetz && verbunden === true && fehler.ursprung) {
      return `${EINLEITUNG[schritt]}: ${fehler.ursprung}`;
    }
    // Sonst ist alles, was die API beantwortet hat, dort schon gut
    // formuliert — samt Ratenbegrenzung, abgelaufener Anmeldung und dem
    // Verbindungshinweis aus `api.ts`.
    return beschreibeJugendFehler(fehler);
  }

  // Ein gewöhnlicher Fehler kommt vom Gerät: aus der Bildverarbeitung,
  // dem Dateisystem, dem Bildwähler. Seinen Text mitzugeben ist unschön
  // (er ist meist englisch), aber es ist die einzige Spur, die jemand
  // weitergeben kann — und ohne sie steht wieder eine Behauptung da.
  if (fehler instanceof Error && fehler.message.trim()) {
    return `${EINLEITUNG[schritt]}: ${fehler.message.trim()}`;
  }

  return `${EINLEITUNG[schritt]}. Woran es lag, meldet das Gerät leider nicht.`;
}
