/**
 * Kleiner Vermittler für die Entwicklung im Browser.
 *
 * ## Warum das nötig ist
 *
 * Weder der Google-Kalender noch mtb-bielefeld.de senden die Kopfzeile
 * `Access-Control-Allow-Origin`. Ein Browser verweigert deshalb den Zugriff von
 * einer fremden Herkunft (CORS) — wer die App unter `localhost:8081` im Browser
 * öffnet, sieht eine leere Terminliste.
 *
 * **Auf iOS und Android stellt sich die Frage nicht.** Dort gibt es keine
 * CORS-Prüfung; die App lädt den Kalender direkt. Dieser Vermittler ist reines
 * Entwicklungswerkzeug und niemals Teil der veröffentlichten App.
 *
 * ## Aufruf
 *
 *     npm run proxy      # in einem zweiten Terminal, parallel zu `npm start`
 *
 * Die App erkennt selbst, dass sie im Browser läuft, und fragt dann hier an
 * (siehe `src/config.ts`).
 */

import http from 'node:http';

import { CALENDAR_ICS_URL, NEWS_RSS_URL } from './quellen.mjs';

const port = Number(process.env.PROXY_PORT ?? 8090);

/** Nur diese beiden Ziele — der Vermittler ist kein offener Weiterleiter. */
const ZIELE = {
  '/kalender': CALENDAR_ICS_URL,
  '/news': NEWS_RSS_URL,
};

/** Nur Seiten dieser Website werden weitergereicht. */
const ERLAUBTE_HERKUNFT = 'https://mtb-bielefeld.de';

/**
 * Bestimmt das Ziel einer Anfrage.
 *
 * Neben den beiden festen Feeds gibt es `/web?pfad=…` für Seiten der
 * Vereinswebsite — die Beitragsübersicht und einzelne Beiträge haben keine
 * feste Adresse. Der Pfad wird an die Vereinsdomain gehängt und kann sie nicht
 * verlassen; ein offener Weiterleiter entsteht dadurch nicht.
 */
function zielBestimmen(url) {
  const [pfad, abfrage] = (url ?? '/').split('?');
  if (ZIELE[pfad]) return ZIELE[pfad];
  if (pfad !== '/web') return null;

  const gewuenscht = new URLSearchParams(abfrage ?? '').get('pfad') ?? '/';
  const ziel = new URL(gewuenscht, ERLAUBTE_HERKUNFT);
  return ziel.origin === ERLAUBTE_HERKUNFT ? ziel.toString() : null;
}

const server = http.createServer(async (anfrage, antwort) => {
  // Fürs Protokoll von Zeilenumbrüchen befreit: Eine Anfrage könnte sonst
  // erfundene Protokollzeilen anhängen (CodeQL js/log-injection). Nur ein
  // Entwicklungswerkzeug, aber der Fix kostet eine Zeile.
  const pfad = (anfrage.url ?? '/').split('?')[0].replace(/[\r\n]/g, '');
  const ziel = zielBestimmen(anfrage.url);

  const corsKopf = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
  };

  if (anfrage.method === 'OPTIONS') {
    antwort.writeHead(204, corsKopf).end();
    return;
  }

  if (!ziel) {
    antwort
      .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...corsKopf })
      .end(`Unbekannt. Verfügbar: ${Object.keys(ZIELE).join(', ')}`);
    return;
  }

  try {
    const ergebnis = await fetch(ziel, { signal: AbortSignal.timeout(20000) });
    const inhalt = await ergebnis.text();
    console.log(`${pfad} -> ${ergebnis.status}, ${inhalt.length} Zeichen`);
    antwort
      .writeHead(ergebnis.status, {
        'Content-Type': ergebnis.headers.get('content-type') ?? 'text/plain; charset=utf-8',
        ...corsKopf,
      })
      .end(inhalt);
  } catch (fehler) {
    console.error(`${pfad} -> Fehler: ${fehler}`);
    antwort
      .writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', ...corsKopf })
      .end(String(fehler));
  }
});

// Nur lokal erreichbar — der Vermittler gehört nicht ins Netzwerk.
server.listen(port, '127.0.0.1', () => {
  console.log(`Entwicklungs-Vermittler läuft auf http://127.0.0.1:${port}`);
  console.log(`  ${Object.keys(ZIELE).join('  ')}`);
  console.log('\nDie Web-Fassung der App nutzt ihn automatisch. Beenden mit Strg+C.');
});
