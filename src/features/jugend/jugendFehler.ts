/**
 * Fehler rund um Jugendtrainings in einen deutschen Satz übersetzen.
 *
 * Dieselbe Bauweise wie `teilnahmeFehler.ts` daneben, und die Konstanten
 * sind dieselben: Ein 429 soll nicht je nach Bildschirm anders heißen.
 *
 * Sortiert nach dem, was die Person als Nächstes tun soll, nicht nach
 * Statuscodes. Die API formuliert ihre eigenen Fälle schon genau („Dieses
 * Training ist voll.", „Das dürfen nur Guides.") — die zu ersetzen kostete
 * nur Genauigkeit.
 *
 * Die Importe tragen die `.ts`-Endung, obwohl der Rest der App darauf
 * verzichtet: `tools/rauchprobe.mts` lädt diese Datei direkt unter Node
 * (ohne Bündler) — dasselbe Muster wie in `teilnahmeFehler.ts` begründet.
 */

import { ApiFehler } from '../../data/api.ts';
import { NICHT_ERREICHBAR, ZU_VIELE_VERSUCHE } from '../events/teilnahmeFehler.ts';

export function beschreibeJugendFehler(fehler: unknown): string {
  if (fehler instanceof ApiFehler) {
    if (fehler.status === 401) {
      return 'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.';
    }
    if (fehler.status === 429) return ZU_VIELE_VERSUCHE;
    // Status 0 heißt „gar nicht angekommen" — `api.ts` schreibt dafür schon
    // den genaueren Satz und unterscheidet Zeitablauf von fehlender
    // Verbindung.
    if (fehler.status === 0) return fehler.message.trim() || NICHT_ERREICHBAR;
    // Sonst nur durchreichen, was die API selbst formuliert hat. Was Fastify
    // bei 5xx durchreicht, ist der rohe Text der Ursache.
    if (fehler.vonDerApi) return fehler.message.trim() || NICHT_ERREICHBAR;
    return NICHT_ERREICHBAR;
  }

  // Kein `ApiFehler` — dann war die API gar nicht beteiligt, und der Fehler
  // stammt vom Gerät (Bildverarbeitung, Dateisystem, ein Programmierfehler).
  //
  // **Bis zum 16.08.2026 stand hier ebenfalls `NICHT_ERREICHBAR`**, und das
  // war die teuerste Zeile der App: Der Foto-Upload scheiterte beim
  // Vorbereiten auf dem Gerät, die App behauptete „Der Verein ist gerade
  // nicht erreichbar", und niemand kam auf die Idee, woanders als im Netz
  // zu suchen. Der Prüfserver sah in einer Woche keinen einzigen Upload.
  //
  // Ein neutraler Satz sagt weniger — aber er sagt nichts Falsches. Wo der
  // technische Text gebraucht wird, gibt es `beschreibeUploadFehler`.
  return 'Da ist etwas schiefgegangen.';
}
