/**
 * Der stabile Schlüssel eines Termins.
 *
 * Dieselbe Regel in App und API — deshalb steht sie hier einmal, in einer
 * eigenen Datei ohne weitere Abhängigkeiten, statt zweimal geschrieben zu
 * werden. `api/src/termine.ts` reicht sie über einen Re-Export weiter.
 *
 * Bei einem **gewöhnlichen Einzeltermin** genügt die `uid` allein — sie ist
 * im Kalender schon eindeutig, und genau sie überlebt eine Verschiebung.
 * Nähme man auch hier den Zeitanteil dazu, wäre der Schlüssel bei der
 * häufigsten Verschiebung überhaupt kaputt: Ein Einzeltermin trägt keine
 * `RECURRENCE-ID`, `originalStartInstant` ist bei ihm schlicht `start` —
 * verlegt der Guide ihn, wandert der Zeitanteil mit, der Schlüssel ändert
 * sich, und alle Anmeldungen hingen ins Leere.
 *
 * Bei **Serien** trägt jeder Einzeltermin dieselbe `uid`; erst der
 * ursprüngliche Zeitpunkt (`originalStartInstant`, aus `RECURRENCE-ID` bei
 * einem verschobenen Einzeltermin) trennt sie voneinander. Er ist dort auch
 * verschiebungsfest, denn er nennt den Platz in der Serie, nicht die neue
 * Uhrzeit.
 *
 * Der Schlüssel wird **nie geparst**, nur mit neu berechneten verglichen —
 * deshalb braucht die Tilde keine Sonderbehandlung, falls sie je in einer
 * `uid` auftauchen sollte. In URL-Pfaden muss er kodiert werden
 * (`encodeURIComponent`): Er enthält `@` und bei manchen Terminen `_`.
 */

import type { ClubEvent } from './types.ts';

export function terminSchluessel(termin: ClubEvent): string {
  return termin.recurring ? `${termin.uid}~${termin.originalStartInstant}` : termin.uid;
}
