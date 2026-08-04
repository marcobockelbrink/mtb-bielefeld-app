/**
 * Rauchprobe: die echten Module der App gegen die echte API.
 *
 *     docker compose -f betrieb/docker-compose.yml up -d
 *     npm run rauchprobe
 *
 * **Warum das neben `npm test` steht und nicht darin.** Die Testsuite läuft
 * in einer Sekunde, ohne Netz und ohne Server — das soll so bleiben, sonst
 * hört jemand auf, sie zu benutzen. Sie stellt deshalb `fetch` selbst, und
 * genau darin liegt ihre Grenze: Eine Attrappe antwortet immer so, wie der
 * Schreibende es erwartet hat. Beim API-Zugang hat das eine ganze
 * Funktionsgruppe verdeckt — jede Anfrage trug `content-type:
 * application/json`, auch ohne Körper, und Fastify weist so etwas mit 400
 * ab, noch bevor das Token geprüft wird. Siebzehn grüne Tests, und die
 * Tourenanmeldung hätte auf keinem Gerät je funktioniert.
 *
 * Diese Datei schließt genau diese Lücke: dieselben Module, die auf dem
 * Telefon laufen, gegen einen echten Server, ein echtes Postfach und den
 * echten Vereinskalender. Was hier grün ist, ist nicht nur in sich stimmig,
 * sondern stimmt mit der Gegenseite überein.
 *
 * **Wo die Grenze dieser Probe liegt.** Geprüft wird alles, was ohne React
 * Native läuft — `src/data/api.ts` und `src/konto/magicLink.ts`. Der
 * Kontext (`KontoContext.tsx`), die Bildschirme und das Antippen eines
 * echten Mail-Links brauchen ein Gerät oder den Simulator; dafür ist diese
 * Probe nicht gedacht und täuscht es auch nicht vor.
 *
 * **Die Ratenbegrenzung ist scharf.** Ein Durchlauf verbraucht etwa fünf der
 * zehn Anfragen je Minute auf den Anmeldewegen. Zwei Läufe unmittelbar
 * hintereinander laufen deshalb in ein 429 — das ist die Bremse von vorhin,
 * kein kaputter Ablauf. Eine Minute warten.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ApiFehler, ApiZugang } from '../src/data/api.ts';
import { extrahiereMagicToken } from '../src/konto/magicLink.ts';
import type { TokenSpeicher } from '../src/data/tokenSpeicher.ts';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '-f', path.join(WURZEL, 'betrieb/docker-compose.yml')];
const BASIS = process.env.RAUCHPROBE_BASIS ?? 'http://localhost';
const MAILPIT = process.env.RAUCHPROBE_MAILPIT ?? 'http://localhost:8025';

let gescheitert = 0;

/** Eine Erwartung. Scheitert sie, läuft die Probe weiter — ein einzelner
 *  Fehlschlag soll den Rest nicht verdecken —, aber der Rückgabewert am
 *  Ende ist ungleich Null. */
function pruefe(was: string, bedingung: boolean, gesehen?: unknown): void {
  if (bedingung) {
    console.log(`  ok   ${was}`);
    return;
  }
  gescheitert += 1;
  console.log(`  FEHL ${was}${gesehen === undefined ? '' : ` — gesehen: ${JSON.stringify(gesehen)}`}`);
}

let laufenderAbschnitt = '';
function abschnitt(titel: string): void {
  laufenderAbschnitt = titel;
  console.log(`\n=== ${titel} ===`);
}

/**
 * Eine unerwartete Ausnahme soll nicht als roher Stapelabzug enden.
 *
 * Wirft ein Aufruf, den die Probe für unauffällig hielt, ist das der
 * interessanteste Fall überhaupt — dann stimmt eine Annahme über die
 * Gegenseite nicht mehr. Wer das sieht, soll sofort wissen, an welcher
 * Stelle, statt einen Stapelabzug lesen zu müssen.
 */
process.on('uncaughtException', melde);
process.on('unhandledRejection', melde);
function melde(fehler: unknown): never {
  console.error(`\nFEHLGESCHLAGEN in „${laufenderAbschnitt}“:`);
  console.error(`  ${fehler instanceof Error ? fehler.message : String(fehler)}`);
  if (fehler instanceof ApiFehler) {
    console.error(`  (ApiFehler, Status ${fehler.status})`);
  }
  console.error('\nDas ist eine Annahme über die API, die nicht mehr stimmt — genau der');
  console.error('Fall, für den diese Probe da ist. Läuft der Aufbau schon länger als');
  console.error('eine Minute? Sonst kann es auch die Ratenbegrenzung sein (429).');
  process.exit(1);
}

function imContainer(befehl: string[], eingabe?: string): string {
  return execFileSync('docker', [...COMPOSE, 'exec', '-T', 'api', ...befehl], {
    encoding: 'utf8',
    input: eingabe,
  });
}

// --- Vorprüfung ------------------------------------------------------------
abschnitt('Vorprüfung: Läuft der Aufbau?');
try {
  const antwort = await fetch(`${BASIS}/gesundheit`);
  pruefe(`${BASIS}/gesundheit antwortet mit 200`, antwort.status === 200, antwort.status);
} catch {
  console.error(`\nFEHLGESCHLAGEN: keine Verbindung zu ${BASIS}.`);
  console.error('Läuft der Aufbau? docker compose -f betrieb/docker-compose.yml up -d');
  console.error('Der Aufbau ist in betrieb/LIESMICH.md beschrieben.');
  process.exit(1);
}

// --- Ein frisches Konto ----------------------------------------------------
abschnitt('Anmeldung: Einladungscode, Mail, Magic Link');

const email = `rauchprobe-${Date.now()}@example.org`;
const codeAusgabe = imContainer(['npm', 'run', 'einladung:erzeugen', '--', email]);
const codeZeile = codeAusgabe.split('\n').find((zeile) => zeile.startsWith(`${email}: `));
if (!codeZeile) {
  console.error('FEHLGESCHLAGEN: Das CLI-Werkzeug hat keinen Einladungscode ausgegeben.');
  console.error(codeAusgabe);
  process.exit(1);
}
const einladungscode = codeZeile.slice(email.length + 2).trim();
pruefe('Einladungscode erzeugt', einladungscode.length > 20);

// Der Speicher im Arbeitsspeicher statt des Schlüsselbunds: `expo-secure-store`
// braucht ein Gerät. Geprüft wird hier, dass `ApiZugang` das Token an der
// richtigen Stelle ablegt und wieder findet — nicht der Schlüsselbund selbst.
let abgelegt: string | null = null;
const speicher: TokenSpeicher = {
  lies: async () => abgelegt,
  schreib: async (token) => {
    abgelegt = token;
  },
  loesche: async () => {
    abgelegt = null;
  },
};
const api = new ApiZugang({ basisUrl: BASIS, speicher });

await api.fordereAnmeldungAn(email, einladungscode);
pruefe('fordereAnmeldungAn kam durch', true);

// Der Versand läuft im Hintergrund — kurz nachfragen, statt blind zu warten.
let nachrichtId: string | null = null;
for (let versuch = 0; versuch < 10; versuch += 1) {
  const suche = await fetch(`${MAILPIT}/api/v1/search?query=to%3A${email}`).then((r) => r.json());
  if (suche.messages?.length) {
    nachrichtId = suche.messages[0].ID;
    break;
  }
  await new Promise((weiter) => setTimeout(weiter, 1000));
}
if (!nachrichtId) {
  console.error(`FEHLGESCHLAGEN: Nach zehn Sekunden keine Mail an ${email} in Mailpit.`);
  process.exit(1);
}
const mail = await fetch(`${MAILPIT}/api/v1/message/${nachrichtId}`).then((r) => r.json());
pruefe('Mail ist da', true);
pruefe('Umlaute kommen richtig an', mail.Text.includes('Grüße'));

// Der eigentliche Wert dieser Zeile: Hier trifft der Parser der App auf den
// Text, den die API wirklich verschickt. Ein Test mit einer erfundenen
// Beispieladresse kann nur beweisen, dass der Parser zu sich selbst passt.
const token = extrahiereMagicToken(mail.Text);
pruefe('extrahiereMagicToken findet den Token im echten Mailtext', token !== null);
if (!token) {
  console.error('Mailtext war:', mail.Text);
  process.exit(1);
}

await api.loeseEin(token);
pruefe('loeseEin nimmt den Token an', true);
pruefe('istAngemeldet meldet true', await api.istAngemeldet());
pruefe('Erneuerungs-Token liegt im Speicher', abgelegt !== null);
pruefe('Es ist nicht der Magic Link selbst', abgelegt !== token);

// --- Das Konto -------------------------------------------------------------
abschnitt('Konto: hole() mit Zugangs-Token');
const konto = await api.hole<{ email: string }>('/konto');
pruefe('GET /konto nennt die richtige Adresse', konto.email.toLowerCase() === email.toLowerCase(), konto.email);

// --- Tourenanmeldung -------------------------------------------------------
abschnitt('Tourenanmeldung: POST und DELETE ohne Anfragekörper');

// Den Schlüssel aus dem echten Kalender holen, statt einen zu erfinden —
// dieselbe Rechnung, die auch `GET /termine/:schluessel` erwartet.
const holeSchluessel = `
import { erzeugeStandardTerminDienst, terminSchluessel } from './src/termine.ts';
const dienst = erzeugeStandardTerminDienst({ error: console.error, info: console.info });
const termine = await dienst.holeTermine();
const jetzt = Date.now();
const naechster = termine.find((t) => !t.cancelled && t.start.getTime() > jetzt);
if (!naechster) throw new Error('kein anstehender Termin im Kalender');
console.log('SCHLUESSEL=' + terminSchluessel(naechster));
`;
const kalenderAusgabe = imContainer(
  ['node', '--experimental-strip-types', '--input-type=module', '-'],
  holeSchluessel,
);
const schluessel = kalenderAusgabe
  .split('\n')
  .find((zeile) => zeile.startsWith('SCHLUESSEL='))
  ?.slice('SCHLUESSEL='.length)
  .trim();
if (!schluessel) {
  console.error('FEHLGESCHLAGEN: Kein Terminschlüssel aus dem echten Kalender.');
  console.error('Kommt die API im Container ans Netz? Ausgabe:', kalenderAusgabe);
  process.exit(1);
}
const pfad = `/termine/${encodeURIComponent(schluessel)}`;

const vorher = await api.hole<{ belegt: number }>(pfad);
// Ohne Anfragekörper — genau der Fall, den `#ruf` falsch behandelte, bis die
// Kopfzeile `content-type` an einen vorhandenen Körper gebunden wurde.
const nachAnmeldung = await api.sende<{ belegt: number }>(pfad, 'POST');
pruefe(
  'POST ohne Körper meldet an und zählt eins hoch',
  nachAnmeldung.belegt === vorher.belegt + 1,
  { vorher: vorher.belegt, nachher: nachAnmeldung.belegt },
);

await api.sende(`${pfad}/ich`, 'DELETE');
const nachher = await api.hole<{ belegt: number }>(pfad);
pruefe('DELETE ohne Körper meldet ab', nachher.belegt === vorher.belegt, {
  vorher: vorher.belegt,
  nachher: nachher.belegt,
});

// --- Der Fehlerweg ---------------------------------------------------------
abschnitt('Fehler: kommen sie auf Deutsch und als ApiFehler an?');
try {
  await api.hole('/termine/gibtsnichtaufkeinenfall~0');
  pruefe('Ein unbekannter Termin wirft', false);
} catch (fehler) {
  pruefe('Ein unbekannter Termin wirft einen ApiFehler', fehler instanceof ApiFehler);
  const apiFehler = fehler as ApiFehler;
  pruefe('mit Status 404', apiFehler.status === 404, apiFehler.status);
  pruefe(
    'und deutschem Text, den die Oberfläche anzeigen kann',
    /[a-zäöüß]/i.test(apiFehler.message) && !/^\w+ error/i.test(apiFehler.message),
    apiFehler.message,
  );
}

const ohneServer = new ApiZugang({ basisUrl: 'http://127.0.0.1:9', speicher });
try {
  await ohneServer.hole('/konto');
  pruefe('Ein toter Server wirft', false);
} catch (fehler) {
  pruefe('Ein toter Server wirft einen ApiFehler statt eines rohen TypeError', fehler instanceof ApiFehler);
  pruefe('mit Status 0 („gar nicht angekommen")', (fehler as ApiFehler).status === 0, (fehler as ApiFehler).status);
}

// --- Abmelden --------------------------------------------------------------
abschnitt('Abmelden');
await api.abmelden();
pruefe('Der Speicher ist leer', abgelegt === null);
pruefe('istAngemeldet meldet false', !(await api.istAngemeldet()));

// --- Zusammenfassung -------------------------------------------------------
console.log('');
if (gescheitert > 0) {
  console.log(`${gescheitert} Erwartung(en) nicht erfüllt.`);
  process.exit(1);
}
console.log('Rauchprobe grün: Die Module der App und die laufende API passen zusammen.');
console.log(`Das Testkonto ${email} bleibt in der lokalen Datenbank stehen — Entwicklungsaufbau.`);
