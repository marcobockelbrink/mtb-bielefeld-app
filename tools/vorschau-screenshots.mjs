/**
 * Erzeugt die Screenshots für die README aus der Web-Fassung der App.
 *
 * ## Wozu das gut ist
 *
 * Die Bilder sind ein Nebenprodukt. Der eigentliche Zweck ist ein
 * **Rendering-Test ohne Gerät**: `expo export` beweist nur, dass sich die App
 * bündeln lässt — nicht, dass sie tatsächlich etwas Sinnvolles anzeigt. Genau
 * dazwischen liegen Fehler, die sonst niemand bemerkt. Der erste Lauf dieses
 * Skripts hat aufgedeckt, dass die Terminkarten ihre Gestaltung verloren, weil
 * `Link asChild` den Stil des äußeren Elements ersetzt.
 *
 * ## Zu den Bildern in den Aufnahmen
 *
 * Bilder in den Beiträgen unterliegen **keiner** CORS-Sperre — sie laden im
 * Browser ganz normal. Bleiben die Bildflächen in den Aufnahmen trotzdem leer,
 * hat der Browser auf dem ausführenden Rechner keinen direkten Netzzugang
 * (etwa in einer abgeschotteten Umgebung). Auf einem normalen Arbeitsrechner
 * sind die Bilder da.
 *
 * ## Was es nicht ist
 *
 * Kein Ersatz für einen Test auf einem echten Gerät. Die Web-Fassung nutzt
 * react-native-web; Schriften, Schatten und die Reiterleiste sehen dort ähnlich,
 * aber nicht identisch aus. Erinnerungen und Hintergrund-Aktualisierung gibt es
 * im Browser gar nicht.
 *
 * ## Aufruf
 *
 *     npm run vorschau
 *
 * Einmalig nötig: `npx playwright install chromium`.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projektWurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ausgabe = path.join(projektWurzel, 'docs/screenshots');
const adresse = process.env.VORSCHAU_URL ?? 'http://127.0.0.1:8099/';

fs.mkdirSync(ausgabe, { recursive: true });

/**
 * Vereinsdaten vorab in den Zwischenspeicher legen.
 *
 * Nötig, weil der Browser die Feeds nicht selbst abrufen darf: Weder der
 * Google-Kalender noch die Vereinswebsite erlauben Zugriffe von fremden
 * Herkünften (CORS). Auf iOS und Android stellt sich die Frage nicht — dort
 * gibt es diese Beschränkung nicht.
 *
 * Geholt wird hier, in Node, wo keine solche Beschränkung gilt. Damit zeigen
 * die Aufnahmen die tatsächlich anstehenden Termine.
 */
async function hole(adresse, ersatzdatei, was) {
  try {
    const antwort = await fetch(adresse, { signal: AbortSignal.timeout(20000) });
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
    console.log(`${was}: aus dem Netz geladen`);
    return await antwort.text();
  } catch (fehler) {
    // Ohne Netz taugen die Testdaten als Notbehelf. Die Terminliste ist dann
    // allerdings leer, weil die Testdaten nur vergangene Termine enthalten.
    console.warn(`${was}: Abruf fehlgeschlagen (${fehler}), nutze Testdaten`);
    return fs.readFileSync(path.join(projektWurzel, ersatzdatei), 'utf8');
  }
}

const { CALENDAR_ICS_URL, NEWS_RSS_URL } = await import(
  path.join(projektWurzel, 'tools/quellen.mjs')
);

const kalender = await hole(CALENDAR_ICS_URL, 'tests/fixtures/kalender-auszug.ics', 'Kalender');
const news = await hole(NEWS_RSS_URL, 'tests/fixtures/news-feed.xml', 'Aktuelles (Feed)');

// Die Beitragsübersicht holt die App im Browser über den Vermittler; für die
// Aufnahme reicht es, die erste Seite vorzulegen.
const beitraege = await hole(`${'https://mtb-bielefeld.de'}/`, 'tests/fixtures/beitragsliste.html', 'Beiträge');

// Normalerweise findet Playwright seinen eigenen Chromium. In Umgebungen mit
// vorinstalliertem Browser (etwa CI-Abbildern) lässt sich der Pfad über
// CHROMIUM_PFAD vorgeben, statt einen zweiten Browser herunterzuladen.
const browser = await chromium.launch(
  process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {},
);
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 2,
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  colorScheme: 'light',
});

const fehler = [];
context.on('weberror', (e) => fehler.push(String(e.error().message)));

await context.addInitScript(
  ([ics, rss, jetzt, html]) => {
    // AsyncStorage nutzt im Browser localStorage mit demselben Schlüssel.
    localStorage.setItem('mtbie.cache.kalender', JSON.stringify({ raw: ics, fetchedAt: jetzt }));
    localStorage.setItem('mtbie.cache.news', JSON.stringify({ raw: rss, fetchedAt: jetzt }));
    localStorage.setItem('mtbie.cache.beitraege-1', JSON.stringify({ raw: html, fetchedAt: jetzt }));
    localStorage.setItem(
      'mtbie.notifications',
      JSON.stringify({ enabled: true, leadMinutes: 120, categories: [], notifyOnCancellation: true }),
    );
  },
  [kalender, news, Date.now(), beitraege],
);

const page = await context.newPage();
page.on('pageerror', (e) => fehler.push(String(e.message)));

await page.goto(adresse, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(4000);

await page.screenshot({ path: path.join(ausgabe, 'termine.png') });
console.log('aufgenommen: termine.png');

for (const [reiter, datei] of [
  ['Aktuelles', 'aktuelles.png'],
  ['Verein', 'verein.png'],
  ['Einstellungen', 'einstellungen.png'],
]) {
  await page.getByText(reiter, { exact: true }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(ausgabe, datei) });
  console.log('aufgenommen:', datei);
}

await browser.close();

// Ein Fehler auf der Seite bedeutet, dass die App etwas nicht darstellen konnte —
// die Aufnahmen wären dann irreführend.
const echte = [...new Set(fehler)].filter((meldung) => !meldung.includes('localStorage'));
if (echte.length > 0) {
  console.error('\nFehler beim Rendern:\n' + echte.join('\n'));
  process.exit(1);
}
console.log('\nKeine Fehler beim Rendern.');
