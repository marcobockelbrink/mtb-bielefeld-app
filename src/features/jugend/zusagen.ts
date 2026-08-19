/**
 * Die Zusage-Lage eines Trainings — wer kann, wer nicht, wer schweigt.
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar bleibt;
 * die Anzeige steht daneben in `GuideKarte.tsx`. Dasselbe Muster wie bei
 * `entwurf.ts` gegenüber dem Formular.
 *
 * Aus Handoff 14: „Sieht das mit den Zusage-Buttons nicht komisch aus? Mal
 * blau, mal grau." Die Farbe sagte nichts über den Zustand — sie markierte
 * weder „wichtig" noch „gewählt", und dieselbe Farbe trug die eigene Zusage
 * und das Veröffentlichen für alle Familien.
 */

import type { TrainingDetails } from '../../data/jugend';

/** Eine Zeile der Guide-Liste, so wie die API sie liefert. */
export type GuideAntwort = NonNullable<TrainingDetails['guides']>[number];

/**
 * Die eigene Antwort aus der Liste — `null` heißt „noch nicht beantwortet".
 *
 * **Der Kern des Handoffs.** Die eigene Antwort stand vorher nirgends auf
 * der Seite: „Du hast zugesagt." war eine Meldung unmittelbar nach dem
 * Tippen, und wer die Seite neu öffnete, musste raten, ob der Tipp gezählt
 * hat. Dabei lag die Antwort die ganze Zeit in derselben Liste — nur hat
 * nie jemand die eigene Zeile darin gesucht.
 *
 * Ohne bekannte Kennung (`mitgliedId === null`, etwa solange die
 * Kontoauskunft noch lädt) kommt `null` heraus und nicht etwa die Antwort
 * eines Fremden.
 */
export function eigeneZusage(
  guides: GuideAntwort[],
  mitgliedId: string | null,
): boolean | null {
  if (mitgliedId === null) return null;
  return guides.find((guide) => guide.mitgliedId === mitgliedId)?.zusage ?? null;
}

/** Was in der Guide-Liste neben dem Punkt steht. */
export type Stand = 'zugesagt' | 'kann nicht' | 'offen';

/**
 * Der Zustand eines Guides als Wort.
 *
 * **Ein Wort und nicht nur eine Farbe.** Draußen in der Sonne und bei
 * Rot-Grün-Schwäche trägt Farbe allein keine Aussage; sie darf begleiten,
 * nicht sprechen. Deshalb steht sie in `GuideKarte` neben diesem Wort und
 * nicht an seiner Stelle.
 */
export function beschreibeStand(zusage: boolean | null): Stand {
  if (zusage === true) return 'zugesagt';
  if (zusage === false) return 'kann nicht';
  return 'offen';
}

/**
 * Wie ein Guide in der Liste heißt.
 *
 * Der Name, wo einer hinterlegt ist — eine Mailadresse ist eine Kennung,
 * kein Name: „t.mueller82@gmx.de" sagt in einer Guide-Liste weniger als
 * „Thomas". Ein leerer oder nur aus Leerzeichen bestehender Name zählt
 * nicht; er sähe in der Zeile aus wie ein Fehler.
 *
 * Die eigene Zeile bekommt „(du)" — in einer Liste aus fünf Namen ist das
 * die Zeile, die man sucht.
 */
export function beschreibeGuide(guide: GuideAntwort, eigeneKennung: string | null): string {
  const name = guide.name?.trim();
  const anzeige = name ? name : guide.email;
  return guide.mitgliedId === eigeneKennung ? `${anzeige} (du)` : anzeige;
}
