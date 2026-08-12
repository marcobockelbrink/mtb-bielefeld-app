/**
 * Die Jugendtrainings der Vereins-API.
 *
 * Kein eigener Zugang: Alles läuft über den `ApiZugang` aus `api.ts`, der
 * schon Token, Erneuerung und Fehlerübersetzung mitbringt. Dieses Modul
 * kennt nur die Pfade und die Formen.
 *
 * Daten kommen als JSON, Zeitangaben also als Zeichenketten — sie werden
 * hier einmal zu `Date` gemacht, damit die Bildschirme nicht jeder für sich
 * daran denken müssen.
 */

import type { KindEingabe, TrainingEingabe, Zustand } from '../domain/apiVertrag';
import type { ApiZugang } from './api';

// Die Eingabeformen stehen in `domain/apiVertrag.ts`, weil der Server dieselben
// erwartet. Hier weitergereicht, damit die Bildschirme sie wie bisher aus
// diesem Modul beziehen können.
export type { KindEingabe, TrainingEingabe, Zustand };

export interface Training {
  id: string;
  beginntAm: Date;
  endetAm: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  belegt: number;
}

export interface TrainingDetails extends Training {
  /**
   * Die angemeldeten Kinder. `eigene` markiert die des anfragenden Kontos.
   *
   * Ohne diese Markierung wüsste die App nach einem Neustart nicht mehr,
   * welchen Platz sie abmelden darf — die Kennung lebte vorher nur im
   * Arbeitsspeicher des Bildschirms, und wer ihn verließ, konnte sein Kind
   * nie wieder austragen. Der Platz blieb bis zum Training belegt.
   *
   * `eigene` ist **nicht** dasselbe wie „darf den Namen sehen": Ein Guide
   * sieht bei fremden Kindern den vollen Namen und trotzdem `eigene: false`.
   * Sichtbarkeit ist nicht Besitz.
   */
  kinder: Array<{ id: string; anzeige: string; eigene: boolean }>;
  /** Nur für Guides — sonst schickt die API das Feld gar nicht. */
  guides?: Array<{ mitgliedId: string; email: string; zusage: boolean }>;
  /**
   * Wie viele Guides zugesagt haben — anders als `guides` auch für
   * gewöhnliche Mitglieder gesetzt, die die Namen nicht sehen dürfen
   * (`api/src/app.ts`, `GET /jugendtraining/:id`). So sieht ein Elternteil,
   * ob genug Guides zugesagt haben, ohne zu erfahren, wer.
   */
  guideZusagen: number;
}

interface RohTraining {
  id: string;
  beginntAm: string;
  endetAm: string | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  belegt?: number;
}

function zuTraining(roh: RohTraining): Training {
  return {
    ...roh,
    beginntAm: new Date(roh.beginntAm),
    endetAm: roh.endetAm ? new Date(roh.endetAm) : null,
    belegt: roh.belegt ?? 0,
  };
}

export async function holeTrainings(api: ApiZugang): Promise<Training[]> {
  const roh = await api.hole<RohTraining[]>('/jugendtraining');
  return roh.map(zuTraining);
}

export async function holeTraining(api: ApiZugang, id: string): Promise<TrainingDetails> {
  const roh = await api.hole<RohTraining & Omit<TrainingDetails, keyof Training>>(
    `/jugendtraining/${encodeURIComponent(id)}`,
  );
  return { ...zuTraining(roh), kinder: roh.kinder, guides: roh.guides, guideZusagen: roh.guideZusagen };
}

export function meldeKindAn(
  api: ApiZugang,
  id: string,
  kind: KindEingabe,
): Promise<{ kindId: string; belegt: number }> {
  return api.sende(`/jugendtraining/${encodeURIComponent(id)}/kinder`, 'POST', kind);
}

export function meldeKindAb(api: ApiZugang, id: string, kindId: string): Promise<void> {
  return api.sende(
    `/jugendtraining/${encodeURIComponent(id)}/kinder/${encodeURIComponent(kindId)}`,
    'DELETE',
  );
}

export async function legeTrainingAn(api: ApiZugang, eingabe: TrainingEingabe): Promise<Training> {
  const roh = await api.sende<RohTraining>('/jugendtraining', 'POST', {
    ...eingabe,
    beginntAm: eingabe.beginntAm.toISOString(),
    endetAm: eingabe.endetAm ? eingabe.endetAm.toISOString() : null,
  });
  return zuTraining(roh);
}

export async function veroeffentliche(api: ApiZugang, id: string): Promise<Training> {
  const roh = await api.sende<RohTraining>(
    `/jugendtraining/${encodeURIComponent(id)}/veroeffentlichen`,
    'POST',
  );
  return zuTraining(roh);
}

export async function sageAb(api: ApiZugang, id: string, grund: string): Promise<Training> {
  const roh = await api.sende<RohTraining>(
    `/jugendtraining/${encodeURIComponent(id)}/absage`,
    'POST',
    { grund },
  );
  return zuTraining(roh);
}

export function setzeGuideAntwort(api: ApiZugang, id: string, zusage: boolean): Promise<void> {
  return api.sende(`/jugendtraining/${encodeURIComponent(id)}/guide`, 'PUT', { zusage });
}

export function setzeAbonnement(api: ApiZugang, an: boolean): Promise<void> {
  return api.sende('/konto/jugend-benachrichtigung', 'PUT', { an });
}
