/**
 * Was die App sagt, wenn die Erlaubnis für Mitteilungen fehlt.
 *
 * Befund „H1" aus dem Usability-Review vom 15.08.2026: Der Schalter für
 * Erinnerungen schnappte bei fehlender Erlaubnis wortlos zurück. Wer nicht
 * genau hinsah, hielt die Erinnerungen für eingeschaltet und bekam nie
 * welche — ein Versprechen, das die App nicht halten konnte, ohne es je
 * zurückzunehmen.
 *
 * Reiner Text ohne React Native, damit die Unterscheidung prüfbar bleibt:
 * Sie ist der ganze Inhalt des Befunds.
 */

import type { ErlaubnisErgebnis } from './index';

export interface ErlaubnisHinweis {
  text: string;
  /** Ob ein Knopf in die Systemeinstellungen führen soll. */
  zuEinstellungen: boolean;
}

/**
 * `null`, solange nichts zu sagen ist — bei `erlaubt` ebenso wie vor dem
 * ersten Versuch.
 *
 * Die beiden Sätze unterscheiden sich in dem, was als Nächstes zu tun ist,
 * und nur deshalb gibt es zwei: Bei `abgelehnt` genügt ein weiterer Tipp
 * auf den Schalter, bei `blockiert` fragt das System nicht mehr — dort
 * wäre „versuch es noch einmal" eine Sackgasse.
 */
export function beschreibeErlaubnis(ergebnis: ErlaubnisErgebnis): ErlaubnisHinweis | null {
  if (ergebnis === 'erlaubt') return null;

  if (ergebnis === 'blockiert') {
    return {
      text: 'Mitteilungen sind für die App in den Handy-Einstellungen blockiert. Deshalb können keine Erinnerungen erscheinen — dein Handy fragt auch nicht mehr nach. Das lässt sich nur dort wieder erlauben.',
      zuEinstellungen: true,
    };
  }

  return {
    text: 'Ohne die Erlaubnis für Mitteilungen kann dein Handy nicht erinnern. Tippe den Schalter noch einmal an, wenn du es dir anders überlegst.',
    zuEinstellungen: false,
  };
}
