/**
 * Einen Fehler, den nur das Gerät sieht, dem Server melden.
 *
 * Behelfsbrücke für die Suche nach dem Foto-Upload-Fehler (17.08.2026):
 * Der scheitert in dem Moment, in dem `fetch` wirft, und ist deshalb im
 * Serverprotokoll unsichtbar. Ohne diesen Weg bleibt nur, Marco die
 * Meldung abtippen zu lassen — ein Anlauf je Versuch, und jede Rückfrage
 * kostet eine neue Fassung der App.
 *
 * **Gemeldet wird nur der technische Text**, kein Bildinhalt.
 *
 * Sobald der Fehler gefunden ist, gehört diese Datei mitsamt dem Endpunkt
 * wieder entfernt.
 */

import type { ApiZugang } from './api';

/**
 * Feuern und vergessen.
 *
 * Die Meldung darf unter **keinen** Umständen den Ablauf beeinflussen, in
 * dem sie entsteht: Sie läuft in einem Fehlerfall, oft ohne Netz, und ein
 * abgewiesenes Versprechen darin würde den eigentlichen Fehler
 * überschreiben. Deshalb kein `await` beim Aufrufer und ein `catch`, das
 * schweigt.
 */
export function meldeDiagnose(api: ApiZugang, bereich: string, text: string): void {
  void api.sende('/diagnose', 'POST', { bereich, text }).catch(() => {});
}
