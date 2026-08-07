/**
 * Wer von den angemeldeten Kindern gehört mir, und darf ich noch eines
 * anmelden?
 *
 * Ohne React Native, damit es ohne Gerät prüfbar bleibt — dasselbe Muster
 * wie `eingabe.ts` daneben.
 *
 * **Warum das überhaupt eine eigene Datei ist.** Vorher merkte sich
 * `KindAnmelden.tsx` die Kennung des eben angemeldeten Kindes nur im
 * Arbeitsspeicher. Wer den Bildschirm verließ, konnte sein Kind nie wieder
 * abmelden: `DELETE …/kinder/:kindId` braucht genau diese Kennung, und die
 * war weg. Der Platz blieb bis zum Training belegt, und auflösen konnte das
 * nur jemand mit Zugriff auf die Datenbank.
 *
 * Jetzt kommt die Antwort aus der API (`eigene` je Kind, siehe
 * `src/data/jugend.ts`), und diese Datei rechnet daraus die beiden Fragen
 * aus, die die Oberfläche stellt.
 */

import type { TrainingDetails } from '../../data/jugend';

/**
 * Wie viele Kinder ein Konto je Training anmelden darf.
 *
 * Die Zahl steht hier **und** in der Datenbank, und die Datenbank ist die
 * Wahrheit: Ein Teilindex auf `platz IN (1, 2)` weist ein drittes Kind auch
 * dann ab, wenn zwei Eltern gleichzeitig auf den Knopf drücken — das kann
 * keine Prüfung in der App leisten. Der Wert hier blendet nur das Formular
 * rechtzeitig aus, damit niemand tippt und dann ein 409 bekommt.
 *
 * Wer ihn ändert, muss **drei** Stellen mitziehen, sonst verspricht die App
 * einen Platz, den die Datenbank nicht gibt:
 * `CHECK (platz IN (1, 2))` und den Teilindex in
 * `api/src/migrationen/012-jugendtraining.sql`, dazu die Liste
 * `(VALUES (1), (2))` in `meldeKindAn` (`api/src/jugendtraining.ts`).
 */
export const KINDER_JE_KONTO = 2;

/** Die Kinder, die das anfragende Konto angemeldet hat — in der Reihenfolge
 *  ihrer Anmeldung, wie die API sie liefert. */
export function eigeneKinder(training: TrainingDetails): TrainingDetails['kinder'] {
  return training.kinder.filter((kind) => kind.eigene);
}

/**
 * Darf das Formular noch stehen?
 *
 * Zwei Gründe dagegen, und beide müssen greifen: Ein abgesagtes Training
 * nimmt gar nichts mehr an, und wer sein Kontingent ausgeschöpft hat, soll
 * kein Formular sehen, das nur noch 409 liefern kann.
 *
 * Ein **Entwurf** zählt ebenfalls dazu. Er ist nur für Guides sichtbar, und
 * `POST …/kinder` antwortet darauf mit 409 („Für dieses Training kann man
 * sich nicht anmelden.") — ein Formular davor wäre eine Einladung ins Leere.
 */
export function darfNochAnmelden(training: TrainingDetails): boolean {
  if (training.zustand !== 'veroeffentlicht') return false;
  return eigeneKinder(training).length < KINDER_JE_KONTO;
}
