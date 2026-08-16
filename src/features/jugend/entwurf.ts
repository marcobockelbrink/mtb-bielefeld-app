/**
 * Der Entwurf des Trainings-Formulars, damit er einen Anruf überlebt.
 *
 * Der Anlass steht im Usability-Review vom 15.08.2026: Ein Guide tippt am
 * Trailrand, ein Anruf kommt oder die App wird weggewischt — und alles
 * Getippte ist weg. Für „unter Zeitdruck draußen" war das der Blocker.
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar bleibt;
 * die Anbindung an AsyncStorage steht daneben in `entwurfSpeicher.ts` —
 * dasselbe Muster wie bei der Upload-Warteschlange.
 */

export interface TrainingsEntwurf {
  /** Als ISO-Zeichenkette, weil ein `Date` die Reise durch JSON nicht übersteht. */
  datum: string | null;
  uhrzeit: string | null;
  ort: string;
  hinweis: string;
  plaetze: string;
  guidesNoetig: string;
  /** Wann zuletzt getippt wurde — alte Entwürfe bietet niemand mehr an. */
  standAm: number;
}

/** Nach dieser Zeit ist ein Entwurf kalt und wird nicht mehr angeboten. */
export const HALTBAR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Leer ist leer — ein Entwurf ohne Inhalt lohnt kein Anbieten.
 *
 * `guidesNoetig` zählt bewusst **nicht** mit: Das Feld ist mit „2"
 * vorbelegt, und ein unangetastetes Formular wäre sonst immer „gefüllt".
 */
export function hatInhalt(entwurf: TrainingsEntwurf): boolean {
  return (
    entwurf.datum !== null ||
    entwurf.uhrzeit !== null ||
    entwurf.ort.trim() !== '' ||
    entwurf.hinweis.trim() !== '' ||
    entwurf.plaetze.trim() !== ''
  );
}

export function istFrisch(entwurf: TrainingsEntwurf, jetzt: Date): boolean {
  return jetzt.getTime() - entwurf.standAm <= HALTBAR_MS;
}

/**
 * Aus dem Speicher gelesen — Kaputtes wird verworfen, nicht repariert.
 *
 * Ein halber Entwurf, der beim Wiederherstellen Felder mit `undefined`
 * füllt, wäre schlimmer als keiner: Das Formular sähe befüllt aus und
 * verhielte sich falsch.
 */
export function ausJson(roh: string | null): TrainingsEntwurf | null {
  if (!roh) return null;
  try {
    const daten: unknown = JSON.parse(roh);
    if (typeof daten !== 'object' || daten === null) return null;
    const e = daten as Partial<TrainingsEntwurf>;
    if (typeof e.standAm !== 'number') return null;

    return {
      datum: typeof e.datum === 'string' ? e.datum : null,
      uhrzeit: typeof e.uhrzeit === 'string' ? e.uhrzeit : null,
      ort: typeof e.ort === 'string' ? e.ort : '',
      hinweis: typeof e.hinweis === 'string' ? e.hinweis : '',
      plaetze: typeof e.plaetze === 'string' ? e.plaetze : '',
      guidesNoetig: typeof e.guidesNoetig === 'string' ? e.guidesNoetig : '2',
      standAm: e.standAm,
    };
  } catch {
    return null;
  }
}
