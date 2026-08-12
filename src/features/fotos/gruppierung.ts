/**
 * Fotos nach Tagen gruppieren — ohne React Native, damit es ohne Gerät
 * prüfbar bleibt (dasselbe Muster wie `format.ts` beim Jugendtraining).
 *
 * Sortiert wird nach Aufnahmezeit: Bei einer Wochentour erzählen die Bilder
 * dann den Ablauf der Woche, egal in welcher Reihenfolge fünf Leute sie
 * hochgeladen haben. Bilder ohne EXIF-Datum fallen unter „Ohne Datum" ans
 * Ende — die API sortiert sie ohnehin dorthin (`NULLS LAST`), und ein Album,
 * das mit den datenlosen beginnt, sähe nach einem Fehler aus.
 */

import type { Foto } from '../../data/fotos';

export interface Tagesgruppe {
  /** `null` für die Bilder ohne Aufnahmezeit. */
  tag: Date | null;
  ueberschrift: string;
  fotos: Foto[];
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function tagesschluessel(datum: Date): string {
  return `${datum.getFullYear()}-${datum.getMonth()}-${datum.getDate()}`;
}

function ueberschrift(datum: Date): string {
  return `${WOCHENTAGE[datum.getDay()]}, ${datum.getDate()}. ${MONATE[datum.getMonth()]}`;
}

export function gruppiereNachTagen(fotos: Foto[]): Tagesgruppe[] {
  const gruppen: Tagesgruppe[] = [];
  const nachSchluessel = new Map<string, Tagesgruppe>();
  let ohneDatum: Tagesgruppe | null = null;

  // Die Eingabe kommt von der API bereits sortiert; hier wird nur verteilt,
  // nicht erneut sortiert — zwei Sortierungen, die auseinanderlaufen können,
  // wären eine Fehlerquelle ohne Gegenwert.
  for (const foto of fotos) {
    if (!foto.aufgenommenAm) {
      if (!ohneDatum) {
        ohneDatum = { tag: null, ueberschrift: 'Ohne Datum', fotos: [] };
      }
      ohneDatum.fotos.push(foto);
      continue;
    }

    const schluessel = tagesschluessel(foto.aufgenommenAm);
    let gruppe = nachSchluessel.get(schluessel);
    if (!gruppe) {
      gruppe = { tag: foto.aufgenommenAm, ueberschrift: ueberschrift(foto.aufgenommenAm), fotos: [] };
      nachSchluessel.set(schluessel, gruppe);
      gruppen.push(gruppe);
    }
    gruppe.fotos.push(foto);
  }

  if (ohneDatum) gruppen.push(ohneDatum);
  return gruppen;
}

/**
 * Eine Tagesüberschrift lohnt erst, wenn es etwas zu unterscheiden gibt:
 * Ein Album, dessen Bilder alle vom selben Tag stammen, braucht keine
 * Zwischenzeile, die nur wiederholt, was der Albumtitel schon sagt.
 */
export function brauchtUeberschriften(gruppen: Tagesgruppe[]): boolean {
  return gruppen.length > 1;
}
