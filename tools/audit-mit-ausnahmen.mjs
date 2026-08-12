/**
 * `npm audit --audit-level=high`, aber mit benannten Ausnahmen.
 *
 * Warum es das braucht: Es gibt Advisories **ohne geflickte Fassung** —
 * `image-size` etwa nennt als betroffenen Bereich `*`, und npms
 * Fix-Vorschlag wäre ein Rückbau auf React Native 0.72. Ein Wächter, der
 * daran dauerhaft rot steht, wird nach der dritten Woche abgeschaltet, und
 * dann ist gar nichts gewonnen.
 *
 * Jede Ausnahme steht hier mit Begründung und **Ablaufdatum**. Läuft es ab,
 * wird die Prüfung wieder rot — Vergessen ist also keine Option, nur
 * bewusstes Verlängern nach erneutem Hinsehen.
 */

import { execSync } from 'node:child_process';

const AUSNAHMEN = [
  {
    id: 'GHSA-w3rx-r6r6-pgpr', // image-size: ICNS-Endlosschleife
    bis: '2026-11-01',
    warum:
      'Nur im Build-Werkzeug (metro liest Bildmaße unserer eigenen Assets), ' +
      'nie auf Server oder Gerät. Keine geflickte Fassung verfügbar (Bereich *).',
  },
  {
    id: 'GHSA-5p2g-fcmc-qvqq', // image-size: JXL/HEIF-Endlosschleifen
    bis: '2026-11-01',
    warum: 'Wie oben — dieselbe Bibliothek, derselbe Bereich.',
  },
];

let bericht;
try {
  bericht = JSON.parse(execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (fehler) {
  // npm audit endet bei Funden mit Exit-Code 1 und dem Bericht auf stdout.
  bericht = JSON.parse(fehler.stdout);
}

const heute = new Date().toISOString().slice(0, 10);
const abgelaufen = AUSNAHMEN.filter((a) => a.bis <= heute);
if (abgelaufen.length > 0) {
  console.error('Ausnahmen abgelaufen — neu ansehen und begründet verlängern oder beheben:');
  for (const a of abgelaufen) console.error(`  ${a.id} (bis ${a.bis}): ${a.warum}`);
  process.exit(1);
}

const erlaubt = new Set(AUSNAHMEN.map((a) => a.id));
const funde = [];

for (const [name, angabe] of Object.entries(bericht.vulnerabilities ?? {})) {
  if (!['high', 'critical'].includes(angabe.severity)) continue;
  // `via` mischt eigene Advisories (Objekte) und bloße Weiterreichungen
  // (Zeichenketten — "hängt an verwundbarem X"). Zählen müssen nur die
  // eigenen: Die Weiterreichungen verschwinden mit der Wurzel von selbst.
  const eigene = angabe.via.filter((v) => typeof v === 'object');
  const offen = eigene.filter((v) => !erlaubt.has(v.url?.split('/').pop() ?? ''));
  if (offen.length > 0) funde.push({ name, advisories: offen.map((v) => v.url) });
}

if (funde.length > 0) {
  console.error('Schwerwiegende Schwachstellen ohne Ausnahme:');
  for (const f of funde) console.error(`  ${f.name}: ${f.advisories.join(', ')}`);
  process.exit(1);
}

console.log(`In Ordnung: keine schwerwiegenden Funde außerhalb der ${AUSNAHMEN.length} benannten Ausnahmen (nächste Wiedervorlage ${AUSNAHMEN.map((a) => a.bis).sort()[0]}).`);
