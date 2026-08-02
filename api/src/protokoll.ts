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
}

/** Schreibt nichts, merkt sich alles. Für Tests. */
export class GemerktesProtokoll implements Protokoll {
  readonly fehler: { daten: Record<string, unknown>; nachricht: string }[] = [];

  error(daten: Record<string, unknown>, nachricht: string): void {
    this.fehler.push({ daten, nachricht });
  }
}
