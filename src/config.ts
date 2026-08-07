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

/**
 * Auf welchen Server die App zeigt — als eigene Funktion, damit sich die
 * Rechnung ohne Gerät prüfen lässt. Das Ergebnis steht darunter in
 * `API_BASE_URL`, wo auch die längere Begründung steht.
 *
 * Drei Angaben, und die Reihenfolge ist tragend:
 *
 * 1. **`EXPO_PUBLIC_API_URL` schlägt alles.** Der Weg fürs echte Telefon im
 *    WLAN, wo `localhost` das Telefon selbst wäre.
 * 2. **Ein Entwicklungsbau bleibt örtlich.** Wer über Metro entwickelt,
 *    meint den Aufbau vor sich — auch wenn er zufällig einen prod-Bau
 *    gestartet hat. Andersherum schriebe ein Tippfehler beim Ausprobieren
 *    in die echten Mitgliederdaten.
 * 3. **Sonst entscheidet die Umgebung**, und nur das genaue Wort `'prod'`
 *    führt zum Vereinsserver. Dieselbe Vorsicht wie in `app.config.js`:
 *    Die riskante Richtung braucht die ausdrückliche Angabe.
 */
export function waehleApiAdresse({
  ueberschrieben,
  umgebung,
  imEntwicklungsbau,
}: {
  ueberschrieben: string | undefined;
  umgebung: string | undefined;
  imEntwicklungsbau: boolean;
}): string {
  if (ueberschrieben) return ueberschrieben;
  if (imEntwicklungsbau) return 'http://localhost';
  return umgebung === 'prod' ? 'https://api.mtb-bielefeld.de' : 'https://api-dev.bockelbrink.net';
}

/**
 * Die Adresse der Vereins-API.
 *
 * Nur für Anmeldung und Tourenanmeldung. Termine und Beiträge holt die App
 * weiterhin direkt von Google und der Website — die API ist ein Zusatz, kein
 * Umweg. Fällt sie aus, bleibt die App vollständig benutzbar.
 *
 * **Drei Ziele statt zweier** (seit dem 07.08.2026): örtlich beim
 * Entwickeln, der Prüfserver `api-dev.bockelbrink.net` in der dev-Fassung,
 * der Vereinsserver in der prod-Fassung. Solange beide dieselbe Datenbank
 * benutzten, war jeder Versuch ein Eingriff in Vereinsdaten — und ab dem
 * Tag, an dem echte Mitglieder darin stehen, wäre das nicht mehr
 * einzufangen.
 *
 * In der Entwicklung zeigt sie auf `http://localhost`, **nicht** auf
 * `:3000`: Der Betriebsaufbau (`betrieb/docker-compose.yml`, siehe
 * `betrieb/LIESMICH.md`) stellt die API über Caddy auf Port 80 bereit — die
 * API selbst hat keine eigene Portfreigabe, `:3000` liefe ins Leere. Ein
 * bloßes `cd api && npm start` genügt zudem nicht: Ohne `SMTP_HOST` wirft
 * der Mailer absichtlich, ein Magic Link käme nie an. Der Docker-Aufbau ist
 * die einzige Umgebung, in der der Anmeldeablauf vollständig durchläuft.
 *
 * `EXPO_PUBLIC_API_URL` überschreibt sie, ohne dass jemand Code anfassen
 * muss — auf einem echten Telefon trägt sie die WLAN-Adresse des
 * Entwicklungsrechners, denn dort ist `localhost` das Telefon selbst.
 *
 * Zugriff auf `__DEV__` über `globalThis`, aus demselben Grund wie bei
 * `imBrowserWaehrendEntwicklung` oben: Die Datei bleibt auch unter Node
 * typisierbar, wo es weder die `dom`-Lib noch eine `__DEV__`-Deklaration
 * gibt.
 */
export const API_BASE_URL = waehleApiAdresse({
  ueberschrieben: process.env.EXPO_PUBLIC_API_URL,
  // Dieselbe Variable, die `app.config.js` liest. Das Präfix
  // `EXPO_PUBLIC_` ist keine Zier: Nur damit ersetzt Expo den Wert beim
  // Bündeln — ohne stünde hier zur Laufzeit `undefined`, und die App fiele
  // stumm auf dev zurück, während die Bündelkennung „prod" sagt.
  umgebung: process.env.EXPO_PUBLIC_APP_UMGEBUNG,
  imEntwicklungsbau: (globalThis as { __DEV__?: boolean }).__DEV__ === true,
});

/**
 * Basis-Adresse für den Teilen-Link eines Jugendtrainings (`/t/:id`).
 *
 * Bewusst dieselbe Adresse wie `API_BASE_URL` und keine eigene: `/t/:id` ist
 * ein Pfad der Vereins-API (`api/src/app.ts`), kein eigener Dienst. Eine
 * zweite Konstante wäre eine zweite Stelle, die bei einem Domainwechsel
 * vergessen werden könnte — und genau die feststehende Vereinsdomain steht
 * noch aus (siehe `betrieb/SERVER.md`).
 *
 * **Diese Datei allein genügt nicht.** Damit ein geteilter Link die App
 * öffnet statt den Browser, muss dieselbe Domain zusätzlich in `app.config.js`
 * unter `associatedDomains` (iOS) und `intentFilters` (Android) stehen. Die
 * liest das Betriebssystem aus dem fertigen Bündel, nicht diese Datei — sie
 * lassen sich von hier aus weder ableiten noch nachziehen, und ein
 * Auseinanderlaufen fällt in keiner Prüfung auf, sondern erst auf einem
 * Gerät, wenn statt der App Safari aufgeht.
 *
 * `app.config.js` meldet deshalb je Umgebung **genau die eine** Domain an,
 * auf die diese Konstante dort zeigt — beide zusammen wären ein Bau, der
 * einen Link für den jeweils anderen Server abfängt.
 */
export const TEILEN_BASIS_URL = API_BASE_URL;
