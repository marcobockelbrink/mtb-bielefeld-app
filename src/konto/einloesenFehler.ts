/**
 * Den Fehler beim Einlösen eines Magic Links in einen deutschen,
 * verständlichen Satz übersetzen.
 *
 * Zwei Fälle, die Verschiedenes vom Leser verlangen:
 *
 * - Der Link selbst ist hinüber (verbraucht oder abgelaufen). Die API
 *   antwortet dafür ausnahmslos mit 401 (`api/src/app.ts`,
 *   `/anmeldung/einloesen`: „Der Link gilt nicht mehr." — ohne weiteren
 *   Grund, damit die Antwort nicht verrät, ob der Link je existiert hat).
 *   Hier hilft nur ein neuer Link, kein erneuter Versuch.
 * - Alles andere — kein Netz (`ApiFehler` mit Status 0, siehe `api.ts`),
 *   Ratenbegrenzung, ein Serverfehler — ist ein vorübergehendes Problem des
 *   Servers oder der eigenen Verbindung. Hier hilft Warten, kein neuer Link.
 *
 * Bewusst ohne React Native, damit sich die Zuordnung ohne Gerät prüfen
 * lässt — `ApiFehler` selbst ist reine Rechenlogik.
 */

import { ApiFehler } from '../data/api';
import { NICHT_ERREICHBAR, ZU_VIELE_VERSUCHE } from '../features/events/teilnahmeFehler';

export function beschreibeEinloesenFehler(fehler: unknown): string {
  if (fehler instanceof ApiFehler) {
    if (fehler.status === 401) {
      return 'Dieser Anmeldelink gilt nicht mehr. Fordere einen neuen an.';
    }
    // Wie in `anfordernFehler.ts` und `teilnahmeFehler.ts`: Bei einer
    // Ratenbegrenzung hilft Warten, und das gehört gesagt — sonst tippt
    // jemand den Link immer wieder an und macht es schlimmer. Vorher fiel
    // dieser Fall hier auf den allgemeinen Satz zurück, und dieselbe Lage
    // hieß je nach Bildschirm etwas anderes.
    if (fehler.status === 429) {
      return ZU_VIELE_VERSUCHE;
    }
  }
  return NICHT_ERREICHBAR;
}
