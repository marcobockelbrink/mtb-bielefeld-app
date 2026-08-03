/**
 * Zentrale Konfiguration aller Datenquellen.
 *
 * Die App liest heute direkt die öffentlichen Feeds des Vereins. Soll später ein
 * eigenes Backend dazwischen, wird hier (und nur hier) die URL getauscht — die
 * Repository-Schicht in `src/data/repository` bleibt unverändert.
 */

export const WEBSITE_BASE_URL = 'https://mtb-bielefeld.de';

/**
 * Läuft die App gerade als Web-Fassung im Entwicklungsmodus?
 *
 * Bewusst ohne `Platform` aus react-native ermittelt: Diese Datei wird auch von
 * den Tests geladen, die ohne React Native laufen. `document` gibt es nur im
 * Browser — unter iOS, Android und in Node ist es nicht vorhanden.
 *
 * Zugriff über `globalThis` statt nackter Bezeichner: Die Datei wird auch von
 * der API unter Node typgeprüft, die weder die `dom`-Lib noch eine
 * `__DEV__`-Deklaration kennt. Über `globalThis` bleibt der Zugriff zur
 * Laufzeit identisch, ist aber in beiden Welten typisierbar.
 */
const imBrowserWaehrendEntwicklung =
  (globalThis as { document?: unknown }).document !== undefined &&
  (globalThis as { __DEV__?: boolean }).__DEV__ === true;

/**
 * Umweg für die Entwicklung im Browser.
 *
 * Weder der Google-Kalender noch mtb-bielefeld.de senden die Kopfzeile
 * `Access-Control-Allow-Origin`, weshalb ein Browser den direkten Zugriff
 * verweigert (CORS). `npm run proxy` startet einen kleinen lokalen Vermittler,
 * der die Feeds mit der fehlenden Kopfzeile weiterreicht.
 *
 * Betrifft ausschließlich die Web-Ansicht während der Entwicklung. Auf iOS und
 * Android gibt es keine CORS-Prüfung — dort wird immer direkt geladen, und in
 * der veröffentlichten App ebenfalls.
 */
const DEV_PROXY_BASE = 'http://127.0.0.1:8090';

/** Öffentlicher Google-Kalender "MTBie Angebote" (Events, Biken, Schrauben, Treffen). */
export const CALENDAR_ICS_URL = imBrowserWaehrendEntwicklung
  ? `${DEV_PROXY_BASE}/kalender`
  : 'https://calendar.google.com/calendar/ical/' +
    'janqj64k0lb8itmh49d9croubk%40group.calendar.google.com/public/basic.ics';

/** Derselbe Kalender zum Abonnieren in der Kalender-App des Handys. */
export const CALENDAR_SUBSCRIBE_URL =
  'https://calendar.google.com/calendar/embed?src=' +
  'janqj64k0lb8itmh49d9croubk%40group.calendar.google.com&ctz=Europe%2FBerlin';

/** RSS-Feed der Website ("Letzte Änderungen"). */
export const NEWS_RSS_URL = imBrowserWaehrendEntwicklung
  ? `${DEV_PROXY_BASE}/news`
  : `${WEBSITE_BASE_URL}/feed/page:feed.xml`;

/**
 * Adresse einer Seite der Vereinswebsite.
 *
 * Im Browser während der Entwicklung führt der Weg über den lokalen Vermittler,
 * sonst direkt. Für die Beitragsübersicht (`/page:2`) und einzelne Beiträge
 * (`/pilgerreise-nach-farchant…`) gilt dasselbe wie für die Feeds.
 */
export function websiteUrl(pfad: string): string {
  const sauber = pfad.startsWith('/') ? pfad : `/${pfad}`;
  return imBrowserWaehrendEntwicklung
    ? `${DEV_PROXY_BASE}/web?pfad=${encodeURIComponent(sauber)}`
    : `${WEBSITE_BASE_URL}${sauber}`;
}

/**
 * Adresse der Beitragsübersicht.
 *
 * Seite 1 ist die Startseite; ab Seite 2 hängt die Website `page:N` an.
 */
export function newsPageUrl(seite: number): string {
  return websiteUrl(seite <= 1 ? '/' : `/page:${seite}`);
}

/**
 * Wie viele Übersichtsseiten beim ersten Laden geholt werden.
 *
 * Die Website zeigt fünf Beiträge je Seite. Vier Seiten sind ein guter
 * Kompromiss: genug zum Blättern, ohne beim Start zwanzig Abrufe auszulösen.
 */
export const NEWS_INITIAL_PAGES = 4;

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
