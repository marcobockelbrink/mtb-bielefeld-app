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
 * Womit das Formular startet, ohne dass jemand etwas getan hat.
 *
 * `hatInhalt` braucht das, um Vorbelegtes von Eingetipptem zu
 * unterscheiden. Als ISO-Zeichenketten, weil der Entwurf so aussieht.
 */
export interface Vorbelegung {
  datum: string | null;
  uhrzeit: string | null;
}

/**
 * Leer ist leer — ein Entwurf ohne Inhalt lohnt kein Anbieten.
 *
 * **Vorbelegt ist nicht gefüllt.** `guidesNoetig` zählt aus diesem Grund
 * schon immer nicht mit: Das Feld startet auf „2", und ein unangetastetes
 * Formular wäre sonst dauernd „gefüllt".
 *
 * Seit dem 19.08.2026 gilt dasselbe für Tag und Uhrzeit. Das Formular
 * startet auf dem nächsten Sonntag um 10:30 (Handoff 14) — ohne die
 * `vorbelegung` hier gälte jedes geöffnete und sofort wieder verlassene
 * Formular als Entwurf, und beim nächsten Anlegen fragte die App
 * zuverlässig nach einem „gefundenen Entwurf", der nur aus der eigenen
 * Voreinstellung besteht. Ein Hinweis, den man dreimal wegtippt, wird
 * beim vierten Mal auch dann weggetippt, wenn wirklich etwas drinsteht.
 *
 * Ohne `vorbelegung` aufgerufen zählt jeder gesetzte Wert — das ist der
 * alte Stand und für Entwürfe richtig, die vor der Umstellung entstanden.
 */
export function hatInhalt(entwurf: TrainingsEntwurf, vorbelegung?: Vorbelegung): boolean {
  const abweichend = (wert: string | null, vorgabe: string | null | undefined) =>
    wert !== null && wert !== vorgabe;

  return (
    abweichend(entwurf.datum, vorbelegung?.datum) ||
    abweichend(entwurf.uhrzeit, vorbelegung?.uhrzeit) ||
    entwurf.ort.trim() !== '' ||
    entwurf.hinweis.trim() !== '' ||
    entwurf.plaetze.trim() !== ''
  );
}

export function istFrisch(entwurf: TrainingsEntwurf, jetzt: Date): boolean {
  return jetzt.getTime() - entwurf.standAm <= HALTBAR_MS;
}

/**
 * Die beiden Zahlen zwischen Entwurf und Zählern übersetzen.
 *
 * Das Entwurfsformat hält sie als **Zeichenkette** — es ist älter als die
 * Zähler (Handoff 11, „11c" vom 16.08.2026), und ein Formatwechsel machte
 * jeden gespeicherten Entwurf ungültig. Gerade die sind das, was hier
 * nicht verlorengehen soll.
 *
 * `null` heißt bei den Plätzen **unbegrenzt** — in der API etwas anderes
 * als 0, und deshalb darf ein unlesbarer Wert auch nicht auf 0 fallen.
 */
export function plaetzeAusEntwurf(text: string): number | null {
  const zahl = Number.parseInt(text, 10);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : null;
}

/**
 * Anders als bei den Plätzen gibt es hier kein „unbegrenzt": Ein Training
 * braucht Guides. Unlesbares fällt deshalb auf die Voreinstellung zurück,
 * nicht auf `null` — und keinesfalls auf `NaN`, denn ein Zähler mit `NaN`
 * ließe sich nicht mehr bedienen.
 */
export function guidesAusEntwurf(text: string, ersatz: number): number {
  const zahl = Number.parseInt(text, 10);
  return Number.isFinite(zahl) && zahl > 0 ? zahl : ersatz;
}

/** Und zurück: `null` wird zur leeren Zeichenkette, wie im alten Formular. */
export function zahlInEntwurf(wert: number | null): string {
  return wert === null ? '' : String(wert);
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
