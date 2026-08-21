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
 * Native läuft — `src/data/api.ts`, `src/konto/magicLink.ts`,
 * `src/domain/terminSchluessel.ts`, `src/features/events/teilnahmeFehler.ts`
 * sowie, seit Aufgabe 1 des Jugendtrainings-Plans, `src/data/jugend.ts` und
 * `src/features/jugend/jugendFehler.ts`. Der Kontext (`KontoContext.tsx`),
 * die Bildschirme und das Antippen eines echten Mail-Links brauchen ein Gerät
 * oder den Simulator; dafür ist diese Probe nicht gedacht und täuscht es auch
 * nicht vor.
 *
 * **Die Ratenbegrenzung ist scharf.** Ein Durchlauf verbraucht in der
 * Caddy-Zone "anmeldung" (`/anmeldung/*`, `/sitzung*`, `/konto*`,
 * `betrieb/Caddyfile`) Anfragen für zwei Konten — das ursprüngliche und, für
 * den Sichtbarkeits-Prüfstein der Jugendtrainings, ein zweites ohne
 * Guide-Rolle.
 *
 * **Die Zonen rechnen je IP, nicht je Konto** (`key {remote_host}`). Beide
 * Prüfkonten teilen sich also denselben Eimer von zehn — ein zweites Konto
 * schafft keinen Abstand, es verbraucht denselben. Wer hier Prüfsteine
 * ergänzt, zählt die Schreibvorgänge mit, statt auf Luft zu hoffen.
 *
 * Es gibt drei Zonen: "anmeldung" (10/min), "tourenanmeldung" (schreibend
 * auf `/termine/*`, 10/min) und seit dem 06.08.2026 "jugendtraining"
 * (schreibend auf `/jugendtraining*`, 15/min). Der Lauf schöpft die letzten
 * beiden über weite Strecken aus. Zwei Läufe unmittelbar hintereinander
 * laufen deshalb in ein 429 — das ist die Bremse von vorhin, kein kaputter
 * Ablauf. Eine Minute warten.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CALENDAR_ICS_URL } from '../src/config.ts';
import { ApiFehler, ApiZugang } from '../src/data/api.ts';
import { parseCalendar } from '../src/data/ical/parseCalendar.ts';
import type { TokenSpeicher } from '../src/data/tokenSpeicher.ts';
import { terminSchluessel } from '../src/domain/terminSchluessel.ts';
import { beschreibeTeilnahmeFehler } from '../src/features/events/teilnahmeFehler.ts';
import {
  holeTrainings,
  holeTraining,
  legeTrainingAn,
  meldeKindAb,
  meldeKindAn,
  sageAb,
  veroeffentliche,
} from '../src/data/jugend.ts';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler.ts';
import { extrahiereMagicToken } from '../src/konto/magicLink.ts';

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
  // Seit Handoff 17 prüft der Endpunkt wirklich (Datenbank, 503,
  // no-store). Ein 200 heißt damit mehr als „der Prozess lebt" — und die
  // Fassung daneben sagt, welcher Stand gerade läuft. Genau die Frage, die
  // man sich bei einem seltsamen Ergebnis der Rauchprobe als Erstes stellt.
  const zustand = (await antwort.clone().json()) as { datenbank?: string; version?: string };
  pruefe('… und meldet die Datenbank als erreichbar', zustand.datenbank === 'ok', zustand.datenbank);
  console.log(`   Fassung des Servers: ${zustand.version ?? 'unbekannt'}`);
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
pruefe('sitzungsstand meldet angemeldet', (await api.sitzungsstand()) === 'angemeldet');
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

// --- Jugendtrainings: der Datenzugang aus Aufgabe 1 gegen die echte API ----
abschnitt('Jugendtrainings: anlegen, veröffentlichen, anmelden, absagen');

// Das schon angemeldete Testkonto zum Guide machen — derselbe Weg, den ein
// Verein auf dem Server ginge: das CLI-Werkzeug im Container, nicht SQL von
// außen, das die echte Rollenvergabe nicht nachbildete.
imContainer(['npm', 'run', 'rolle:setzen', '--', email, 'guide']);
pruefe('Rolle „guide" für das Testkonto gesetzt', true);

const training = await legeTrainingAn(api, {
  beginntAm: new Date(Date.now() + 24 * 60 * 60 * 1000),
  ort: 'Rauchprobe-Trainingsgelände',
  hinweis: 'Nur für die Rauchprobe angelegt',
  plaetze: 5,
  guidesNoetig: 1,
});
pruefe('legeTrainingAn liefert ein Training im Entwurf', training.zustand === 'entwurf', training.zustand);

const veroeffentlicht = await veroeffentliche(api, training.id);
pruefe(
  'veroeffentliche schaltet frei',
  veroeffentlicht.zustand === 'veroeffentlicht',
  veroeffentlicht.zustand,
);

const trainingsliste = await holeTrainings(api);
pruefe('holeTrainings zeigt das veröffentlichte Training', trainingsliste.some((t) => t.id === training.id));

// Ein Nachname, den es sonst nirgends in der Datenbank gibt — sonst bewiese
// eine zufällige Übereinstimmung im Prüfstein weiter unten nichts.
const kindNachname = `Rauchprobenkind-${Date.now()}`;
const anmeldung = await meldeKindAn(api, training.id, {
  vorname: 'Nele',
  nachname: kindNachname,
  zeigtVorname: true,
  zeigtNachname: false,
});
pruefe('meldeKindAn zählt die Belegung hoch', anmeldung.belegt === 1, anmeldung.belegt);

const alsGuideGesehen = await holeTraining(api, training.id);
pruefe(
  'Als Guide steht der volle Name in kinder',
  alsGuideGesehen.kinder.some((k) => k.anzeige.includes(kindNachname)),
  alsGuideGesehen.kinder,
);
pruefe(
  'guideZusagen ist eine Zahl, auch ganz ohne Zusage (Abweichung vom Auftrag, Aufgabe 1)',
  typeof alsGuideGesehen.guideZusagen === 'number',
  alsGuideGesehen.guideZusagen,
);
// `eigene` ist der Unterschied zwischen „ich kann mein Kind abmelden" und
// „der Platz bleibt bis zum Training belegt": Die App zeigt allein danach
// einen Abmelden-Knopf (`src/features/jugend/eigeneKinder.ts`). Fällt das
// Feld weg, sieht sie aus wie vor der Behebung — und keine andere Prüfung
// im Projekt merkt es.
pruefe(
  'Das eben angemeldete Kind trägt eigene: true',
  alsGuideGesehen.kinder.find((k) => k.id === anmeldung.kindId)?.eigene === true,
  alsGuideGesehen.kinder,
);

// --- Der Prüfstein: ein zweites, gewöhnliches Mitgliedskonto ---------------
abschnitt('Prüfstein: Sichtbarkeit der Kindernamen — Guide gegen gewöhnliches Mitglied');

// Ein zweites, frisches Konto — bewusst ohne Rolle „guide": genau der
// Unterschied, den `holeKinder` (`api/src/jugendtraining.ts`) zwischen dem
// vollen Namen und der von den Eltern erlaubten Anzeige entscheiden lässt.
const email2 = `rauchprobe-mitglied-${Date.now()}@example.org`;
const codeAusgabe2 = imContainer(['npm', 'run', 'einladung:erzeugen', '--', email2]);
const codeZeile2 = codeAusgabe2.split('\n').find((zeile) => zeile.startsWith(`${email2}: `));
if (!codeZeile2) {
  console.error('FEHLGESCHLAGEN: Kein Einladungscode für das zweite Konto.');
  console.error(codeAusgabe2);
  process.exit(1);
}
const einladungscode2 = codeZeile2.slice(email2.length + 2).trim();

let abgelegt2: string | null = null;
const speicher2: TokenSpeicher = {
  lies: async () => abgelegt2,
  schreib: async (token) => {
    abgelegt2 = token;
  },
  loesche: async () => {
    abgelegt2 = null;
  },
};
const api2 = new ApiZugang({ basisUrl: BASIS, speicher: speicher2 });
await api2.fordereAnmeldungAn(email2, einladungscode2);

let nachrichtId2: string | null = null;
for (let versuch = 0; versuch < 10; versuch += 1) {
  const suche = await fetch(`${MAILPIT}/api/v1/search?query=to%3A${email2}`).then((r) => r.json());
  if (suche.messages?.length) {
    nachrichtId2 = suche.messages[0].ID;
    break;
  }
  await new Promise((weiter) => setTimeout(weiter, 1000));
}
if (!nachrichtId2) {
  console.error(`FEHLGESCHLAGEN: Nach zehn Sekunden keine Mail an ${email2} in Mailpit.`);
  process.exit(1);
}
const mail2 = await fetch(`${MAILPIT}/api/v1/message/${nachrichtId2}`).then((r) => r.json());
const token2 = extrahiereMagicToken(mail2.Text);
if (!token2) {
  console.error('FEHLGESCHLAGEN: kein Magic Link im Mailtext des zweiten Kontos.');
  process.exit(1);
}
await api2.loeseEin(token2);
pruefe('Das zweite Konto ist angemeldet — ohne Guide-Rolle', (await api2.sitzungsstand()) === 'angemeldet');

const alsMitgliedGesehen = await holeTraining(api2, training.id);
// Nicht nur `anzeige` vergleichen: die **ganze** Antwort durchsuchen. Der
// Prüfstein soll auch einen Nachnamen fangen, der sich woanders einschliche.
const rohantwort = JSON.stringify(alsMitgliedGesehen);
pruefe(
  'Der Nachname taucht in der Antwort an ein gewöhnliches Mitglied nirgends auf',
  !rohantwort.includes(kindNachname),
  alsMitgliedGesehen,
);
pruefe('Ein gewöhnliches Mitglied bekommt gar kein guides-Feld', alsMitgliedGesehen.guides === undefined);
// Sichtbarkeit ist nicht Besitz — dasselbe Kind, anderes Konto, `eigene:
// false`. Ohne diesen Prüfstein könnte `eigene` schlicht überall `true`
// sein, und der Prüfstein darüber bliebe trotzdem grün.
pruefe(
  'Aus dem zweiten Konto heraus ist dasselbe Kind eigene: false',
  alsMitgliedGesehen.kinder.find((k) => k.id === anmeldung.kindId)?.eigene === false,
  alsMitgliedGesehen.kinder,
);
pruefe(
  'guideZusagen bleibt trotzdem sichtbar — die Zahl, nicht die Namen',
  typeof alsMitgliedGesehen.guideZusagen === 'number',
  alsMitgliedGesehen.guideZusagen,
);

// --- Aufräumen: abmelden und absagen ----------------------------------------
abschnitt('Jugendtrainings: abmelden und absagen');

await meldeKindAb(api, training.id, anmeldung.kindId);
const nachAbmeldung = await holeTraining(api, training.id);
pruefe('meldeKindAb zählt die Belegung wieder herunter', nachAbmeldung.belegt === 0, nachAbmeldung.belegt);

const abgesagt = await sageAb(api, training.id, 'Rauchprobe: aufgeräumt');
pruefe('sageAb sagt ab', abgesagt.zustand === 'abgesagt', abgesagt.zustand);
pruefe(
  'mit dem übergebenen Grund',
  abgesagt.absagegrund === 'Rauchprobe: aufgeräumt',
  abgesagt.absagegrund,
);

// Befund 3 aus dem Zweig-Review: Eine Zusage auf ein abgesagtes Training
// ging als 204 durch und meldete Erfolg — die Oberfläche blendet den Knopf
// nur nach dem zuletzt geladenen Stand aus, und zwischen Laden und Tippen
// passt eine Absage.
try {
  await api.sende(`/jugendtraining/${training.id}/guide`, 'PUT', { zusage: true });
  pruefe('Eine Zusage auf ein abgesagtes Training wird abgelehnt', false);
} catch (fehler) {
  pruefe(
    'Eine Zusage auf ein abgesagtes Training wird mit 409 abgelehnt',
    fehler instanceof ApiFehler && fehler.status === 409,
    fehler instanceof ApiFehler ? fehler.status : fehler,
  );
  pruefe(
    'und der Satz sagt, was inzwischen passiert ist',
    beschreibeJugendFehler(fehler) === 'Dieses Training wurde inzwischen abgesagt.',
    beschreibeJugendFehler(fehler),
  );
}

// Aufgeräumt, nicht nur abgesagt.
//
// Ein abgesagtes Training bleibt sichtbar — das ist Absicht, denn wer es
// gestern gesehen hat, hielte das Verschwinden für einen Fehler und führe
// hin. Für einen Prüflauf gilt das aber nicht: Nach fünf Läufen standen im
// Bereich „Jugend" fünf abgesagte „Rauchprobe-Trainingsgelände", und die
// echten Trainings gingen darin unter. Auf dem Simulator gesehen.
//
// Gelöscht wird über die Datenbank, nicht über die API — die kennt kein
// Löschen, und das soll sie auch nicht: Ein Guide soll ein Training absagen
// können, nicht seine Spuren verwischen.
try {
  execFileSync(
    'docker',
    [...COMPOSE, 'exec', '-T', 'postgres', 'psql', '-U', 'mtbie', '-d', 'mtbie', '-q', '-c',
     `DELETE FROM jugendtraining WHERE id = '${training.id}'`],
    { encoding: 'utf8' },
  );
  pruefe('Das Prüf-Training ist wieder weg', true);
} catch {
  // Kein Abbruch: Der Prüflauf hat sein Ziel erreicht, das Aufräumen ist
  // Kür. Aber sichtbar soll es sein, sonst wächst der Bestand still weiter.
  pruefe('Das Prüf-Training ist wieder weg', false, 'Löschen fehlgeschlagen');
}

// Ein unbekanntes Training kostet kein Kontingent (GET zählt in der Zone
// "jugendtraining" nicht mit) — hier lohnt sich der echte Fehlerweg.
try {
  await holeTraining(api, 'gibtsnichtaufkeinenfall');
  pruefe('Ein unbekanntes Training wirft', false);
} catch (fehler) {
  pruefe('Es ist ein ApiFehler mit Status 404', fehler instanceof ApiFehler && fehler.status === 404);
  pruefe(
    'beschreibeJugendFehler reicht „Dieses Training gibt es nicht." durch',
    beschreibeJugendFehler(fehler) === 'Dieses Training gibt es nicht.',
    fehler,
  );
}

// --- Terminschlüssel: App und API einig? -----------------------------------
abschnitt('Terminschlüssel: App-seitig berechnet, von der API angenommen (Aufgabe 4)');

// Kein Umweg über den Container nötig: Außerhalb des Browsers löst
// `CALENDAR_ICS_URL` (`src/config.ts`) auf die echte Google-Kalender-Adresse
// auf, ohne CORS-Sperre. Hier liest also dasselbe Modul denselben
// Vereinskalender wie die App auf dem Telefon, und `terminSchluessel`
// (`src/domain/terminSchluessel.ts`) ist seit Aufgabe 4 exakt die Funktion,
// die auch `api/src/termine.ts` per Re-Export verwendet — kein Vergleich
// zweier Kopien mehr, sondern die Probe, dass ein damit berechneter
// Schlüssel bei der echten API wirklich einen Termin trifft (die Kodierung
// mit `encodeURIComponent` eingeschlossen, wegen des `@` in der `uid`).
const rohkalenderFuerSchluessel = await fetch(CALENDAR_ICS_URL).then((r) => r.text());
const eigeneTermine = parseCalendar(rohkalenderFuerSchluessel);
const naechsterEigener = eigeneTermine.find(
  (t) => !t.cancelled && t.start.getTime() > Date.now(),
);
if (!naechsterEigener) {
  console.error('FEHLGESCHLAGEN: kein anstehender, nicht abgesagter Termin im echten Kalender.');
  process.exit(1);
}
const eigenerSchluessel = terminSchluessel(naechsterEigener);
const belegungEigenerTermin = await fetch(
  `${BASIS}/termine/${encodeURIComponent(eigenerSchluessel)}`,
);
pruefe(
  'GET /termine/:schluessel nimmt den App-seitig berechneten Schlüssel an (200, kein 404)',
  belegungEigenerTermin.status === 200,
  belegungEigenerTermin.status,
);

// --- Fehler der Tourenanmeldung: verständlich übersetzt? -------------------
abschnitt('beschreibeTeilnahmeFehler gegen echte Antworten der API (Aufgabe 4)');

await api.sende(pfad, 'POST');
try {
  await api.sende(pfad, 'POST');
  pruefe('Eine zweite Anmeldung zum selben Termin wird abgelehnt', false);
} catch (fehler) {
  pruefe('Sie wirft einen ApiFehler mit Status 409', fehler instanceof ApiFehler && fehler.status === 409, fehler instanceof ApiFehler ? fehler.status : fehler);
  pruefe(
    'beschreibeTeilnahmeFehler reicht „Du bist schon angemeldet." unverändert durch',
    beschreibeTeilnahmeFehler(fehler) === 'Du bist schon angemeldet.',
    beschreibeTeilnahmeFehler(fehler),
  );
}
// Aufräumen: der Termin soll wieder im Ausgangszustand stehen.
await api.sende(`${pfad}/ich`, 'DELETE');

// Eine schreibende Anfrage ohne gültige Sitzung — ein frischer, nie
// eingeloggter Zugang. Bewusst nicht gegen `/termine/*`: Diese Probe
// schöpft die Zone "tourenanmeldung" über weite Strecken aus — ein elfter
// Schreibzugriff dort träfe nicht die Sitzungsprüfung, sondern Caddys
// Bremse (429), und das Ergebnis wäre reiner Zufall der Reihenfolge.
// `/konto/jugend-benachrichtigung` prüft `holeAusweis` genauso, liegt aber
// in der Zone "anmeldung", die hier noch Luft hat.
let ohneToken: string | null = null;
const anonymerSpeicher: TokenSpeicher = {
  lies: async () => ohneToken,
  schreib: async (token) => {
    ohneToken = token;
  },
  loesche: async () => {
    ohneToken = null;
  },
};
const anonymerZugang = new ApiZugang({ basisUrl: BASIS, speicher: anonymerSpeicher });
try {
  await anonymerZugang.sende('/konto/jugend-benachrichtigung', 'PUT', { an: true });
  pruefe('Eine schreibende Anfrage ohne Sitzung wird abgelehnt', false);
} catch (fehler) {
  pruefe(
    'Sie wirft einen ApiFehler mit Status 401',
    fehler instanceof ApiFehler && fehler.status === 401,
    fehler instanceof ApiFehler ? fehler.status : fehler,
  );
  pruefe(
    'beschreibeTeilnahmeFehler nennt den nächsten Schritt (neu anmelden), nicht nur „Nicht angemeldet."',
    beschreibeTeilnahmeFehler(fehler) ===
      'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.',
    beschreibeTeilnahmeFehler(fehler),
  );
}

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

// --- Universal Links -------------------------------------------------------
//
// Diese Datei entscheidet, ob ein geteilter `/t/<id>`-Link die App öffnet oder
// nur den Browser. Sie liegt in `betrieb/Caddyfile`, nicht im App-Quelltext —
// niemand fasst sie an, wenn er an der App arbeitet, und ihr Wegfall fällt in
// keiner Prüfung auf: Tests, Typprüfung und beide Plattform-Bündel bleiben
// grün. Auffallen würde er erst einem Elternteil, das in der WhatsApp-Gruppe
// auf den Link tippt und in Safari landet.
//
// Der Abgleich der `appID` gegen `app.config.js` ist der eigentliche Punkt. Die
// Kennung steht an zwei Stellen — hier in der ausgelieferten Datei und dort im
// Bündel —, und iOS verlangt, dass beide übereinstimmen. Wer die eine ändert,
// merkt vom Auseinanderlaufen sonst nichts.
abschnitt('Universal Links: liefert der Server apple-app-site-association aus?');
{
  // Die Kennung aus **derselben** Quelle wie der Bau, nicht ein zweites Mal
  // hingeschrieben: Zwei Stellen mit derselben Wahrheit laufen auseinander,
  // und dieser Prüfstein existiert gerade, um Auseinanderlaufen zu bemerken.
  // Läuft die Probe mit `EXPO_PUBLIC_APP_UMGEBUNG=prod`, erwartet sie damit
  // von selbst die prod-Kennung.
  const { baueKonfiguration } = await import('../app.config.js');
  const buendel = baueKonfiguration(process.env.EXPO_PUBLIC_APP_UMGEBUNG).expo.ios
    .bundleIdentifier as string;

  const antwort = await fetch(`${BASIS}/.well-known/apple-app-site-association`);
  pruefe('Sie wird ausgeliefert (200)', antwort.status === 200, antwort.status);
  // Ohne `application/json` verwirft iOS die Datei stillschweigend. Eine
  // Dateiendung darf der Pfad dabei ausdrücklich nicht tragen — deshalb der
  // Kopfzeilenwert und nicht der Name.
  pruefe(
    'mit content-type application/json',
    (antwort.headers.get('content-type') ?? '').startsWith('application/json'),
    antwort.headers.get('content-type'),
  );

  const aasa = (await antwort.json()) as {
    applinks?: { details?: { appID?: string; paths?: string[] }[] };
  };
  const eintrag = aasa.applinks?.details?.[0];
  pruefe('Sie nennt genau einen App-Eintrag', aasa.applinks?.details?.length === 1, aasa.applinks?.details?.length);
  pruefe(
    `Dessen appID endet auf die Bündelkennung aus app.config.js (${buendel})`,
    eintrag?.appID?.endsWith(`.${buendel}`) === true,
    eintrag?.appID,
  );
  pruefe(
    'Sie gibt `/t/*` frei — den Pfad, auf den der Teilen-Knopf zeigt',
    eintrag?.paths?.includes('/t/*') === true,
    eintrag?.paths,
  );
}

// --- Abmelden --------------------------------------------------------------
abschnitt('Abmelden');
await api.abmelden();
pruefe('Der Speicher ist leer', abgelegt === null);
pruefe('sitzungsstand meldet abgemeldet', (await api.sitzungsstand()) === 'abgemeldet');

// --- Zusammenfassung -------------------------------------------------------
console.log('');
if (gescheitert > 0) {
  console.log(`${gescheitert} Erwartung(en) nicht erfüllt.`);
  process.exit(1);
}
console.log('Rauchprobe grün: Die Module der App und die laufende API passen zusammen.');
console.log(`Das Testkonto ${email} bleibt in der lokalen Datenbank stehen — Entwicklungsaufbau.`);
