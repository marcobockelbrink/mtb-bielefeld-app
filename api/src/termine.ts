/**
 * Der Vereinskalender, gelesen von der API selbst.
 *
 * Die API glaubt der App nichts: Ob ein Termin existiert, ob Gäste dürfen,
 * wie viele Plätze es gibt — all das steht im Kalender, und den liest sie
 * hier selbst, mit genau dem Parser, den auch die App benutzt. Käme die
 * Angabe vom Anfragenden, könnte jeder sie fälschen.
 *
 * Der Zwischenspeicher folgt derselben Grundregel wie die App: Ein alter
 * Stand ist besser als keiner. Scheitert der Abruf, bleibt der letzte
 * bekannte stehen und der Fehler geht laut ins Protokoll — nur wer noch nie
 * einen Stand hatte, scheitert wirklich.
 */

import { CALENDAR_ICS_URL } from '../../src/config.ts';
import { parseCalendar } from '../../src/data/ical/parseCalendar.ts';
import type { ClubEvent } from '../../src/domain/types.ts';
import { serialisiereFehler, type Protokoll } from './protokoll.ts';

/** Wie lange ein gelesener Kalender als frisch gilt. */
const FRIST_MS = 5 * 60 * 1000;

/**
 * Der stabile Schlüssel eines Termins.
 *
 * `uid` plus **ursprünglicher** Zeitpunkt — eine Verschiebung ändert die
 * Anzeige-Kennung `id`, aber nicht diesen Schlüssel; Anmeldungen bleiben
 * damit am Termin hängen. Der Schlüssel wird **nie geparst**, nur mit neu
 * berechneten verglichen — deshalb braucht die Tilde keine Sonderbehandlung,
 * falls sie je in einer `uid` auftauchen sollte. In URL-Pfaden steht sie
 * unkodiert.
 */
export function terminSchluessel(termin: ClubEvent): string {
  return `${termin.uid}~${termin.originalStartInstant}`;
}

export interface TerminDienst {
  holeTermine(): Promise<ClubEvent[]>;
  findeTermin(schluessel: string): Promise<ClubEvent | null>;
}

export interface TerminDienstAbhaengigkeiten {
  ladeKalender: () => Promise<string>;
  protokoll: Protokoll;
  jetzt?: () => Date;
  ttlMs?: number;
}

export function erzeugeTerminDienst({
  ladeKalender,
  protokoll,
  jetzt = () => new Date(),
  ttlMs = FRIST_MS,
}: TerminDienstAbhaengigkeiten): TerminDienst {
  let stand: { geladen: number; termine: ClubEvent[] } | null = null;

  async function holeTermine(): Promise<ClubEvent[]> {
    const nun = jetzt();
    if (stand && nun.getTime() - stand.geladen < ttlMs) return stand.termine;

    try {
      const roh = await ladeKalender();
      stand = { geladen: nun.getTime(), termine: parseCalendar(roh, { now: nun }) };
    } catch (fehler) {
      if (!stand) throw fehler;
      // Alter Stand ist besser als keiner — aber nicht stillschweigend.
      protokoll.error(
        { fehler: serialisiereFehler(fehler) },
        'Kalenderabruf gescheitert, letzter Stand bleibt stehen',
      );
      stand = { ...stand, geladen: nun.getTime() };
    }

    return stand.termine;
  }

  return {
    holeTermine,
    async findeTermin(schluessel) {
      const termine = await holeTermine();
      return termine.find((t) => terminSchluessel(t) === schluessel) ?? null;
    },
  };
}

/** Der Dienst für den Betrieb: lädt über das Netz. */
export function erzeugeStandardTerminDienst(protokoll: Protokoll): TerminDienst {
  const url = process.env.KALENDER_URL ?? CALENDAR_ICS_URL;
  return erzeugeTerminDienst({
    ladeKalender: async () => {
      const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!antwort.ok) throw new Error(`Kalender antwortet mit HTTP ${antwort.status}`);
      return antwort.text();
    },
    protokoll,
  });
}
