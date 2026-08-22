/**
 * Die Bildrechte-Einwilligung (Handoff 15) — die Seite der App.
 *
 * Kein eigener Zugang: Alles läuft über den `ApiZugang` aus `api.ts`.
 * Dieses Modul kennt nur die Pfade und die Formen.
 */

import type { ApiZugang } from './api';

export type Einwilligungsstatus = 'offen' | 'erteilt' | 'abgelehnt' | 'widerrufen';

export interface Einwilligung {
  status: Einwilligungsstatus;
  textVersion: string | null;
  /** Wer geantwortet hat — der Name, nicht die Kennung. */
  bestaetigtVon: string | null;
  zeitpunkt: string | null;
  /** Die zweite Stimme ab 13 — `null`, wenn sie gar nicht gebraucht wird. */
  jugendBestaetigt: boolean | null;
  quelle: 'app' | 'forms-import' | null;
  /**
   * Zählt als „darf fotografiert werden"?
   *
   * Nicht dasselbe wie `status === 'erteilt'`: Bei einem Kind ab 13 fehlt
   * ohne die zweite Stimme noch etwas. „erteilt · Ben fehlt noch" ist kein
   * vollständiges Ja.
   */
  vollstaendig: boolean;
}

export interface Einwilligungstext {
  version: string;
  zusammenfassung: string;
  /** Der bindende Satz am Häkchen. */
  haekchen: string;
  abschnitte: { titel: string; absaetze: string[] }[];
}

export function holeEinwilligungstext(api: ApiZugang): Promise<Einwilligungstext> {
  return api.hole('/einwilligungstext');
}

/**
 * Die Einwilligung erteilen.
 *
 * **Es gibt hier bewusst kein Ablehnen und kein Widerrufen.** Beides
 * erfasst die Vereinsverwaltung auf Zuruf; die Hürde für ein Nein soll
 * beim Gespräch liegen. Der Server setzt das durch — ein Aufruf mit
 * `abgelehnt` von einem Mitgliedskonto endet mit 403, egal wer ihn
 * abschickt.
 *
 * `jugendBestaetigt` ist die zweite Stimme ab 13: entweder das Kind selbst
 * an seinem eigenen Konto oder das Häkchen der Eltern „<Name> stimmt zu".
 */
export function erteileEinwilligung(
  api: ApiZugang,
  kindId: string,
  jugendBestaetigt?: boolean,
): Promise<Einwilligung> {
  return api.sende(`/familie/${encodeURIComponent(kindId)}/einwilligung`, 'PATCH', {
    status: 'erteilt',
    ...(jugendBestaetigt === undefined ? {} : { jugendBestaetigt }),
  });
}

export interface KindMitEinwilligung {
  id: string;
  name: string | null;
  geburtsjahr: number | null;
  elternEmail: string;
  einwilligung: Einwilligung;
}

/** Sicht 15b — nur für die Verwaltung, der Server prüft die Rolle. */
export function holeBildrechte(api: ApiZugang): Promise<KindMitEinwilligung[]> {
  return api.hole('/verwaltung/bildrechte');
}

/**
 * Nein oder Widerruf erfassen — **nur die Verwaltung**.
 *
 * Getrennt von `erteileEinwilligung`, obwohl derselbe Pfad dahintersteht:
 * Zwei Wege mit verschiedenen Voraussetzungen sollen auch im Quelltext
 * verschieden heißen. Wer hier landet, hat gerade mit jemandem
 * gesprochen — das ist die Voraussetzung, nicht ein Knopfdruck.
 */
export function erfasseAntwort(
  api: ApiZugang,
  kindId: string,
  status: 'abgelehnt' | 'widerrufen',
): Promise<Einwilligung> {
  return api.sende(`/familie/${encodeURIComponent(kindId)}/einwilligung`, 'PATCH', { status });
}

/** Den Forms-Altbestand abhaken — einmaliger Übergang, danach ist Forms zu. */
export function hakeExternAb(api: ApiZugang, kindId: string): Promise<Einwilligung> {
  return api.sende(`/familie/${encodeURIComponent(kindId)}/einwilligung`, 'PATCH', {
    status: 'erteilt',
    quelle: 'forms-import',
  });
}
