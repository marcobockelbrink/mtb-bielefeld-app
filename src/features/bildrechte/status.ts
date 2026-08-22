/**
 * Wie der Stand der Bildrechte in der Oberfläche heißt (Handoff 15).
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar
 * bleibt — dasselbe Muster wie `zusagen.ts` gegenüber `GuideKarte.tsx`.
 *
 * Vier Zustände am Server, aber **zwei verschiedene Fragen** in der App:
 *
 * - *Muss hier noch jemand etwas tun?* — Familienprofil, Verwaltungsliste
 * - *Darf fotografiert werden?* — Teilnehmerliste der Guides
 *
 * Die zweite ist gröber: Alles außer einem vollständigen Ja heißt „keine
 * Fotos". Wer nicht geantwortet hat, hat nicht zugestimmt.
 */

import type { Einwilligung } from '../../data/bildrechte';

export type Ton = 'gut' | 'offen' | 'nein';

export interface Beschreibung {
  wort: string;
  ton: Ton;
  /** Ein Satz darunter, wo einer nötig ist — sonst `null`. */
  zusatz: string | null;
}

/**
 * Der Stand für die Familie und die Verwaltung.
 *
 * „erteilt, aber die zweite Stimme fehlt" bekommt einen eigenen Satz und
 * nicht nur ein Häkchen: Für die Eltern sieht die Sache sonst erledigt
 * aus, während für die Guides weiter „keine Fotos" gilt — ein Widerspruch,
 * den niemand auflösen könnte, weil er gar nicht sichtbar wäre.
 */
export function beschreibe(einwilligung: Einwilligung, name: string | null): Beschreibung {
  const wen = name?.trim() || 'das Kind';

  switch (einwilligung.status) {
    case 'erteilt':
      return einwilligung.vollstaendig
        ? { wort: 'erteilt', ton: 'gut', zusatz: null }
        : {
            wort: 'erteilt',
            ton: 'offen',
            zusatz: `${wen} muss noch selbst zustimmen.`,
          };
    case 'abgelehnt':
      return { wort: 'nein', ton: 'nein', zusatz: 'Vom Verein erfasst.' };
    case 'widerrufen':
      return { wort: 'widerrufen', ton: 'nein', zusatz: 'Vom Verein erfasst.' };
    default:
      return { wort: 'offen', ton: 'offen', zusatz: null };
  }
}

/**
 * Wonach die Verwaltung filtert (Sicht 15b).
 *
 * `fehlt` fasst „offen" und „unvollständig erteilt" zusammen — beides
 * heißt für die Guides dasselbe, nämlich keine Fotos, und beides braucht
 * dieselbe Handlung: einmal nachfragen.
 */
export type Filter = 'alle' | 'fehlt' | 'nein';

export function passtZuFilter(einwilligung: Einwilligung, filter: Filter): boolean {
  if (filter === 'alle') return true;
  if (filter === 'nein') {
    return einwilligung.status === 'abgelehnt' || einwilligung.status === 'widerrufen';
  }
  return einwilligung.status === 'offen' || (einwilligung.status === 'erteilt' && !einwilligung.vollstaendig);
}

/**
 * Der Satz unter der Zeile im Familienprofil.
 *
 * Er nennt **immer** den Weg für ein Nein, auch wenn schon zugestimmt
 * wurde: Ein Widerruf ist jederzeit möglich, und wer ihn sucht, soll ihn
 * nicht suchen müssen. In der App gibt es dafür keinen Knopf — der Satz
 * ist der Ersatz, und er wäre wertlos, wenn er nur dort stünde, wo noch
 * nichts entschieden ist.
 */
export const HINWEIS_NEIN =
  'Ein Nein oder ein späterer Widerruf läuft über die Vereinsverwaltung — sprich uns einfach an.';
