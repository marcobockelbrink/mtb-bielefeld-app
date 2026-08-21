/**
 * Fassungsnummern vergleichen — von App **und** Server benutzt.
 *
 * Steht in `src/domain/`, weil beide Seiten dieselbe Rechnung brauchen und
 * eine zweite Kopie auseinanderliefe: Der Server entscheidet über `426`,
 * die App über Sperre oder Hinweis. Kämen die beiden zu verschiedenen
 * Ergebnissen, zeigte die App „alles in Ordnung", während jeder Aufruf
 * abgewiesen wird. Dasselbe Muster wie `apiVertrag.ts`, den
 * `api/src/jugendtraining.ts` schon einbindet.
 *
 * Ohne React Native und ohne Node-Eigenheiten: Beide Seiten binden das hier
 * unverändert ein, und vitest kann es auf beiden prüfen.
 */

/** Eine Fassung als drei Zahlen. */
export type Fassung = [number, number, number];

/**
 * `"1.10.0"` → `[1, 10, 0]`.
 *
 * `null` bei allem, was nicht mit drei Zahlen beginnt — auch bei `"1.2"`
 * und `"v1.2.3"`. Ein halb verstandener Wert wäre schlimmer als keiner: Er
 * ergäbe einen Vergleich, der irgendetwas liefert.
 *
 * Ein Anhängsel (`1.2.3-beta`) wird abgeschnitten, nicht abgelehnt — ein
 * Vorabbau soll sich wie seine Fassung verhalten.
 */
export function liesFassung(fassung: string | undefined | null): Fassung | null {
  if (typeof fassung !== 'string') return null;
  const treffer = /^(\d+)\.(\d+)\.(\d+)/.exec(fassung.trim());
  if (!treffer) return null;
  return [Number(treffer[1]), Number(treffer[2]), Number(treffer[3])];
}

/**
 * Vergleicht zwei Fassungen — negativ, null, positiv wie bei `sort`.
 *
 * **Zahl für Zahl und nicht als Zeichenkette.** Als Text ist
 * `"1.10.0" < "1.9.0"` wahr und als Fassung falsch. Genau daran scheitern
 * solche Prüfungen üblicherweise — und zwar erst beim zehnten
 * Nebenversionssprung, wenn niemand mehr daran denkt.
 */
export function vergleicheFassungen(a: Fassung, b: Fassung): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Ist `fassung` älter als `grenze`?
 *
 * **Eine fehlende oder unverständliche Angabe gilt als in Ordnung.** Auf
 * dem Server heißt das: Wer den Kopf `X-App-Version` nicht schickt, wird
 * nicht ausgesperrt — ältere Fassungen kennen ihn gar nicht, und sie mit
 * der Einführung dieser Prüfung rückwirkend abzuschalten wäre das
 * Gegenteil dessen, was sie soll. In der App heißt es: keine Sperre, wenn
 * die Auskunft unlesbar ist.
 */
export function istAelterAls(
  fassung: string | undefined | null,
  grenze: string | undefined | null,
): boolean {
  const a = liesFassung(fassung);
  const b = liesFassung(grenze);
  if (a === null || b === null) return false;
  return vergleicheFassungen(a, b) < 0;
}
