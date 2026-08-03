/**
 * Ordnet Termine anhand von Titel und Beschreibung ein.
 *
 * Der Google-Kalender kennt keine Kategorien — die Einordnung muss aus dem Text
 * kommen. Die Stichwörter stammen aus den tatsächlich vorkommenden Titeln des
 * Vereinskalenders, einschließlich der eingebürgerten Schreibvarianten
 * ("MitwochsRudel" mit einem t).
 */

import type { EventCategory, SkillLevel } from '../../domain/types.ts';

/**
 * Reihenfolge zählt: Der erste Treffer gewinnt.
 *
 * Deshalb steht "Bikepark Willingen" (ein Ausflug) vor der allgemeinen
 * Tour-Erkennung, und das Fahrtechniktraining vor "Tour & Training".
 */
const CATEGORY_RULES: { category: EventCategory; pattern: RegExp }[] = [
  { category: 'jugend', pattern: /\bjugend|\bkids?\b|nachwuchs|schüler/i },
  {
    category: 'racing',
    pattern: /\bracing\b|\brennen\b|\brace\b|\bcup\b|meisterschaft|marathon|wettkampf|\bliga\b/i,
  },
  {
    category: 'werkstatt',
    pattern: /werkstatt|schrauber|schraubertreff|schnupperkurs|wartung|reparatur/i,
  },
  {
    category: 'ausflug',
    pattern: /bikepark|trailpark|trailground|flowtrail|willingen|winterberg|brilon|hohes gras|\bausflug/i,
  },
  {
    category: 'fahrtechnik',
    pattern: /fahrtechnik|\btraining\b|kurventechnik|grundlagen|sprungtraining|\bsprünge?\b|bunnyhop|\bkurs\b/i,
  },
  {
    category: 'treff',
    pattern: /mitt?wochsrudel|freitagsflow|sonntagsrunde|bike\s*&?\s*beer|jam session|street session|stammtisch|\btreffen\b/i,
  },
  {
    category: 'verein',
    pattern: /mitgliederversammlung|\bjhv\b|vorstand|weihnachtsfeier|\bfeier\b|\bmesse\b|flohmarkt|outlet|vereinsheim/i,
  },
  {
    category: 'tour',
    pattern: /\btour\b|\btouren\b|ausfahrt|\brunde\b|\benduro\b|\bgravel\b|downcountry|\bxc\b|e-?mtb|e-?bike|trailtour|\bbiken\b|\bride\b/i,
  },
];

/** Grobe Einordnung eines Termins. Titel wiegt schwerer als Beschreibung. */
export function classifyCategory(title: string, description = ''): EventCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(title)) return rule.category;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(description)) return rule.category;
  }
  return 'sonstiges';
}

const LEVEL_RULES: { level: SkillLevel; pattern: RegExp }[] = [
  { level: 'einsteiger', pattern: /einsteiger|einsteigerin|anfänger|neuling|schnupper|genießer|geniesser/i },
  { level: 'aufsteiger', pattern: /aufsteiger|mittelstufe|\bfortgeschritten(?:e|en)?\s*\/\s*einsteiger/i },
  { level: 'fortgeschritten', pattern: /fortgeschritten/i },
  // Wortgrenze am Ende ist entscheidend: ohne sie stuft "Die Route, das Profil
  // und der Schwierigkeitsgrad ergeben sich spontan" das MittwochsRudel als
  // Könner-Termin ein — und schreckt genau die Leute ab, die gemeint sind.
  { level: 'koenner', pattern: /könner|koenner|\bprofis?\b|\bexperten?\b/i },
];

/**
 * Für welche Erfahrungsstufen der Termin ausgeschrieben ist.
 *
 * "Tour für Ein- und Aufsteiger" spricht beide an, deshalb eine Liste. Bleibt
 * sie leer, richtet sich der Termin an alle — die App zeigt dann keinen
 * Stufen-Hinweis, statt eine Stufe zu erfinden.
 */
export function classifyLevels(title: string, description = ''): SkillLevel[] {
  const haystack = `${title}\n${description}`;
  const levels = new Set<SkillLevel>();

  for (const rule of LEVEL_RULES) {
    if (rule.pattern.test(haystack)) levels.add(rule.level);
  }
  // "Ein- und Aufsteiger" schreibt "Einsteiger" verkürzt und würde sonst
  // nur als "Aufsteiger" erkannt.
  if (/\bein-\s*(?:und|&|\/)\s*aufsteiger/i.test(haystack)) {
    levels.add('einsteiger');
    levels.add('aufsteiger');
  }
  return [...levels];
}

/** Termin richtet sich ausdrücklich an Frauen. */
export function isLadiesOnly(title: string, description = ''): boolean {
  return /ladies[\s-]*only|frauen[\s-]*only|nur für frauen/i.test(`${title}\n${description}`);
}

/**
 * Erkennt Absagen.
 *
 * Der Verein markiert sie im Titel — mal als "-ABGESAGT-", mal als Zusatz wie
 * "(fällt witterungsbedingt leider aus!!)". Beides muss die App erkennen, damit
 * niemand umsonst zum Treffpunkt fährt.
 */
export function isCancelled(title: string, icalStatus?: string): boolean {
  if (icalStatus && icalStatus.toUpperCase() === 'CANCELLED') return true;
  return /abgesagt|entfällt|entfaellt|fällt\b[^.]{0,40}\baus\b|findet nicht statt/i.test(title);
}

/**
 * Räumt den Titel für die Anzeige auf: doppelte Leerzeichen, Absage-Markierungen
 * und Zeilenumbrüche fliegen raus. Die Absage selbst zeigt die App als Hinweis
 * an, nicht als Teil des Titels.
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/[-–—]\s*abgesagt\s*[-–—]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
