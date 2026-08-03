/**
 * Zerlegt eine iCalendar-Datei (RFC 5545) in einzelne Eigenschaften.
 *
 * Zwei Eigenheiten des Formats, die hier abgeräumt werden:
 *  1. Lange Zeilen sind umbrochen ("folding") — die Fortsetzung beginnt mit
 *     einem Leerzeichen. Google nutzt das reichlich, mitten in Wörtern.
 *  2. Textwerte sind maskiert: `\,` `\;` `\\` und `\n`.
 */

export interface IcalProperty {
  /** Name in Großbuchstaben, z.B. `DTSTART`. */
  name: string;
  /** Parameter in Großbuchstaben, z.B. `{ TZID: 'Europe/Berlin' }`. */
  params: Record<string, string>;
  /** Rohwert, noch maskiert. */
  value: string;
}

/**
 * Macht das Zeilen-Umbrechen rückgängig.
 *
 * Wichtig: Es wird genau ein führendes Leerzeichen entfernt. Wer stattdessen
 * `trim()` nimmt, verliert echte Leerzeichen und klebt Wörter zusammen —
 * aus "Fahrtechnik" wird dann schnell "Fahrtechn ik".
 */
export function unfoldLines(raw: string): string[] {
  const lines = raw.split(/\r\n|\n|\r/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfolded.length > 0) {
        unfolded[unfolded.length - 1] += line.slice(1);
        continue;
      }
    }
    unfolded.push(line);
  }
  return unfolded.filter((line) => line.length > 0);
}

/** Hebt die Maskierung eines Textwerts auf. */
export function unescapeText(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\' || i === value.length - 1) {
      result += char;
      continue;
    }
    const next = value[++i];
    if (next === 'n' || next === 'N') result += '\n';
    else result += next; // deckt \, \; \\ und alles Unerwartete ab
  }
  return result;
}

/**
 * Zerlegt eine einzelne Zeile in Name, Parameter und Wert.
 *
 * Der Doppelpunkt, der Wert und Name trennt, darf nicht in Anführungszeichen
 * stehen — sonst würde eine URL im Parameter die Zeile zerreißen.
 */
export function parseProperty(line: string): IcalProperty | null {
  let inQuotes = false;
  let colonIndex = -1;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ':' && !inQuotes) {
      colonIndex = i;
      break;
    }
  }
  if (colonIndex === -1) return null;

  const head = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const segments = splitOutsideQuotes(head, ';');
  // `splitOutsideQuotes` hängt das letzte Stück immer an, auch bei leerer
  // Eingabe — `segments` hat also nie Länge 0. `noUncheckedIndexedAccess`
  // kennt diese Garantie nicht, deshalb die explizite Prüfung.
  const firstSegment = segments[0];
  if (firstSegment === undefined) return null;
  const name = firstSegment.toUpperCase();
  if (!name) return null;

  const params: Record<string, string> = {};
  for (const segment of segments.slice(1)) {
    const eq = segment.indexOf('=');
    if (eq === -1) continue;
    const key = segment.slice(0, eq).toUpperCase();
    const raw = segment.slice(eq + 1);
    params[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
  return { name, params, value };
}

function splitOutsideQuotes(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of input) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === separator && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

/** Alle Eigenschaften der Datei, in Dateireihenfolge. */
export function parseProperties(raw: string): IcalProperty[] {
  const properties: IcalProperty[] = [];
  for (const line of unfoldLines(raw)) {
    const property = parseProperty(line);
    if (property) properties.push(property);
  }
  return properties;
}

/**
 * Schneidet die Datei in Blöcke eines Typs, z.B. alle `VEVENT`.
 *
 * Verschachtelte Blöcke (etwa `VALARM` in einem `VEVENT`) bleiben im
 * umschließenden Block enthalten und werden nicht als eigener Block gemeldet.
 */
export function extractComponents(properties: IcalProperty[], componentName: string): IcalProperty[][] {
  const components: IcalProperty[][] = [];
  let current: IcalProperty[] | null = null;
  let depth = 0;

  for (const property of properties) {
    if (property.name === 'BEGIN' && property.value.toUpperCase() === componentName) {
      if (current) depth++;
      else current = [];
      continue;
    }
    if (property.name === 'END' && property.value.toUpperCase() === componentName) {
      if (depth > 0) depth--;
      else if (current) {
        components.push(current);
        current = null;
      }
      continue;
    }
    if (current) current.push(property);
  }
  return components;
}
