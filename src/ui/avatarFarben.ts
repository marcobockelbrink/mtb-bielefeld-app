/**
 * Initialen und Farbe für Profilbilder — **ohne React Native**, damit es
 * ohne Gerät prüfbar bleibt (dasselbe Muster wie `notifications/scheduler.ts`
 * gegenüber `notifications/index.ts`).
 *
 * Die Farbe wird aus dem Namen abgeleitet statt gespeichert: Dieselbe Person
 * bekommt so immer dieselbe Farbe — über Geräte und Neustarts hinweg, ohne
 * dass irgendwo etwas abgelegt werden muss.
 *
 * Die Palette steht bewusst hier und nicht in `theme.ts`: Es sind keine
 * Marken- oder Bedienfarben, sondern reine Unterscheidungsfarben. In der
 * Vereinsfarbe hätten sie eine Bedeutung, die sie nicht haben.
 */

const PAARE: Array<{ grund: string; schrift: string }> = [
  { grund: '#eaf0d7', schrift: '#5a6b1f' },
  { grund: '#dbe6ec', schrift: '#1f4a63' },
  { grund: '#f2e2dc', schrift: '#8a4a2e' },
  { grund: '#e4e1ee', schrift: '#4a3f78' },
];

/**
 * Ein einfacher, stabiler Hash über den Namen.
 *
 * Nichts Kryptografisches — er muss nur zwei Dinge können: für denselben
 * Namen immer dasselbe liefern und die vier Paare halbwegs gleichmäßig
 * treffen. `djb2`, seit Jahrzehnten für genau solche Fälle in Gebrauch.
 */
export function farbpaarFuer(name: string): { grund: string; schrift: string } {
  let hash = 5381;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  }
  return PAARE[hash % PAARE.length]!;
}

/**
 * Die Initialen: erster Buchstabe des ersten und des letzten Wortes.
 *
 * Ein einzelnes Wort ergibt einen Buchstaben, keine zwei — „Malte" zu „MA"
 * zu verdoppeln sähe nach einem Nachnamen aus, den es nicht gibt. Leere
 * Namen ergeben „?", damit nie ein leerer Kreis entsteht.
 */
export function initialen(name: string): string {
  const teile = name.trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return '?';
  const erster = teile[0]![0] ?? '';
  const letzter = teile.length > 1 ? (teile[teile.length - 1]![0] ?? '') : '';
  return (erster + letzter).toUpperCase();
}
