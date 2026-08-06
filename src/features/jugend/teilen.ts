/**
 * Der Nachrichtentext für den Teilen-Knopf.
 *
 * Reine Textbausteinlogik ohne React Native — dieselbe Trennung wie bei
 * `format.ts` daneben, damit sich der Text ohne Gerät prüfen lässt. Das
 * eigentliche Teilen (`Share.share`) steht in `app/jugend/[id].tsx`, wo die
 * React-Native-Anbindung ohnehin schon liegt.
 *
 * Ort und Uhrzeit dürfen hier stehen, obwohl `GET /t/:id` (`api/src/app.ts`)
 * sie bewusst verschweigt: Der Text geht in dieselbe WhatsApp-Gruppe, die
 * diese Angaben heute ohnehin per Hand bekommt. Der Link darin kann
 * weitergeleitet werden — der Text in aller Regel nicht.
 */

import type { Training } from '../../data/jugend';
import { formatiereTrainingszeit } from './format';

/**
 * Baut den Nachrichtentext — oder wirft, statt ihn zu bauen.
 *
 * Nur ein **veröffentlichtes** Training lässt sich teilen. Ein Entwurf hat
 * noch keine verlässlichen Angaben (ein Guide könnte Ort oder Zeit noch
 * ändern), und eine Einladung zu einem abgesagten Training wäre schlimmer
 * als gar keine Einladung. `app/jugend/[id].tsx` blendet den Knopf für beide
 * Fälle schon aus — die Prüfung steht trotzdem hier, nicht nur dort: Sonst
 * müsste jede künftige Aufrufstelle dieselbe Vorsicht neu erfinden, und ein
 * vergessenes `if` dort würde hier nicht auffallen.
 */
export function baueTeilenText(training: Training, basisUrl: string): string {
  if (training.zustand !== 'veroeffentlicht') {
    throw new Error('Nur ein veröffentlichtes Training lässt sich teilen.');
  }
  // Schrägstrich am Ende abschneiden: `basisUrl` ist `TEILEN_BASIS_URL`
  // (`src/config.ts`), abgeleitet von `API_BASE_URL` — die endet nie mit
  // einem, aber ein doppelter Schrägstrich im Link wäre trotzdem hässlich
  // und in manchen WhatsApp-Vorschauen kaputt.
  const link = `${basisUrl.replace(/\/+$/, '')}/t/${training.id}`;
  return (
    `Jugendtraining ${formatiereTrainingszeit(training)}\n` +
    `${training.ort}\n\n` +
    `Alle Einzelheiten und die Anmeldung fürs Kind: ${link}`
  );
}
