/**
 * Liefert die gebaute Web-Fassung aus und startet die Aufnahme.
 *
 * Ein eigener kleiner Server statt `expo start --web`, damit der Lauf
 * reproduzierbar ist und ohne Entwicklungswerkzeuge im Bild auskommt.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projektWurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wurzel = path.join(projektWurzel, '.vorschau-web');
const port = Number(process.env.VORSCHAU_PORT ?? 8099);

if (!fs.existsSync(wurzel)) {
  console.error(`Kein Web-Build unter ${wurzel}. Erst "npm run vorschau" aufrufen.`);
  process.exit(1);
}

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

const server = http.createServer((anfrage, antwort) => {
  const angefragt = decodeURIComponent((anfrage.url ?? '/').split('?')[0]);
  let datei = path.join(wurzel, angefragt);

  // Verzeichnisse und unbekannte Pfade auf die Startseite lenken — expo-router
  // löst die Adressen selbst auf.
  if (!fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
    datei = path.join(wurzel, 'index.html');
  }
  // Kein Ausbruch aus dem Ausgabeverzeichnis.
  if (!path.resolve(datei).startsWith(path.resolve(wurzel))) {
    antwort.writeHead(403).end('verboten');
    return;
  }

  antwort.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] ?? 'application/octet-stream' });
  fs.createReadStream(datei).pipe(antwort);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Vorschau läuft auf http://127.0.0.1:${port}/`);

  const aufnahme = spawn(process.execPath, [path.join(projektWurzel, 'tools/vorschau-screenshots.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, VORSCHAU_URL: `http://127.0.0.1:${port}/` },
  });

  aufnahme.on('exit', (code) => {
    server.close();
    process.exit(code ?? 0);
  });
});
