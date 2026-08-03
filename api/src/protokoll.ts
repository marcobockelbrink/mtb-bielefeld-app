/**
 * Das Protokoll, auf das die Fachlogik schreibt.
 *
 * Bewusst eine eigene, winzige Schnittstelle statt des Fastify-Loggers:
 * Die Rechenlogik soll ohne Rahmenwerk prüfbar bleiben. Der Logger von
 * Fastify erfüllt sie ohne Zutun, Tests reichen eine Attrappe herein.
 */

export interface Protokoll {
  /** Etwas ist schiefgegangen. `daten` trägt den Fehler und den Zusammenhang. */
  error(daten: Record<string, unknown>, nachricht: string): void;
  /**
   * Alltagsrauschen, kein Alarm: etwas Erwartetes ist eingetreten und soll
   * für den Betreiber sichtbar bleiben (etwa Missbrauchsmuster), ohne wie
   * ein `error` zu wirken. `daten` trägt denselben Zusammenhang wie dort.
   */
  info(daten: Record<string, unknown>, nachricht: string): void;
}

/**
 * Macht aus einem Fehler etwas, das im Protokoll lesbar ankommt.
 *
 * Der Logger von Fastify (pino) kennt nur das Feld `err` und schreibt für
 * jeden anderen Error stur `{}` — Meldung und Stapel wären weg, der
 * bewusst laute Fehler wieder still. Deshalb der eigene Serialisierer für
 * unser Feld `fehler`.
 */
export function serialisiereFehler(fehler: unknown): unknown {
  if (!(fehler instanceof Error)) return fehler;
  return {
    name: fehler.name,
    nachricht: fehler.message,
    stapel: fehler.stack,
    ursache: fehler.cause === undefined ? undefined : String(fehler.cause),
  };
}

/** Schreibt nichts, merkt sich alles. Für Tests. */
export class GemerktesProtokoll implements Protokoll {
  readonly fehler: { daten: Record<string, unknown>; nachricht: string }[] = [];
  readonly eintraege: { daten: Record<string, unknown>; nachricht: string }[] = [];

  error(daten: Record<string, unknown>, nachricht: string): void {
    this.fehler.push({ daten, nachricht });
  }

  info(daten: Record<string, unknown>, nachricht: string): void {
    this.eintraege.push({ daten, nachricht });
  }
}
