/**
 * Läuft diese App noch zum Server? (Handoff 16)
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar
 * bleibt — dasselbe Muster wie `entwurf.ts` gegenüber dem Formular. Der
 * Vergleich selbst steht in `src/domain/fassung.ts`, weil der Server
 * dieselbe Rechnung anstellt.
 *
 * ## Drei Lagen, und nur eine sperrt
 *
 * - **`gesperrt`** — unterhalb der Mindestversion. Der Server wiese jeden
 *   Aufruf mit `426` ab; die App zeigt eine Sperre ohne Ausweg.
 * - **`hinweis`** — es gibt etwas Neueres, aber das hier läuft noch. Eine
 *   wegwischbare Karte, mehr nicht.
 * - **`aktuell`** — nichts zu tun.
 *
 * Die Trennung ist der ganze Punkt: Gezwungen wird nur, was wirklich
 * bricht. Wer bei jedem Release sperrt, sperrt Eltern am Trainingsmorgen
 * aus, und beim dritten Mal installiert niemand mehr etwas freiwillig.
 */

import { istAelterAls } from '../../domain/fassung';

export interface Versionsauskunft {
  mindestVersion: string;
  aktuelleVersion: string;
  hinweis: string | null;
}

export type Versionslage = 'gesperrt' | 'hinweis' | 'aktuell';

/**
 * Was die App mit dieser Auskunft anfangen soll.
 *
 * **Ohne Auskunft `aktuell`** — nicht `gesperrt`. Ein Telefon im Funkloch
 * bekommt keine Antwort, und eine App, die sich bei fehlender Verbindung
 * selbst sperrt, wäre im Wald unbenutzbar. Genau dort steht sie aber am
 * häufigsten. Die Sperre ist eine Aussage des Servers, kein Zustand, in
 * den man aus Unwissen fällt.
 *
 * Der Server hat den doppelten Boden: Kommt eine zu alte App wirklich
 * durch, weist er sie mit `426` ab, und das behandelt `api.ts` wie diese
 * Sperre hier.
 */
export function beurteile(
  appVersion: string,
  auskunft: Versionsauskunft | null,
): Versionslage {
  if (auskunft === null) return 'aktuell';
  if (istAelterAls(appVersion, auskunft.mindestVersion)) return 'gesperrt';
  if (istAelterAls(appVersion, auskunft.aktuelleVersion)) return 'hinweis';
  return 'aktuell';
}

/**
 * Soll die Hinweiskarte erscheinen?
 *
 * `weggewischt` ist die Fassung, für die zuletzt das ✕ gedrückt wurde.
 * Verglichen wird gegen `aktuelleVersion` und **nicht** gegen die eigene:
 * Wer 1.6.0 weggewischt hat, soll bei 1.7.0 wieder etwas sehen, ohne dass
 * er selbst etwas getan hätte.
 *
 * Kein Zähler, keine Frist, kein zweites Nachfassen — genau einmal je
 * Fassung. Eine Karte, die wiederkommt, wird zur Karte, die man nicht mehr
 * liest.
 */
export function zeigeHinweis(
  lage: Versionslage,
  auskunft: Versionsauskunft | null,
  weggewischt: string | null,
): boolean {
  if (lage !== 'hinweis' || auskunft === null) return false;
  return weggewischt !== auskunft.aktuelleVersion;
}
