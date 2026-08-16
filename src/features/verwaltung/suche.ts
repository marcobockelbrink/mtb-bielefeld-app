/**
 * Die Suche in der Mitgliederliste — Befund „F2" aus dem Usability-Review
 * vom 15.08.2026.
 *
 * Ab etwa vierzig Mitgliedern wird das Scrollen mühsam, und genau dann
 * braucht man die Liste am ehesten: um bei *einer* Person eine Rolle zu
 * ändern. Der Verein hat rund 200 Mitglieder — die Grenze ist keine
 * theoretische.
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar
 * bleibt. Die Filterlogik der Terminliste macht es genauso
 * (`features/events/filter.ts`), und die Regel „alle Wörter müssen
 * vorkommen, Reihenfolge egal" ist bewusst dieselbe: Zwei Suchfelder in
 * derselben App sollen sich nicht verschieden verhalten.
 */

import type { MitgliedZeile } from '../../data/verwaltung';

/**
 * Woraus gesucht wird.
 *
 * Neben der Adresse auch die Rolle und die beiden Merkmale — „guide"
 * findet damit alle Guides, „jugend" alle der Jugend zugeordneten. Das ist
 * kein Zufallsfund, sondern der zweite Zweck des Feldes: Ohne ihn bräuchte
 * es eine eigene Filterleiste für etwas, das ein Wort erledigt.
 */
function heuhaufen(zeile: MitgliedZeile): string {
  const teile = [zeile.email, zeile.rolle];
  if (zeile.jugend) teile.push('jugend');
  if (zeile.jugendGuide) teile.push('jugendguide');
  if (zeile.offeneEinladung) teile.push('eingeladen');
  return teile.join('\n').toLowerCase();
}

export function passtZurSuche(zeile: MitgliedZeile, suche: string): boolean {
  const gesucht = suche.trim().toLowerCase();
  if (!gesucht) return true;

  const wo = heuhaufen(zeile);
  return gesucht.split(/\s+/).every((wort) => wo.includes(wort));
}

export function sucheMitglieder(zeilen: MitgliedZeile[], suche: string): MitgliedZeile[] {
  return zeilen.filter((zeile) => passtZurSuche(zeile, suche));
}
