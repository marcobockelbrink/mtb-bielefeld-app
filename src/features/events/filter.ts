/**
 * Die Filterlogik der Terminliste.
 *
 * Das ist der eigentliche Mehrwert der App gegenüber dem Kalender-Abo: Statt
 * durch 300 Termine zu scrollen, beantwortet die App die Frage "Was kann ich
 * mit meinem Können in den nächsten Wochen mitfahren?".
 *
 * Bewusst als reine Funktionen ohne Bezug zur Oberfläche — so ist die Logik
 * ohne laufende App prüfbar.
 */

import type { ClubEvent, EventCategory, SkillLevel } from '../../domain/types';

export interface EventFilter {
  categories: EventCategory[];
  levels: SkillLevel[];
  /** Nur Termine, deren Fahrtechnik-Anforderung höchstens so hoch ist. */
  maxTechniqueStars?: number;
  /** Nur Termine, deren Ausdauer-Anforderung höchstens so hoch ist. */
  maxEnduranceStars?: number;
  ladiesOnly: boolean;
  /** Abgesagte Termine ausblenden. */
  hideCancelled: boolean;
  /** Freitextsuche über Titel, Ort und Beschreibung. */
  search: string;
}

export const emptyFilter: EventFilter = {
  categories: [],
  levels: [],
  maxTechniqueStars: undefined,
  maxEnduranceStars: undefined,
  ladiesOnly: false,
  hideCancelled: true,
  search: '',
};

export function isFilterActive(filter: EventFilter): boolean {
  return (
    filter.categories.length > 0 ||
    filter.levels.length > 0 ||
    filter.maxTechniqueStars !== undefined ||
    filter.maxEnduranceStars !== undefined ||
    filter.ladiesOnly ||
    filter.search.trim().length > 0
  );
}

/** Zählt, wie viele Einschränkungen gesetzt sind — für die Anzeige am Filterknopf. */
export function activeFilterCount(filter: EventFilter): number {
  return (
    filter.categories.length +
    filter.levels.length +
    (filter.maxTechniqueStars !== undefined ? 1 : 0) +
    (filter.maxEnduranceStars !== undefined ? 1 : 0) +
    (filter.ladiesOnly ? 1 : 0) +
    (filter.search.trim().length > 0 ? 1 : 0)
  );
}

/**
 * Der gesetzte Filter als einzeln abwerfbare Marken — Befund „D2" aus dem
 * Usability-Review vom 15.08.2026.
 *
 * Das Problem war nicht das Filtern, sondern das Vergessen: Wer die
 * Filterleiste zuklappt, sieht eine kurze Liste und keinen Grund dafür.
 * „Wo ist die Mittwochstour?" ist dann eine berechtigte Frage an eine App,
 * die selbst die Antwort verbirgt.
 *
 * Die Beschriftungen kommen von außen, weil sie in `theme.ts` neben Farben
 * und Symbolen stehen und diese Datei ohne React Native prüfbar bleiben
 * soll — dasselbe Muster wie `dayKeyOf` bei `groupByDay`.
 *
 * `hideCancelled` fehlt hier bewusst: Es ist die Voreinstellung, und eine
 * Marke „Abgesagte versteckt" stünde dauerhaft über der Liste, ohne je
 * etwas zu erklären.
 */
export interface FilterMarke {
  /** Zum Abwerfen — siehe `entferneFilter`. */
  schluessel: string;
  label: string;
}

export interface MarkenTexte {
  kategorie: (kategorie: EventCategory) => string;
  stufe: (stufe: SkillLevel) => string;
}

export function aktiveFilterMarken(filter: EventFilter, texte: MarkenTexte): FilterMarke[] {
  const marken: FilterMarke[] = [];

  const suche = filter.search.trim();
  if (suche) marken.push({ schluessel: 'suche', label: `„${suche}"` });

  for (const kategorie of filter.categories) {
    marken.push({ schluessel: `kategorie:${kategorie}`, label: texte.kategorie(kategorie) });
  }
  for (const stufe of filter.levels) {
    marken.push({ schluessel: `stufe:${stufe}`, label: texte.stufe(stufe) });
  }

  // „höchstens" mitschreiben: Ohne das Wort läse sich „Fahrtechnik 2" wie
  // eine Auswahl genau dieser Stufe, und der Filter tut etwas anderes.
  if (filter.maxTechniqueStars !== undefined) {
    marken.push({
      schluessel: 'fahrtechnik',
      label: `Fahrtechnik höchstens ${filter.maxTechniqueStars}`,
    });
  }
  if (filter.maxEnduranceStars !== undefined) {
    marken.push({
      schluessel: 'ausdauer',
      label: `Ausdauer höchstens ${filter.maxEnduranceStars}`,
    });
  }
  if (filter.ladiesOnly) marken.push({ schluessel: 'ladiesOnly', label: 'Nur Ladies only' });

  return marken;
}

/**
 * Wirft eine einzelne Einschränkung ab und lässt die übrigen stehen.
 *
 * Ein unbekannter Schlüssel gibt den Filter unverändert zurück, statt zu
 * werfen: Er kann nur aus einer Marke stammen, die es nicht mehr gibt, und
 * dafür ist ein Absturz die falsche Antwort.
 */
export function entferneFilter(filter: EventFilter, schluessel: string): EventFilter {
  if (schluessel === 'suche') return { ...filter, search: '' };
  if (schluessel === 'fahrtechnik') return { ...filter, maxTechniqueStars: undefined };
  if (schluessel === 'ausdauer') return { ...filter, maxEnduranceStars: undefined };
  if (schluessel === 'ladiesOnly') return { ...filter, ladiesOnly: false };

  const [art, wert] = schluessel.split(':');
  if (art === 'kategorie') {
    return { ...filter, categories: filter.categories.filter((eintrag) => eintrag !== wert) };
  }
  if (art === 'stufe') {
    return { ...filter, levels: filter.levels.filter((eintrag) => eintrag !== wert) };
  }

  return filter;
}

/**
 * Prüft eine Sterne-Obergrenze.
 *
 * Entscheidend ist der **untere** Wert der Spanne: Eine Tour mit "⭐ bis ⭐⭐⭐"
 * ist für Einsteiger fahrbar, weil sich Gruppen nach Können aufteilen. Würde
 * die App nach dem oberen Wert filtern, verschwänden genau die offenen Angebote
 * — das MittwochsRudel etwa —, die für Einsteiger am wichtigsten sind.
 */
function withinStarLimit(range: { min: number; max: number } | undefined, limit: number): boolean {
  // Termine ohne Angabe werden nicht weggefiltert: keine Angabe heißt nicht
  // "zu schwer", und der Verein trägt sie nicht überall ein.
  if (!range) return true;
  return range.min <= limit;
}

function matchesSearch(event: ClubEvent, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    event.title,
    event.location ?? '',
    event.descriptionText,
    event.details.meetingPoint ?? '',
    event.details.guides.join(' '),
  ]
    .join('\n')
    .toLowerCase();

  // Mehrere Wörter müssen alle vorkommen, Reihenfolge egal.
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}

export function matchesFilter(event: ClubEvent, filter: EventFilter): boolean {
  if (filter.hideCancelled && event.cancelled) return false;
  if (filter.ladiesOnly && !event.ladiesOnly) return false;
  if (filter.categories.length > 0 && !filter.categories.includes(event.category)) return false;

  if (filter.levels.length > 0) {
    // Termine ohne Stufenangabe richten sich an alle und bleiben sichtbar.
    const passt = event.levels.length === 0 || event.levels.some((level) => filter.levels.includes(level));
    if (!passt) return false;
  }

  if (filter.maxTechniqueStars !== undefined && !withinStarLimit(event.details.technique, filter.maxTechniqueStars)) {
    return false;
  }
  if (filter.maxEnduranceStars !== undefined && !withinStarLimit(event.details.endurance, filter.maxEnduranceStars)) {
    return false;
  }

  return matchesSearch(event, filter.search);
}

export function applyFilter(events: ClubEvent[], filter: EventFilter): ClubEvent[] {
  return events.filter((event) => matchesFilter(event, filter));
}

/** Nur Termine, die noch bevorstehen (ein laufender Termin zählt dazu). */
export function upcomingOnly(events: ClubEvent[], now: Date = new Date()): ClubEvent[] {
  return events.filter((event) => event.end.getTime() >= now.getTime());
}

/** Die letzten vergangenen Termine, neueste zuerst. */
export function pastEvents(events: ClubEvent[], now: Date = new Date()): ClubEvent[] {
  return events
    .filter((event) => event.end.getTime() < now.getTime())
    .sort((a, b) => b.start.getTime() - a.start.getTime());
}

export interface EventSection {
  /** Tagesschlüssel `JJJJ-MM-TT` in Vereinszeit. */
  key: string;
  date: Date;
  events: ClubEvent[];
}

/**
 * Gruppiert Termine nach Kalendertag — die Liste bekommt dadurch
 * Datumsüberschriften statt einer endlosen Reihe von Karten.
 */
export function groupByDay(events: ClubEvent[], dayKeyOf: (date: Date) => string): EventSection[] {
  const sections = new Map<string, EventSection>();

  for (const event of events) {
    const key = dayKeyOf(event.start);
    let section = sections.get(key);
    if (!section) {
      section = { key, date: event.start, events: [] };
      sections.set(key, section);
    }
    section.events.push(event);
  }

  return [...sections.values()];
}
