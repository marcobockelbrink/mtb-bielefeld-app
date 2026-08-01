/**
 * Liest die Tourdaten aus der Terminbeschreibung.
 *
 * Der Verein beschreibt seine Angebote seit Jahren nach einem festen Muster:
 *
 *     Euer Guide: Malte
 *     Uhrzeit & Dauer: 10Uhr, ca. 3 Std
 *     Abfahrtsort: Parkplatz Eisgrund
 *     Ausdauer: ⭐/⭐⭐ ca. 22 km, 450hm, mittleres Tempo
 *     Fahrtechnik: ⭐
 *     Trail-Anteil: gering
 *     Schwierigkeitsgrad: flowig
 *
 * Genau daraus entstehen die Filter der App. Weil die Angaben von Hand
 * geschrieben werden, ist der Parser bewusst nachsichtig: Groß- und
 * Kleinschreibung, Leerzeichen vor dem Doppelpunkt und Schreibvarianten wie
 * "Eure Guides" führen zum selben Ergebnis. Fehlt eine Angabe, bleibt das Feld
 * leer — die App zeigt dann eben weniger an, statt zu raten.
 */

import type { RideDetails, StarRange } from '../../domain/types';

/** Bekannte Beschriftungen, zusammengefasst auf ein einheitliches Kürzel. */
const LABEL_ALIASES: Record<string, keyof LabelValues> = {
  ausdauer: 'endurance',
  kondition: 'endurance',
  fahrtechnik: 'technique',
  technik: 'technique',
  trailanteil: 'trailShare',
  schwierigkeitsgrad: 'difficulty',
  schwierigkeit: 'difficulty',
  guide: 'guides',
  guides: 'guides',
  euerguide: 'guides',
  eureguides: 'guides',
  euerguides: 'guides',
  eureguide: 'guides',
  abfahrtsort: 'meetingPoint',
  treffpunkt: 'meetingPoint',
  startpunkt: 'meetingPoint',
  uhrzeitdauer: 'timeAndDuration',
  uhrzeit: 'timeAndDuration',
  dauer: 'timeAndDuration',
  maxteilnehmerzahl: 'maxParticipants',
  maxteilnehmer: 'maxParticipants',
  teilnehmerzahl: 'maxParticipants',
  anmeldungunter: 'signup',
  anmeldung: 'signup',
  charakter: 'character',
};

interface LabelValues {
  endurance?: string;
  technique?: string;
  trailShare?: string;
  difficulty?: string;
  guides?: string;
  meetingPoint?: string;
  timeAndDuration?: string;
  maxParticipants?: string;
  signup?: string;
  character?: string;
}

/**
 * Vereinheitlicht eine Beschriftung: Kleinbuchstaben, ohne Leer- und
 * Sonderzeichen. So werden "Trail-Anteil", "Trail-Anteil " und "TRAILANTEIL"
 * zum selben Schlüssel.
 */
function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-zäöüß]/g, '');
}

/**
 * Sucht Beschriftungen zeilenweise.
 *
 * Zwei Fälle sind zu unterscheiden: "Ausdauer: ⭐⭐" ist eine Angabe, ein Satz
 * wie "Wir treffen uns hier: am Parkplatz" nicht. Deshalb greift der Parser nur
 * bei bekannten Beschriftungen und nur am Zeilenanfang.
 */
function collectLabels(text: string): LabelValues {
  const values: LabelValues = {};

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    // Führende Klammern und Aufzählungszeichen abstreifen: "(Schwierigkeitsgrad: …"
    line = line.replace(/^[(\-•*\s]+/, '');

    // Mehrere Angaben in einer Zeile kommen vor, wenn der Verein sie mit
    // Leerzeichen statt Umbruch trennt.
    // Bindestrich und Schrägstrich gehören in die Zeichenklasse, sonst bleibt
    // von "Trail-Anteil:" nur "Anteil:" übrig und die Angabe geht verloren.
    const pattern = /([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß.&\-/\s]{1,28}?)\s*:\s*/g;
    const matches = [...line.matchAll(pattern)];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const key = LABEL_ALIASES[normalizeLabel(match[1])];
      if (!key) continue;
      const valueStart = match.index + match[0].length;
      // Der Wert reicht bis zur nächsten erkannten Beschriftung.
      let valueEnd = line.length;
      for (let j = i + 1; j < matches.length; j++) {
        if (LABEL_ALIASES[normalizeLabel(matches[j][1])]) {
          valueEnd = matches[j].index;
          break;
        }
      }
      const value = line.slice(valueStart, valueEnd).trim();
      // Die erste Nennung gewinnt: Vereinstexte wiederholen Angaben manchmal
      // am Ende in einem Fließtext.
      if (value && values[key] === undefined) values[key] = value;
    }
  }

  return values;
}

/**
 * Liest eine Sterne-Angabe.
 *
 * "⭐⭐" ergibt 2 bis 2, "⭐ bis ⭐⭐⭐" ergibt 1 bis 3, "⭐/⭐⭐" ergibt 1 bis 2.
 * Ohne Sterne (z.B. "variabel") gibt es keine Einstufung.
 */
export function parseStars(value: string | undefined): StarRange | undefined {
  if (!value) return undefined;
  const runs = value.match(/[⭐★✩☆*]+/g);
  if (!runs || runs.length === 0) return undefined;
  const lengths = runs.map((run) => run.length).filter((length) => length >= 1 && length <= 5);
  if (lengths.length === 0) return undefined;
  return { min: Math.min(...lengths), max: Math.max(...lengths) };
}

function parseNumber(value: string | undefined, pattern: RegExp): number | undefined {
  if (!value) return undefined;
  const match = pattern.exec(value);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Zerlegt "Johannes & Hendrik" oder "Malte, Basti und Jan" in einzelne Namen. */
function parseGuides(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:,|&|\+|\/|\bund\b|\bsowie\b)\s*/i)
    .map((name) => name.replace(/[.;:!]+$/, '').trim())
    .filter((name) => name.length > 1 && name.length <= 40);
}

function parseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /https?:\/\/[^\s<>"')]+/i.exec(value);
  return match ? match[0] : undefined;
}

/**
 * Zieht alle bekannten Tourdaten aus dem Beschreibungstext.
 *
 * Erwartet reinen Text — HTML vorher durch `htmlToText` schicken.
 */
export function parseRideDetails(text: string): RideDetails {
  const labels = collectLabels(text);

  // Kilometer und Höhenmeter stehen meist hinter "Ausdauer", gelegentlich aber
  // auch frei im Text. Erst gezielt suchen, dann im ganzen Text.
  const distanceKm =
    parseNumber(labels.endurance, /(\d+(?:[.,]\d+)?)\s*km/i) ??
    parseNumber(text, /(\d+(?:[.,]\d+)?)\s*km\b/i);
  const elevationM =
    parseNumber(labels.endurance, /(\d+(?:[.,]\d+)?)\s*(?:hm|höhenmeter)/i) ??
    parseNumber(text, /(\d+(?:[.,]\d+)?)\s*(?:hm\b|höhenmeter)/i);

  return {
    guides: parseGuides(labels.guides),
    endurance: parseStars(labels.endurance),
    technique: parseStars(labels.technique),
    trailShare: labels.trailShare,
    difficulty: labels.difficulty ?? labels.character,
    meetingPoint: labels.meetingPoint,
    timeAndDuration: labels.timeAndDuration,
    distanceKm,
    elevationM,
    maxParticipants: parseNumber(labels.maxParticipants, /(\d+)/),
    signupUrl: parseUrl(labels.signup),
  };
}
