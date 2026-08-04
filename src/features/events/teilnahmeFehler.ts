/**
 * Den Fehler beim Anmelden oder Abmelden zu einer Tour in einen deutschen,
 * verständlichen Satz übersetzen.
 *
 * `POST /termine/:schluessel` (Anmelden) und `DELETE
 * /termine/:schluessel/ich` (Abmelden, `api/src/app.ts`) scheitern aus sehr
 * unterschiedlichen Gründen — die API antwortet dafür mit 404, 409 oder 429,
 * je nachdem, **woran** es liegt: `abgesagt`, `vorbei`, `voll`,
 * `gaeste-nicht-erlaubt`, `schon-angemeldet` (alle 409, `tourenanmeldung.ts`)
 * oder `zu-viele` (429, dieselbe Grenze je Adresse wie bei den Magic Links).
 * Beim Abmelden kommt „Du bist bei diesem Termin nicht angemeldet." als 404
 * dazu (`meldeAb`), und ein nicht mehr existierender Termin als 404 beim
 * Anmelden.
 *
 * Die Zuordnung ist nach dem sortiert, **was die Person als Nächstes tun
 * soll**, nicht nach Statuscodes:
 *
 * - **401** — die Sitzung gilt gerade nicht (das Zugangs-Token ist
 *   abgelaufen und die stille Erneuerung in `api.ts` ist an einem
 *   ungültigen Erneuerungs-Token gescheitert, oder das Gerät wurde
 *   zwischenzeitlich in einer anderen Sitzung abgemeldet). Der Text der API
 *   („Nicht angemeldet.") sagt nicht, was zu tun ist — hier lohnt sich eine
 *   eigene, handelnde Formulierung.
 * - **429** — zu viele Versuche für diese Adresse in kurzer Zeit
 *   (`HOECHSTENS_GAST_JE_FENSTER`-Logik, hier für Mitglieder über dieselbe
 *   Ratenbegrenzung wie den Rest der Anmeldewege). Hier hilft eine Minute
 *   Geduld — dieselbe Formulierung wie in `anfordernFehler.ts`, damit die
 *   App an dieser Stelle überall gleich klingt.
 * - **404 und 409** — der Zustand des Termins oder der eigenen Anmeldung hat
 *   sich geändert (voll, abgesagt, vorbei, schon angemeldet, nicht mehr im
 *   Kalender, nicht angemeldet). Die API benennt das in ihrem eigenen Text
 *   schon genau — ihn zu ersetzen würde nur Genauigkeit kosten, wie beim
 *   400-Fall in `anfordernFehler.ts`.
 * - **alles andere**, insbesondere Status 0 („gar nicht angekommen") und 503
 *   („Der Vereinskalender ist gerade nicht erreichbar…", `app.ts`) — auch
 *   hier trägt die Meldung, die `api.ts` selbst zusammenstellt, schon die
 *   richtige Auskunft; sie wird durchgereicht statt verworfen. Nur wenn sie
 *   ausnahmsweise leer ankäme, tritt der allgemeine Hinweis an ihre Stelle.
 *
 * Bewusst ohne React Native, damit sich die Zuordnung ohne Gerät prüfen
 * lässt — dasselbe Muster wie `einloesenFehler.ts` und `anfordernFehler.ts`.
 * Der Import trägt die `.ts`-Endung, obwohl der Rest der App darauf
 * verzichtet: `tools/rauchprobe.mts` lädt diese Datei direkt unter Node
 * (ohne Bündler), und `data/api.ts` bringt außer diesem einen — dort per
 * `import type` ohnehin zur Laufzeit ausgeblendeten — Import keine weitere
 * Abhängigkeit mit, die dieselbe Kette bräuchte.
 */

import { ApiFehler } from '../../data/api.ts';

export function beschreibeTeilnahmeFehler(fehler: unknown): string {
  if (fehler instanceof ApiFehler) {
    if (fehler.status === 401) {
      return 'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.';
    }
    if (fehler.status === 429) {
      return 'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.';
    }
    return fehler.message.trim() || 'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.';
  }
  return 'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.';
}
