/**
 * Welche Beiträge schon gelesen sind — Befund „G2" aus dem
 * Usability-Review vom 15.08.2026.
 *
 * Wer regelmäßig in „Aktuelles" schaut, sah nicht, was seit dem letzten
 * Mal dazugekommen ist; das Datum allein beantwortet das nicht, wenn man
 * nicht weiß, wann man zuletzt hier war.
 *
 * ## Der Startpunkt ist der ganze Trick
 *
 * Ein reiner Merkzettel gelesener Kennungen hätte einen unangenehmen
 * ersten Tag: Beim allerersten Start wäre **jeder** Beitrag ungelesen,
 * und über dreißig Karten stünde ein Punkt. Das ist kein Hinweis mehr,
 * sondern Tapete — und es stimmt nicht einmal: Wer die App gerade
 * installiert hat, hat nichts „verpasst".
 *
 * Deshalb `seit`: Beim ersten Start wird der Zeitpunkt festgehalten, und
 * alles, was davor veröffentlicht wurde, gilt als gelesen. Ein Punkt
 * heißt damit genau eine Sache — **seit du die App hast, ist das neu**.
 *
 * Reine Rechenlogik ohne React Native; die Anbindung an den Speicher
 * steht daneben in `gelesenSpeicher.ts`.
 */

import type { NewsItem } from '../../domain/types';

export interface GelesenStand {
  /** Kennungen gelesener Beiträge, zuletzt gelesene zuerst. */
  ids: string[];
  /** Alles, was davor veröffentlicht wurde, zählt als gelesen. */
  seit: number;
}

/**
 * Wie viele Kennungen aufgehoben werden.
 *
 * Der Verein veröffentlicht ein paar Beiträge im Monat — 300 reichen für
 * Jahre. Eine Obergrenze braucht es trotzdem: Ohne sie wüchse die Liste
 * mit jedem gelesenen Beitrag weiter, und der Speicher ist derselbe, in
 * dem auch der Zwischenspeicher der Termine liegt.
 */
export const HOECHSTZAHL = 300;

export function ersterStand(jetzt: Date): GelesenStand {
  return { ids: [], seit: jetzt.getTime() };
}

/**
 * Ungelesen ist, was **nach** dem Startpunkt erschien und nicht auf dem
 * Merkzettel steht.
 *
 * Die Reihenfolge der beiden Prüfungen ist gleichgültig, ihre Verknüpfung
 * nicht: Ein alter Beitrag bleibt auch dann ohne Punkt, wenn er nie
 * geöffnet wurde — sonst wäre der Startpunkt wirkungslos.
 */
export function istUngelesen(beitrag: NewsItem, stand: GelesenStand): boolean {
  if (beitrag.publishedAt.getTime() <= stand.seit) return false;
  return !stand.ids.includes(beitrag.id);
}

export function zaehleUngelesen(beitraege: NewsItem[], stand: GelesenStand): number {
  return beitraege.filter((beitrag) => istUngelesen(beitrag, stand)).length;
}

/**
 * Vermerkt einen Beitrag als gelesen.
 *
 * Liefert denselben Stand zurück, wenn er schon vermerkt war — das spart
 * ein Schreiben auf das Gerät bei jedem erneuten Öffnen desselben
 * Beitrags, und die Aufrufer prüfen darauf.
 */
export function markiereGelesen(stand: GelesenStand, id: string): GelesenStand {
  if (stand.ids.includes(id)) return stand;
  return { ...stand, ids: [id, ...stand.ids].slice(0, HOECHSTZAHL) };
}

/**
 * Aus dem Speicher gelesen — Kaputtes wird verworfen, nicht repariert.
 *
 * `null` heißt „noch nichts da"; die Aufrufer legen dann mit
 * `ersterStand` an. Ein beschädigter Eintrag führt bewusst auf denselben
 * Weg: Ein halber Stand mit `seit: NaN` machte jeden Vergleich falsch,
 * und zwar stumm.
 */
export function ausJson(roh: string | null): GelesenStand | null {
  if (!roh) return null;
  try {
    const daten: unknown = JSON.parse(roh);
    if (typeof daten !== 'object' || daten === null) return null;

    const stand = daten as Partial<GelesenStand>;
    if (typeof stand.seit !== 'number' || !Number.isFinite(stand.seit)) return null;
    if (!Array.isArray(stand.ids)) return null;

    return {
      seit: stand.seit,
      ids: stand.ids.filter((eintrag): eintrag is string => typeof eintrag === 'string'),
    };
  } catch {
    return null;
  }
}

export function zuJson(stand: GelesenStand): string {
  return JSON.stringify(stand);
}
