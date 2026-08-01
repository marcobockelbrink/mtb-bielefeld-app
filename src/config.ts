/**
 * Zentrale Konfiguration aller Datenquellen.
 *
 * Die App liest heute direkt die öffentlichen Feeds des Vereins. Soll später ein
 * eigenes Backend dazwischen, wird hier (und nur hier) die URL getauscht — die
 * Repository-Schicht in `src/data/repository` bleibt unverändert.
 */

export const WEBSITE_BASE_URL = 'https://mtb-bielefeld.de';

/** Öffentlicher Google-Kalender "MTBie Angebote" (Events, Biken, Schrauben, Treffen). */
export const CALENDAR_ICS_URL =
  'https://calendar.google.com/calendar/ical/' +
  'janqj64k0lb8itmh49d9croubk%40group.calendar.google.com/public/basic.ics';

/** Derselbe Kalender zum Abonnieren in der Kalender-App des Handys. */
export const CALENDAR_SUBSCRIBE_URL =
  'https://calendar.google.com/calendar/embed?src=' +
  'janqj64k0lb8itmh49d9croubk%40group.calendar.google.com&ctz=Europe%2FBerlin';

/** RSS-Feed der Website ("Letzte Änderungen"). */
export const NEWS_RSS_URL = `${WEBSITE_BASE_URL}/feed/page:feed.xml`;

/** Zeitzone, in der der Verein plant. Termine ohne Zeitzonenangabe gelten als diese. */
export const CLUB_TIMEZONE = 'Europe/Berlin';

export const CONTACT = {
  website: WEBSITE_BASE_URL,
  contactPage: `${WEBSITE_BASE_URL}/kontakt`,
  offersEmail: 'angebote@mtb-bielefeld.de',
  instagram: 'https://www.instagram.com/mtbbielefeld',
  imprint: `${WEBSITE_BASE_URL}/impressum`,
  privacy: `${WEBSITE_BASE_URL}/datenschutz`,
} as const;

/**
 * Wie weit zurück und wie weit voraus Serientermine ausgerechnet werden.
 * Rückblick, damit "letzte Woche verpasst" noch sichtbar ist; Vorausschau
 * begrenzt, damit endlose Serien (z.B. MittwochsRudel ohne Enddatum) die
 * Berechnung nicht sprengen.
 */
export const EXPANSION_WINDOW_DAYS_PAST = 60;
export const EXPANSION_WINDOW_DAYS_FUTURE = 365;

/** Wie lange zwischengespeicherte Daten als "frisch" gelten (Millisekunden). */
export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 Minuten
