/**
 * Den Fehler beim Anfordern eines Anmeldelinks in einen deutschen,
 * verständlichen Satz übersetzen.
 *
 * Das Naheliegende wäre, hier immer „nicht erreichbar" zu sagen — die API
 * antwortet ja bei jeder gültigen Anfrage gleich, egal ob die Adresse
 * bekannt ist. Das gilt aber nur für **gültige** Anfragen. Gegen die
 * laufende API nachgemessen:
 *
 *     {"email":""}              → 400 "E-Mail-Adresse fehlt oder ist ungültig."
 *     {"email":"keine-adresse"} → 400 "E-Mail-Adresse fehlt oder ist ungültig."
 *
 * Wer sich vertippt, bekäme also „Der Verein ist gerade nicht erreichbar"
 * zu lesen und wartet — obwohl Warten nichts hilft und ein Blick auf das
 * eigene Eingabefeld alles. Ein falscher Rat ist schlimmer als gar keiner.
 *
 * Die Fälle unterscheiden sich darin, **was die Person als Nächstes tun
 * soll** — danach ist diese Zuordnung gebaut, nicht nach Statuscodes:
 *
 * - **400** — an der Eingabe liegt es. Der Text der API ist bereits deutsch
 *   und genauer als alles, was hier zu erfinden wäre; deshalb wird er
 *   durchgereicht, statt ihn zu ersetzen.
 * - **429** — zu oft hintereinander versucht (`ipbegrenzung.ts` und Caddy
 *   davor). Hier hilft eine Minute Geduld, und das gehört gesagt: Sonst
 *   tippt jemand weiter und macht es schlimmer.
 * - **alles andere**, insbesondere Status 0 („gar nicht angekommen", siehe
 *   `api.ts`) — der Server oder das eigene Netz. Später noch einmal.
 *
 * Bewusst ohne React Native, damit sich die Zuordnung ohne Gerät prüfen
 * lässt — dasselbe Muster wie `einloesenFehler.ts` daneben.
 */

import { ApiFehler } from '../data/api';

export function beschreibeAnfordernFehler(fehler: unknown): string {
  if (fehler instanceof ApiFehler) {
    if (fehler.status === 400) {
      // Der Satz der API ist präziser als eine eigene Erfindung — aber nur,
      // wenn wirklich einer ankam. Sonst der allgemeine Hinweis.
      return fehler.message.trim() || 'Prüf deine E-Mail-Adresse.';
    }
    if (fehler.status === 429) {
      return 'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.';
    }
  }
  return 'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.';
}
