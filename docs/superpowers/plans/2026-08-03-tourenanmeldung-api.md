# Plan 2 — Tourenanmeldung (API)

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Mitglieder und Gäste können sich über die API zu einer Tour an- und abmelden; alle sehen die Belegung, Namen sieht nur die Guide-Rolle; Gäste willigen ein und stornieren über einen Mail-Link.

**Architektur:** Die API liest den Vereinskalender **selbst** — mit genau dem Parser, den die App benutzt (`src/data/ical/`, `src/data/parse/`), als geteilter Code. Sie glaubt der App nichts: Ob Gäste dürfen, wie viele Plätze es gibt, ob der Termin existiert, entscheidet der Kalender. Anmeldungen hängen an einem **stabilen Terminschlüssel**, der eine Verschiebung des Termins überlebt. Wettläufe um den letzten Platz löst eine Beratungssperre je Termin, dieselbe Technik wie bei der Ratenbegrenzung je Adresse.

**Technik:** Node 26 · TypeScript · Fastify 5 · Postgres 16 über `pg` 8 · Vitest

**Voraussetzung:** Pläne 1 und 1b sind umgesetzt (Anmeldung per Magic Link, Sitzungen, Ratenbegrenzung, Aufräumen). Spec: `docs/superpowers/specs/2026-08-02-tourenanmeldung-design.md`.

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, SQL und Commit-Nachrichten auf Deutsch. Fachbegriffe ohne gute Entsprechung (Token, Hash, Commit) bleiben stehen.
- **Kein Geheimnis im Repository.** Es ist öffentlich und MIT-lizenziert.
- **Alle Token nur als SHA-256-Hash in der Datenbank** — auch der Storno-Token der Gäste.
- **Keine stillen Fehlschläge.** Was schiefgeht, geht laut ins Protokoll.
- **Rechenlogik ohne Rahmenwerk**, ohne laufenden Server prüfbar.
- **Zeit kommt aus der eingespeisten Uhr** (`jetzt`), nie aus `Date.now()` oder SQL-`now()` in entscheidungsrelevanten Pfaden.
- **App-Bildschirme werden nicht angefasst.** Aufgabe 1 und 2 ändern geteilte Module unter `src/` — das ist ausdrücklich vorgesehen und durch die Wurzel-Tests abgedeckt. `app/`-Dateien bleiben unberührt.
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.
- Vor jeder Rückmeldung: `cd api && npm test && npm test` (zweimal grün ohne Datenbank-Reset), `npm run typecheck` in `api/`, und in der Wurzel `npm test` (alle grün — die Zahl wächst durch neue geteilte Tests, das ist gewollt) sowie `npm run typecheck`.

---

## Aufgabe 1: Geteilte Module für die API erschließen

Der Parser hat keine Fremdabhängigkeit — aber seine relativen Importe sind **endungslos** (`from './tokenizer'`). Die API läuft unter NodeNext/`--experimental-strip-types`, und dort scheitern endungslose relative Importe zur Laufzeit **und** in der Typprüfung. Diese Aufgabe macht die geteilten Module für beide Welten lesbar — und beweist es auf beiden Seiten.

**Das ist die riskanteste Aufgabe des Plans.** Wenn Metro (der Bundler der App) explizite `.ts`-Endungen nicht auflöst, ist der Ansatz tot und der Plan muss zurück ans Reißbrett. Deshalb steht der Beweis (Schritt 6) **vor** allem Weiteren — schlägt er fehl, melde BLOCKED statt zu improvisieren.

**Dateien:**
- Ändern: `src/data/ical/parseCalendar.ts`, `datetime.ts`, `rrule.ts`, `timezone.ts`, `tokenizer.ts` — relative Importe auf `.ts`
- Ändern: `src/data/parse/classify.ts`, `description.ts`, `html.ts` — dito
- Ändern: `tsconfig.json` (Wurzel) — `allowImportingTsExtensions` und `noEmit`
- Anlegen: `api/tests/termine-parser.test.ts` — Rauchtest

**Schnittstellen:**
- Liefert: Die Module `src/domain/types.ts`, `src/config.ts`, `src/data/ical/*`, `src/data/parse/*` sind aus `api/` heraus mit vollem Pfad samt Endung importierbar, z. B. `import { parseCalendar } from '../../src/data/ical/parseCalendar.ts'`.

- [ ] **Schritt 1: Alle relativen Importe in den geteilten Modulen um `.ts` ergänzen**

Betroffen sind ausschließlich die Importe **zwischen** den geteilten Modulen. Aus `src/data/ical/parseCalendar.ts` wird zum Beispiel:

```ts
} from '../../config.ts';
import type { ClubEvent } from '../../domain/types.ts';
import { classifyCategory, classifyLevels, cleanTitle, isCancelled, isLadiesOnly } from '../parse/classify.ts';
import { parseRideDetails } from '../parse/description.ts';
import { htmlToText } from '../parse/html.ts';
import { parseDateProperty, parseExceptionDates, type IcalDateTime } from './datetime.ts';
import { expandRecurrence, parseRecurrenceRule, type RecurrenceRule } from './rrule.ts';
import { instantToWallTime } from './timezone.ts';
import { extractComponents, parseProperties, unescapeText, type IcalProperty } from './tokenizer.ts';
```

Geh **alle acht Dateien** durch (`grep -n "from '\./\|from '\.\./" src/data/ical/*.ts src/data/parse/*.ts src/domain/types.ts src/config.ts`) und ergänze jede relative Endung. App-Dateien, die diese Module importieren (`src/features/…`, `app/…`), bleiben **unverändert** — sie laufen unter der Bundler-Auflösung und brauchen keine Endungen.

- [ ] **Schritt 2: Wurzel-`tsconfig.json` ergänzen**

`allowImportingTsExtensions` ist nur mit `noEmit` erlaubt. Die App wird von Metro gebündelt, `tsc` prüft nur — `noEmit` ist also ohnehin die Wahrheit:

```json
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node", "react"]
  },
```

- [ ] **Schritt 3: Wurzel prüfen**

```bash
npm run typecheck && npm test
```

Erwartet: Typprüfung sauber, alle Tests grün.

- [ ] **Schritt 4: Den fehlschlagenden API-Rauchtest schreiben**

`api/tests/termine-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseCalendar } from '../../src/data/ical/parseCalendar.ts';

/**
 * Beweist, dass der geteilte Parser aus der API heraus läuft — kein zweiter
 * Parser, keine Kopie. Der Kalender hier ist bewusst winzig und eingebettet:
 * Der Test soll die Erreichbarkeit belegen, nicht den Parser erneut prüfen —
 * das tun die Wurzel-Tests mit ihren Fixtures.
 */
const KALENDER = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:probe-1@test',
  'DTSTART;TZID=Europe/Berlin:20260810T180000',
  'DTEND;TZID=Europe/Berlin:20260810T200000',
  'SUMMARY:Proberunde',
  'DESCRIPTION:Plätze: 12\\nGäste: ja',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('geteilter Parser in der API', () => {
  it('parst einen Kalender', () => {
    const termine = parseCalendar(KALENDER, { now: new Date('2026-08-03T12:00:00Z') });
    expect(termine).toHaveLength(1);
    expect(termine[0]?.title).toBe('Proberunde');
    expect(termine[0]?.details.maxParticipants).toBe(12);
  });
});
```

- [ ] **Schritt 5: Test laufen lassen**

```bash
cd api && npm test tests/termine-parser.test.ts && npm run typecheck
```

Erwartet: grün. Schlägt die Typprüfung mit Auflösungsfehlern in `src/data/…` fehl, fehlt in einer der acht Dateien eine Endung.

- [ ] **Schritt 6: Der Metro-Beweis**

```bash
cd .. && npx expo export --platform web --output-dir .vorschau-web 2>&1 | tail -5
git checkout package.json tsconfig.json 2>/dev/null || true
```

Vorsicht: `expo export` formatiert `tsconfig.json` gern um und stellt Skripte in `package.json` um — deshalb das `git checkout` **nur für diese beiden Dateien**, nachdem du geprüft hast, dass deine Änderungen aus Schritt 1/2 committet oder gestasht sind. Sicherer Weg: committe Schritt 1–5 **vor** diesem Schritt (siehe Schritt 7), dann räumt das `checkout` nur Expo-Artefakte weg.

Erwartet: `Exported: .vorschau-web` ohne Auflösungsfehler. **Schlägt das Bündeln an den `.ts`-Endungen fehl: STOPP, Status BLOCKED, nichts weiter versuchen.**

- [ ] **Schritt 7: Commit** (vor Schritt 6 ausführen, siehe dort)

```bash
git add src/ tsconfig.json api/tests/termine-parser.test.ts
git commit -m "Geteilte Parser-Module mit Dateiendungen, damit die API sie lesen kann"
```

---

## Aufgabe 2: Stabiler Terminschlüssel und Gäste-Zeile

Zwei Erweiterungen an den geteilten Modulen, beide aus der Spec.

**Erstens:** Die Termin-Kennung der App (`id = uid#startInstant`) enthält den Startzeitpunkt — wird ein Termin verschoben, entsteht eine neue Kennung, und Anmeldungen hingen ins Leere. Der Parser kennt bei verschobenen Einzelterminen den **ursprünglichen** Zeitpunkt (`recurrenceInstant`), reicht ihn aber nicht durch. `ClubEvent` bekommt ihn als `originalStartInstant`.

**Zweitens:** Die Guides legen je Termin fest, ob Gäste mitdürfen — als Zeile `Gäste: ja` in der Beschreibung, die sie ohnehin pflegen. `parseRideDetails` liest sie.

**Dateien:**
- Ändern: `src/domain/types.ts` — `ClubEvent.originalStartInstant`, `RideDetails.gaesteErlaubt`
- Ändern: `src/data/ical/parseCalendar.ts` — Feld setzen
- Ändern: `src/data/parse/description.ts` — Zeile lesen
- Test: `tests/parseCalendar.test.ts`, `tests/description.test.ts` (bestehende Dateien, neue Fälle)

**Schnittstellen:**
- Liefert: `ClubEvent.originalStartInstant: number` — bei verschobenen Einzelterminen der **ursprüngliche** Zeitpunkt der Wiederholung, sonst gleich dem Startzeitpunkt.
- Liefert: `RideDetails.gaesteErlaubt?: boolean` — `true` bei „Gäste: ja", `false` bei „Gäste: nein", sonst `undefined`.

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `tests/parseCalendar.test.ts` ergänzen (Stil der Datei übernehmen, eigener `describe`-Block):

```ts
describe('originalStartInstant', () => {
  it('ist bei einem gewöhnlichen Termin der Startzeitpunkt', () => {
    const raw = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:einzel@test',
      'DTSTART;TZID=Europe/Berlin:20260812T180000',
      'DTEND;TZID=Europe/Berlin:20260812T200000',
      'SUMMARY:Feierabendrunde',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const [termin] = parseCalendar(raw, { now: new Date('2026-08-03T12:00:00Z') });
    expect(termin?.originalStartInstant).toBe(termin?.start.getTime());
  });

  it('überlebt die Verschiebung eines Einzeltermins einer Serie', () => {
    // Das MittwochsRudel wird am 12.08. von 18:00 auf 19:00 verschoben. Die
    // Kennung `id` ändert sich dadurch — `originalStartInstant` nicht: Er
    // zeigt weiter auf den ursprünglichen Zeitpunkt. Genau daran hängen
    // die Anmeldungen der API.
    const raw = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:rudel@test',
      'DTSTART;TZID=Europe/Berlin:20260805T180000',
      'DTEND;TZID=Europe/Berlin:20260805T200000',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'SUMMARY:MittwochsRudel',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:rudel@test',
      'RECURRENCE-ID;TZID=Europe/Berlin:20260812T180000',
      'DTSTART;TZID=Europe/Berlin:20260812T190000',
      'DTEND;TZID=Europe/Berlin:20260812T210000',
      'SUMMARY:MittwochsRudel',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const termine = parseCalendar(raw, { now: new Date('2026-08-03T12:00:00Z') });
    const verschoben = termine.find((t) => t.start.getHours() === 19);
    const urspruenglich = new Date('2026-08-12T18:00:00+02:00').getTime();

    expect(verschoben).toBeDefined();
    expect(verschoben?.originalStartInstant).toBe(urspruenglich);
    expect(verschoben?.originalStartInstant).not.toBe(verschoben?.start.getTime());
  });
});
```

In `tests/description.test.ts` ergänzen:

```ts
describe('Gäste-Zeile', () => {
  it('liest "Gäste: ja" als erlaubt', () => {
    expect(parseRideDetails('Gäste: ja').gaesteErlaubt).toBe(true);
  });

  it('liest "Gäste: nein" als nicht erlaubt', () => {
    expect(parseRideDetails('Gäste: nein').gaesteErlaubt).toBe(false);
  });

  it('lässt das Feld ohne die Zeile offen', () => {
    expect(parseRideDetails('Euer Guide: Malte').gaesteErlaubt).toBeUndefined();
  });

  it('versteht Schreibvarianten', () => {
    expect(parseRideDetails('Gäste : Ja, gerne!').gaesteErlaubt).toBe(true);
    expect(parseRideDetails('gäste: NEIN').gaesteErlaubt).toBe(false);
  });
});
```

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
npm test -- tests/parseCalendar.test.ts tests/description.test.ts
```

Erwartet: die neuen Fälle rot (Feld existiert nicht bzw. `undefined`).

- [ ] **Schritt 3: `src/domain/types.ts` erweitern**

In `RideDetails`, hinter `signupUrl`:

```ts
  /**
   * "Gäste:" — ob Nicht-Mitglieder mitfahren dürfen. Der Guide legt das je
   * Termin in der Beschreibung fest; fehlt die Zeile, bleibt das Feld offen
   * und die Anmeldung der API lehnt Gäste ab.
   */
  gaesteErlaubt?: boolean;
```

In `ClubEvent`, hinter `id`:

```ts
  /**
   * Der **ursprüngliche** Zeitpunkt dieses Termins, als Millisekunden.
   *
   * Bei einem verschobenen Einzeltermin einer Serie ist das der Zeitpunkt,
   * an dem er ursprünglich gelegen hätte (`RECURRENCE-ID`) — nicht der neue.
   * Bei allen anderen Terminen gleich `start`. Die Tourenanmeldung der API
   * schlüsselt daran: Eine Verschiebung ändert `id`, aber nicht diesen Wert,
   * und die Anmeldungen bleiben am Termin hängen.
   */
  originalStartInstant: number;
```

- [ ] **Schritt 4: `parseCalendar.ts` setzt das Feld**

An der Stelle, an der das `ClubEvent` gebaut wird (um Zeile 204, `id: \`${raw.uid}#${startInstant}\``), zusätzlich:

```ts
    originalStartInstant: raw.recurrenceInstant ?? startInstant,
```

Sieh dir die Umgebung an: `raw.recurrenceInstant` existiert dort bereits (Zeile ~106 im `RawEvent`). Für **erzeugte** Serien-Einzeltermine (aus der `RRULE` expandiert, nicht verschoben) ist `recurrenceInstant` null — ihr ursprünglicher Zeitpunkt **ist** ihr Start. Prüfe beim Umsetzen, dass die Stelle wirklich für beide Wege gilt (Einzeltermin und expandierte Serie); falls das Objekt an zwei Stellen gebaut wird, gehört das Feld an beide.

- [ ] **Schritt 5: `description.ts` liest die Zeile**

In `LABEL_ALIASES`:

```ts
  gäste: 'gaeste',
  gaeste: 'gaeste',
  gast: 'gaeste',
```

In `LabelValues`:

```ts
  gaeste?: string;
```

Eine Auswertung (bei den anderen `parse…`-Helfern):

```ts
/**
 * "ja" heißt ja, "nein" heißt nein — alles andere bleibt offen.
 *
 * Bewusst eng: "Gäste: nach Absprache" soll nicht als Erlaubnis gelten.
 * Offen bedeutet für die Anmeldung dasselbe wie nein, aber die App kann
 * den Unterschied anzeigen, wenn sie will.
 */
function parseJaNein(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const wort = value.trim().toLowerCase();
  if (wort.startsWith('ja')) return true;
  if (wort.startsWith('nein')) return false;
  return undefined;
}
```

Und in `parseRideDetails` im Rückgabeobjekt:

```ts
    gaesteErlaubt: parseJaNein(labels.gaeste),
```

Beachte `normalizeLabel`: Es erhält `ä` (`[^a-zäöüß]`), also erreicht „Gäste" den Schlüssel `gäste`.

- [ ] **Schritt 6: Alles prüfen**

```bash
npm test && npm run typecheck
cd api && npm test && npm run typecheck
```

Erwartet: Wurzel grün (Zahl gewachsen), `api` unverändert grün.

- [ ] **Schritt 7: Commit**

```bash
git add src/ tests/
git commit -m "Terminschlüssel überlebt Verschiebungen; Gäste-Zeile aus der Beschreibung"
```

---

## Aufgabe 3: Der Kalenderdienst der API

Die API liest den Kalender selbst, mit Zwischenspeicher — und liefert bei einem gescheiterten Abruf den letzten bekannten Stand, statt zu scheitern. Dieselbe Grundregel wie in der App: Angezeigte Daten sind besser als keine.

**Dateien:**
- Anlegen: `api/src/termine.ts`
- Anlegen: `api/tests/termine.test.ts`

**Schnittstellen:**
- Liefert: `terminSchluessel(termin: ClubEvent): string` — `` `${termin.uid}~${termin.originalStartInstant}` ``. Wird **nie geparst**, nur verglichen; die Tilde ist in URL-Pfaden unkodiert erlaubt.
- Liefert: `interface TerminDienst { holeTermine(): Promise<ClubEvent[]>; findeTermin(schluessel: string): Promise<ClubEvent | null> }`
- Liefert: `erzeugeTerminDienst(deps: { ladeKalender: () => Promise<string>; protokoll: Protokoll; jetzt?: () => Date; ttlMs?: number }): TerminDienst`
- Liefert: `erzeugeStandardTerminDienst(protokoll: Protokoll): TerminDienst` — lädt per `fetch` von `process.env.KALENDER_URL ?? CALENDAR_ICS_URL` (aus `src/config.ts`).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`api/tests/termine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Protokoll } from '../src/protokoll.ts';
import { erzeugeTerminDienst, terminSchluessel } from '../src/termine.ts';

const stillesProtokoll: Protokoll = { error: () => {} };

const jetzt = new Date('2026-08-03T12:00:00Z');

function kalender(summary: string): string {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:probe-1@test',
    'DTSTART;TZID=Europe/Berlin:20260810T180000',
    'DTEND;TZID=Europe/Berlin:20260810T200000',
    `SUMMARY:${summary}`,
    'DESCRIPTION:Plätze: 12\\nGäste: ja',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('TerminDienst', () => {
  it('liest den Kalender und findet einen Termin über den Schlüssel', async () => {
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => kalender('Proberunde'),
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    const termine = await dienst.holeTermine();
    expect(termine).toHaveLength(1);

    const gefunden = await dienst.findeTermin(terminSchluessel(termine[0]!));
    expect(gefunden?.title).toBe('Proberunde');
    expect(await dienst.findeTermin('gibtsnicht~0')).toBeNull();
  });

  it('fragt innerhalb der Frist nur einmal ab', async () => {
    let abrufe = 0;
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        abrufe++;
        return kalender('Proberunde');
      },
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    await dienst.holeTermine();
    await dienst.holeTermine();
    expect(abrufe).toBe(1);
  });

  it('liefert nach der Frist frisch', async () => {
    let abrufe = 0;
    let uhr = jetzt;
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        abrufe++;
        return kalender(`Runde ${abrufe}`);
      },
      protokoll: stillesProtokoll,
      jetzt: () => uhr,
      ttlMs: 5 * 60 * 1000,
    });

    await dienst.holeTermine();
    uhr = new Date(jetzt.getTime() + 6 * 60 * 1000);
    const termine = await dienst.holeTermine();

    expect(abrufe).toBe(2);
    expect(termine[0]?.title).toBe('Runde 2');
  });

  it('hält bei einem gescheiterten Abruf den letzten Stand', async () => {
    let scheitert = false;
    let uhr = jetzt;
    const meldungen: unknown[] = [];
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        if (scheitert) throw new Error('Kalender weg');
        return kalender('Proberunde');
      },
      protokoll: { error: (o) => meldungen.push(o) },
      jetzt: () => uhr,
      ttlMs: 5 * 60 * 1000,
    });

    await dienst.holeTermine();
    scheitert = true;
    uhr = new Date(jetzt.getTime() + 6 * 60 * 1000);

    const termine = await dienst.holeTermine();
    expect(termine[0]?.title).toBe('Proberunde');
    expect(meldungen).toHaveLength(1);
  });

  it('scheitert laut, wenn es nie einen Stand gab', async () => {
    const dienst = erzeugeTerminDienst({
      ladeKalender: async () => {
        throw new Error('Kalender weg');
      },
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });

    await expect(dienst.holeTermine()).rejects.toThrow();
  });
});
```

Hinweis: Prüfe die tatsächliche Gestalt von `Protokoll` in `api/src/protokoll.ts` und pass die Attrappe an, falls dort mehr als `error` verlangt ist.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd api && npm test tests/termine.test.ts
```

Erwartet: `Cannot find module '../src/termine.ts'`.

- [ ] **Schritt 3: `api/src/termine.ts` schreiben**

```ts
/**
 * Der Vereinskalender, gelesen von der API selbst.
 *
 * Die API glaubt der App nichts: Ob ein Termin existiert, ob Gäste dürfen,
 * wie viele Plätze es gibt — all das steht im Kalender, und den liest sie
 * hier selbst, mit genau dem Parser, den auch die App benutzt. Käme die
 * Angabe vom Anfragenden, könnte jeder sie fälschen.
 *
 * Der Zwischenspeicher folgt derselben Grundregel wie die App: Ein alter
 * Stand ist besser als keiner. Scheitert der Abruf, bleibt der letzte
 * bekannte stehen und der Fehler geht laut ins Protokoll — nur wer noch nie
 * einen Stand hatte, scheitert wirklich.
 */

import { CALENDAR_ICS_URL } from '../../src/config.ts';
import { parseCalendar } from '../../src/data/ical/parseCalendar.ts';
import type { ClubEvent } from '../../src/domain/types.ts';
import { serialisiereFehler, type Protokoll } from './protokoll.ts';

/** Wie lange ein gelesener Kalender als frisch gilt. */
const FRIST_MS = 5 * 60 * 1000;

/**
 * Der stabile Schlüssel eines Termins.
 *
 * `uid` plus **ursprünglicher** Zeitpunkt — eine Verschiebung ändert die
 * Anzeige-Kennung `id`, aber nicht diesen Schlüssel; Anmeldungen bleiben
 * damit am Termin hängen. Der Schlüssel wird **nie geparst**, nur mit neu
 * berechneten verglichen — deshalb braucht die Tilde keine Sonderbehandlung,
 * falls sie je in einer `uid` auftauchen sollte. In URL-Pfaden steht sie
 * unkodiert.
 */
export function terminSchluessel(termin: ClubEvent): string {
  return `${termin.uid}~${termin.originalStartInstant}`;
}

export interface TerminDienst {
  holeTermine(): Promise<ClubEvent[]>;
  findeTermin(schluessel: string): Promise<ClubEvent | null>;
}

export interface TerminDienstAbhaengigkeiten {
  ladeKalender: () => Promise<string>;
  protokoll: Protokoll;
  jetzt?: () => Date;
  ttlMs?: number;
}

export function erzeugeTerminDienst({
  ladeKalender,
  protokoll,
  jetzt = () => new Date(),
  ttlMs = FRIST_MS,
}: TerminDienstAbhaengigkeiten): TerminDienst {
  let stand: { geladen: number; termine: ClubEvent[] } | null = null;

  async function holeTermine(): Promise<ClubEvent[]> {
    const nun = jetzt();
    if (stand && nun.getTime() - stand.geladen < ttlMs) return stand.termine;

    try {
      const roh = await ladeKalender();
      stand = { geladen: nun.getTime(), termine: parseCalendar(roh, { now: nun }) };
    } catch (fehler) {
      if (!stand) throw fehler;
      // Alter Stand ist besser als keiner — aber nicht stillschweigend.
      protokoll.error(
        { fehler: serialisiereFehler(fehler) },
        'Kalenderabruf gescheitert, letzter Stand bleibt stehen',
      );
      stand = { ...stand, geladen: nun.getTime() };
    }

    return stand.termine;
  }

  return {
    holeTermine,
    async findeTermin(schluessel) {
      const termine = await holeTermine();
      return termine.find((t) => terminSchluessel(t) === schluessel) ?? null;
    },
  };
}

/** Der Dienst für den Betrieb: lädt über das Netz. */
export function erzeugeStandardTerminDienst(protokoll: Protokoll): TerminDienst {
  const url = process.env.KALENDER_URL ?? CALENDAR_ICS_URL;
  return erzeugeTerminDienst({
    ladeKalender: async () => {
      const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!antwort.ok) throw new Error(`Kalender antwortet mit HTTP ${antwort.status}`);
      return antwort.text();
    },
    protokoll,
  });
}
```

Hinweis zur Fehlerbehandlung im Zwischenspeicher: Beim Weiterreichen des alten Stands wird `geladen` auf jetzt gesetzt, damit nicht jede Anfrage einen neuen (scheiternden) Abruf auslöst — der nächste Versuch kommt nach Ablauf der Frist. Wenn `serialisiereFehler` im Protokoll-Aufruf doppelt wäre (weil der Logger es schon tut), prüfe die bestehende Konvention in `api/src/` und folge ihr.

- [ ] **Schritt 4: Erfolg bestätigen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Kalenderdienst: die API liest den Vereinskalender selbst"
```

---

## Aufgabe 4: Anmeldelogik mit Wettlaufschutz

Die Tabelle und die Regeln: Wer darf, wie viele passen, und was passiert, wenn zwei gleichzeitig nach dem letzten Platz greifen.

**Dateien:**
- Anlegen: `api/src/migrationen/010-tourenanmeldung.sql`
- Anlegen: `api/src/tourenanmeldung.ts`
- Anlegen: `api/tests/tourenanmeldung.test.ts`
- Ändern: `api/tests/hilfen/datenbank.ts` — `tourenanmeldung` ins `TRUNCATE`

**Schnittstellen:**
- Konsumiert: `terminSchluessel(termin)` aus Aufgabe 3; `erzeugeToken`, `hashe` aus `api/src/token.ts`.
- Liefert: `type Teilnahmewunsch = { mitgliedId: string } | { gastName: string; gastEmail: string }`
- Liefert: `meldeAn(pool, termin: ClubEvent, wunsch: Teilnahmewunsch, jetzt: Date): Promise<Anmeldeergebnis>` mit
  `type Anmeldeergebnis = { ok: true; belegt: number; stornoToken?: string } | { ok: false; grund: 'abgesagt' | 'voll' | 'gaeste-nicht-erlaubt' | 'schon-angemeldet'; belegt: number; plaetze: number | null }`
  — `stornoToken` nur bei Gästen, einmalig im Klartext.
- Liefert: `meldeAb(pool, schluessel: string, mitgliedId: string, jetzt: Date): Promise<void>`
- Liefert: `storniereGast(pool, token: string, jetzt: Date): Promise<boolean>`
- Liefert: `holeBelegung(pool, schluessel: string): Promise<number>`
- Liefert: `holeTeilnehmer(pool, schluessel: string): Promise<Array<{ anzeige: string; gast: boolean }>>`

- [ ] **Schritt 1: Migration anlegen**

`api/src/migrationen/010-tourenanmeldung.sql`:

```sql
-- Anmeldungen zu Terminen. Die Termine selbst besitzt der Kalender —
-- hier steht nur, wer sich wozu eingetragen hat.
CREATE TABLE tourenanmeldung (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der stabile Schlüssel aus uid und ursprünglichem Zeitpunkt. Bewusst
  -- Text ohne Fremdschlüssel: Es gibt keine Termintabelle, auf die er
  -- zeigen könnte.
  terminschluessel text NOT NULL,
  -- Der Startzeitpunkt, festgehalten beim Anmelden. Nur fürs Aufräumen:
  -- 30 Tage danach wird die Zeile gelöscht, ohne den Kalender zu fragen.
  termin_start     timestamptz NOT NULL,
  mitglied_id      uuid REFERENCES mitglied (id) ON DELETE CASCADE,
  gast_name        text,
  gast_email       text,
  storno_hash      text UNIQUE,
  angelegt_am      timestamptz NOT NULL,
  storniert_am     timestamptz,
  -- Entweder Mitglied oder Gast, nie beides und nie keins.
  CHECK (
    (mitglied_id IS NOT NULL AND gast_name IS NULL AND gast_email IS NULL AND storno_hash IS NULL)
    OR
    (mitglied_id IS NULL AND gast_name IS NOT NULL AND gast_email IS NOT NULL AND storno_hash IS NOT NULL)
  )
);

-- Doppelanmeldung durch Doppeltippen ist damit unmöglich, nicht nur
-- unwahrscheinlich. Nur aktive Zeilen zählen: Wer storniert hat, darf
-- sich wieder anmelden.
CREATE UNIQUE INDEX tourenanmeldung_einmal_je_mitglied
  ON tourenanmeldung (terminschluessel, mitglied_id)
  WHERE mitglied_id IS NOT NULL AND storniert_am IS NULL;

CREATE INDEX tourenanmeldung_termin
  ON tourenanmeldung (terminschluessel)
  WHERE storniert_am IS NULL;

-- Fürs Aufräumen nach Terminende.
CREATE INDEX tourenanmeldung_start ON tourenanmeldung (termin_start);
```

- [ ] **Schritt 2: Testhilfe erweitern**

In `api/tests/hilfen/datenbank.ts` die `TRUNCATE`-Zeile um `tourenanmeldung` ergänzen (vorn einreihen):

```ts
  await pool.query(
    'TRUNCATE tourenanmeldung, sitzung, magic_link, einladung, mitglied RESTART IDENTITY CASCADE',
  );
```

- [ ] **Schritt 3: Die fehlschlagenden Tests schreiben**

`api/tests/tourenanmeldung.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { terminSchluessel } from '../src/termine.ts';
import {
  holeBelegung,
  holeTeilnehmer,
  meldeAb,
  meldeAn,
  storniereGast,
} from '../src/tourenanmeldung.ts';
import type { ClubEvent } from '../../src/domain/types.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');

/** Ein Termin, wie ihn der Kalenderdienst liefern würde. */
function termin(overrides: Partial<ClubEvent> = {}): ClubEvent {
  const start = new Date('2026-08-13T16:00:00Z');
  return {
    id: 'tour@test#' + start.getTime(),
    uid: 'tour@test',
    originalStartInstant: start.getTime(),
    title: 'Oerli Runde',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    allDay: false,
    location: 'Wanderparkplatz Kalkofen',
    descriptionHtml: '',
    descriptionText: '',
    category: 'tour',
    levels: [],
    ladiesOnly: false,
    cancelled: false,
    recurring: false,
    details: { guides: [], maxParticipants: 2, gaesteErlaubt: true },
    ...overrides,
  };
}

async function mitglied(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('meldeAn — Mitglieder', () => {
  it('meldet an und zählt die Belegung', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin();

    const ergebnis = await meldeAn(pool, t, { mitgliedId: id }, jetzt);

    expect(ergebnis).toEqual({ ok: true, belegt: 1 });
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });

  it('lehnt eine zweite Anmeldung desselben Mitglieds ab', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin();

    await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    const zweite = await meldeAn(pool, t, { mitgliedId: id }, jetzt);

    expect(zweite.ok).toBe(false);
    if (!zweite.ok) expect(zweite.grund).toBe('schon-angemeldet');
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });

  it('lehnt ab, wenn der Termin voll ist — mit Belegung in der Antwort', async () => {
    const t = termin(); // 2 Plätze
    await meldeAn(pool, t, { mitgliedId: await mitglied('a@example.org') }, jetzt);
    await meldeAn(pool, t, { mitgliedId: await mitglied('b@example.org') }, jetzt);

    const dritte = await meldeAn(pool, t, { mitgliedId: await mitglied('c@example.org') }, jetzt);

    expect(dritte).toEqual({ ok: false, grund: 'voll', belegt: 2, plaetze: 2 });
  });

  it('lehnt einen abgesagten Termin ab', async () => {
    const t = termin({ cancelled: true });
    const ergebnis = await meldeAn(pool, t, { mitgliedId: await mitglied('a@example.org') }, jetzt);

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toBe('abgesagt');
  });

  it('lässt ohne Platzangabe beliebig viele zu', async () => {
    const t = termin({ details: { guides: [], gaesteErlaubt: true } });
    for (const email of ['a', 'b', 'c', 'd'].map((n) => `${n}@example.org`)) {
      const e = await meldeAn(pool, t, { mitgliedId: await mitglied(email) }, jetzt);
      expect(e.ok).toBe(true);
    }
  });

  it('zwei greifen gleichzeitig nach dem letzten Platz — nur einer bekommt ihn', async () => {
    const t = termin({ details: { guides: [], maxParticipants: 1 } });
    const [a, b] = await Promise.all([
      mitglied('a@example.org'),
      mitglied('b@example.org'),
    ]);

    const [erste, zweite] = await Promise.all([
      meldeAn(pool, t, { mitgliedId: a }, jetzt),
      meldeAn(pool, t, { mitgliedId: b }, jetzt),
    ]);

    const erfolge = [erste, zweite].filter((e) => e.ok);
    expect(erfolge).toHaveLength(1);
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(1);
  });
});

describe('meldeAn — Gäste', () => {
  it('meldet einen Gast an und gibt einmalig einen Storno-Token heraus', async () => {
    const t = termin();
    const ergebnis = await meldeAn(
      pool,
      t,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );

    expect(ergebnis.ok).toBe(true);
    if (!ergebnis.ok) return;
    expect(typeof ergebnis.stornoToken).toBe('string');

    // In der Datenbank steht nur der Hash, nie der Klartext.
    const { rows } = await pool.query<{ storno_hash: string }>(
      'SELECT storno_hash FROM tourenanmeldung',
    );
    expect(rows[0]?.storno_hash).not.toBe(ergebnis.stornoToken);
    expect(rows[0]?.storno_hash).toHaveLength(64);
  });

  it('lehnt Gäste ab, wenn der Termin sie nicht erlaubt', async () => {
    const ohne = termin({ details: { guides: [], maxParticipants: 5 } });
    const ergebnis = await meldeAn(
      pool,
      ohne,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );

    expect(ergebnis.ok).toBe(false);
    if (!ergebnis.ok) expect(ergebnis.grund).toBe('gaeste-nicht-erlaubt');
  });
});

describe('Abmelden und Storno', () => {
  it('macht den Platz wieder frei und erlaubt die Wiederanmeldung', async () => {
    const id = await mitglied('malte@example.org');
    const t = termin({ details: { guides: [], maxParticipants: 1 } });
    const s = terminSchluessel(t);

    await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    await meldeAb(pool, s, id, jetzt);

    expect(await holeBelegung(pool, s)).toBe(0);
    const wieder = await meldeAn(pool, t, { mitgliedId: id }, jetzt);
    expect(wieder.ok).toBe(true);
  });

  it('storniert einen Gast über den Token — genau einmal', async () => {
    const t = termin();
    const ergebnis = await meldeAn(
      pool,
      t,
      { gastName: 'Traute', gastEmail: 'traute@example.org' },
      jetzt,
    );
    if (!ergebnis.ok || !ergebnis.stornoToken) throw new Error('Vorbedingung');

    expect(await storniereGast(pool, ergebnis.stornoToken, jetzt)).toBe(true);
    expect(await holeBelegung(pool, terminSchluessel(t))).toBe(0);
    expect(await storniereGast(pool, ergebnis.stornoToken, jetzt)).toBe(false);
    expect(await storniereGast(pool, 'ausgedacht', jetzt)).toBe(false);
  });
});

describe('holeTeilnehmer', () => {
  it('zeigt Mitglieder mit Adresse und Gäste mit Namen', async () => {
    const t = termin();
    await meldeAn(pool, t, { mitgliedId: await mitglied('malte@example.org') }, jetzt);
    await meldeAn(pool, t, { gastName: 'Traute', gastEmail: 'traute@example.org' }, jetzt);

    const liste = await holeTeilnehmer(pool, terminSchluessel(t));

    expect(liste).toHaveLength(2);
    expect(liste).toContainEqual({ anzeige: 'malte@example.org', gast: false });
    expect(liste).toContainEqual({ anzeige: 'Traute', gast: true });
  });
});
```

- [ ] **Schritt 4: Fehlschlag bestätigen**

```bash
cd api && npm test tests/tourenanmeldung.test.ts
```

Erwartet: `Cannot find module '../src/tourenanmeldung.ts'`.

- [ ] **Schritt 5: `api/src/tourenanmeldung.ts` schreiben**

```ts
/**
 * Anmeldungen zu Touren.
 *
 * Die Regeln kommen aus dem Kalender (`ClubEvent`), die Buchhaltung liegt
 * hier. Der Kern ist der Wettlauf um den letzten Platz: Lesen-dann-Schreiben
 * ließe zwei gleichzeitige Anfragen beide durch. Deshalb läuft Zählen und
 * Einfügen in einer Transaktion hinter einer Beratungssperre **je Termin** —
 * dieselbe Technik wie bei der Ratenbegrenzung je Adresse in `anmeldung.ts`,
 * und aus demselben Grund: Anfragen für denselben Termin reihen sich auf,
 * für verschiedene nicht.
 */

import type pg from 'pg';

import type { ClubEvent } from '../../src/domain/types.ts';
import { terminSchluessel } from './termine.ts';
import { erzeugeToken, hashe } from './token.ts';

export type Teilnahmewunsch =
  | { mitgliedId: string }
  | { gastName: string; gastEmail: string };

export type Anmeldeergebnis =
  | { ok: true; belegt: number; stornoToken?: string }
  | {
      ok: false;
      grund: 'abgesagt' | 'voll' | 'gaeste-nicht-erlaubt' | 'schon-angemeldet';
      belegt: number;
      plaetze: number | null;
    };

/** Wie lange die Sperre höchstens wartet — wie in `anmeldung.ts`. */
const SPERR_ZEITSCHRANKE = '3s';

export async function meldeAn(
  pool: pg.Pool,
  termin: ClubEvent,
  wunsch: Teilnahmewunsch,
  jetzt: Date,
): Promise<Anmeldeergebnis> {
  const schluessel = terminSchluessel(termin);
  const plaetze = termin.details.maxParticipants ?? null;

  // Regeln, die keine Zählung brauchen — vor der Sperre, spart Wartezeit.
  if (termin.cancelled) {
    return { ok: false, grund: 'abgesagt', belegt: 0, plaetze };
  }
  const istGast = !('mitgliedId' in wunsch);
  if (istGast && termin.details.gaesteErlaubt !== true) {
    const belegt = await holeBelegung(pool, schluessel);
    return { ok: false, grund: 'gaeste-nicht-erlaubt', belegt, plaetze };
  }

  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    await verbindung.query(`SET LOCAL lock_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query(`SET LOCAL statement_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `tour:${schluessel}`,
    ]);

    const { rows } = await verbindung.query<{ belegt: string }>(
      `SELECT count(*) AS belegt FROM tourenanmeldung
        WHERE terminschluessel = $1 AND storniert_am IS NULL`,
      [schluessel],
    );
    const belegt = Number(rows[0]?.belegt ?? 0);

    if (plaetze !== null && belegt >= plaetze) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'voll', belegt, plaetze };
    }

    if (!istGast) {
      // Der eindeutige Teilindex fängt die Doppelanmeldung ab — ON CONFLICT
      // macht daraus einen erkennbaren Fall statt eines Fehlers.
      const eingefuegt = await verbindung.query(
        `INSERT INTO tourenanmeldung
           (terminschluessel, termin_start, mitglied_id, angelegt_am)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (terminschluessel, mitglied_id)
           WHERE mitglied_id IS NOT NULL AND storniert_am IS NULL
           DO NOTHING`,
        [schluessel, termin.start, wunsch.mitgliedId, jetzt],
      );
      await verbindung.query('COMMIT');
      if ((eingefuegt.rowCount ?? 0) === 0) {
        return { ok: false, grund: 'schon-angemeldet', belegt, plaetze };
      }
      return { ok: true, belegt: belegt + 1 };
    }

    const stornoToken = erzeugeToken();
    await verbindung.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [schluessel, termin.start, wunsch.gastName, wunsch.gastEmail, hashe(stornoToken), jetzt],
    );
    await verbindung.query('COMMIT');
    return { ok: true, belegt: belegt + 1, stornoToken };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/** Abmelden eines Mitglieds — storniert, löscht nicht: Der Platz zählt sofort frei. */
export async function meldeAb(
  pool: pg.Pool,
  schluessel: string,
  mitgliedId: string,
  jetzt: Date,
): Promise<void> {
  await pool.query(
    `UPDATE tourenanmeldung SET storniert_am = $3
      WHERE terminschluessel = $1 AND mitglied_id = $2 AND storniert_am IS NULL`,
    [schluessel, mitgliedId, jetzt],
  );
}

/** Storno eines Gastes über den Token aus der Bestätigungsmail. Einmal gültig. */
export async function storniereGast(
  pool: pg.Pool,
  token: string,
  jetzt: Date,
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE tourenanmeldung SET storniert_am = $2
      WHERE storno_hash = $1 AND storniert_am IS NULL`,
    [hashe(token), jetzt],
  );
  return (rowCount ?? 0) > 0;
}

export async function holeBelegung(pool: pg.Pool, schluessel: string): Promise<number> {
  const { rows } = await pool.query<{ belegt: string }>(
    `SELECT count(*) AS belegt FROM tourenanmeldung
      WHERE terminschluessel = $1 AND storniert_am IS NULL`,
    [schluessel],
  );
  return Number(rows[0]?.belegt ?? 0);
}

/**
 * Die Teilnehmerliste — nur für die Guide-Rolle gedacht; wer sie sehen darf,
 * entscheidet der Endpunkt. Mitglieder erscheinen mit ihrer Adresse: Mehr
 * als die Adresse speichert die API über ein Mitglied nicht.
 */
export async function holeTeilnehmer(
  pool: pg.Pool,
  schluessel: string,
): Promise<Array<{ anzeige: string; gast: boolean }>> {
  const { rows } = await pool.query<{ anzeige: string; gast: boolean }>(
    `SELECT COALESCE(a.gast_name, m.email) AS anzeige,
            (a.mitglied_id IS NULL) AS gast
       FROM tourenanmeldung a
       LEFT JOIN mitglied m ON m.id = a.mitglied_id
      WHERE a.terminschluessel = $1 AND a.storniert_am IS NULL
      ORDER BY a.angelegt_am`,
    [schluessel],
  );
  return rows;
}
```

Hinweis zu `ON CONFLICT` mit Teilindex: Die Syntax `ON CONFLICT (spalten) WHERE bedingung` muss zur Definition des Teilindex passen. Prüfe beim Umsetzen die genaue Postgres-Syntax gegen den Index aus der Migration — falls Postgres die Formulierung ablehnt, ist die Alternative, den Konflikt als Fehler `23505` zu fangen und in `'schon-angemeldet'` zu übersetzen. Beides ist richtig; wähle, was sauber durch die Tests kommt, und begründe die Wahl im Kommentar.

- [ ] **Schritt 6: Erfolg bestätigen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Tourenanmeldung: Regeln, Wettlaufschutz und Storno"
```

---

## Aufgabe 5: Die Endpunkte

Belegung für alle, Namen für Guides, Anmelden für Mitglieder und Gäste, Storno-Link per Mail.

**Dateien:**
- Ändern: `api/src/app.ts` — vier Endpunkte, `terminDienst` als Abhängigkeit, IP-Pfade erweitern
- Ändern: `api/caddy/anmeldung.Caddyfile` — Pfade erweitern
- Anlegen: `api/tests/termine-endpunkte.test.ts`
- Ändern: `api/src/server.ts` — Standarddienst einreichen

**Schnittstellen:**
- Konsumiert: `TerminDienst`, `erzeugeStandardTerminDienst`, `terminSchluessel` (Aufgabe 3); `meldeAn`, `meldeAb`, `storniereGast`, `holeBelegung`, `holeTeilnehmer` (Aufgabe 4); `holeAusweis` (bestehend, in `baueApp`); `Mailer` (bestehend).
- Liefert: `Abhaengigkeiten.terminDienst?: TerminDienst` — Standard im Betrieb: `erzeugeStandardTerminDienst`.

Die Endpunkte:

```
GET    /termine/:schluessel      öffentlich: { belegt, plaetze, frei, gaesteErlaubt, abgesagt }
                                 mit Guide-Rolle zusätzlich: teilnehmer[]
POST   /termine/:schluessel      mit Bearer: Mitglied anmelden
                                 ohne Bearer: Gast anmelden — Körper
                                 { gastName, gastEmail, einwilligung: true }
DELETE /termine/:schluessel/ich  mit Bearer: abmelden → 204
GET    /gast/storno/:token       Storno-Link aus der Mail → kleine HTML-Seite
```

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

`api/tests/termine-endpunkte.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer, type Mailer } from '../src/mailer.ts';
import type { Protokoll } from '../src/protokoll.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { erzeugeTerminDienst, terminSchluessel, type TerminDienst } from '../src/termine.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');
const stillesProtokoll: Protokoll = { error: () => {} };

/**
 * Drei Termine, wie der Verein sie schreibt: einer mit Plätzen und Gästen,
 * einer nur für Mitglieder, einer abgesagt.
 */
const KALENDER = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:offen@test',
  'DTSTART;TZID=Europe/Berlin:20260813T180000',
  'DTEND;TZID=Europe/Berlin:20260813T200000',
  'SUMMARY:Oerli Runde',
  'DESCRIPTION:Plätze: 2\\nGäste: ja',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:intern@test',
  'DTSTART;TZID=Europe/Berlin:20260814T180000',
  'DTEND;TZID=Europe/Berlin:20260814T200000',
  'SUMMARY:Vereinsrunde',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abgesagt@test',
  'DTSTART;TZID=Europe/Berlin:20260815T180000',
  'DTEND;TZID=Europe/Berlin:20260815T200000',
  'SUMMARY:-ABGESAGT- Regenrunde',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function dienst(): TerminDienst {
  return erzeugeTerminDienst({
    ladeKalender: async () => KALENDER,
    protokoll: stillesProtokoll,
    jetzt: () => jetzt,
  });
}

function bauen(mailer: Mailer = new GemerkterMailer()) {
  return baueApp({ pool, mailer, jetzt: () => jetzt, terminDienst: dienst() });
}

/** Der Schlüssel des offenen Termins, so wie ihn die App berechnen würde. */
async function offenerSchluessel(): Promise<string> {
  const termine = await dienst().holeTermine();
  const offen = termine.find((t) => t.uid === 'offen@test');
  return terminSchluessel(offen!);
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /termine/:schluessel', () => {
  it('zeigt jedem die Belegung, aber keine Teilnehmer', async () => {
    const app = bauen();
    const antwort = await app.inject({ method: 'GET', url: `/termine/${await offenerSchluessel()}` });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({
      belegt: 0,
      plaetze: 2,
      frei: 2,
      gaesteErlaubt: true,
      abgesagt: false,
    });
    await app.close();
  });

  it('zeigt der Guide-Rolle die Teilnehmer', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('guide@example.org', 'guide');
    const { zugang: mitgliedZugang } = await mitgliedMitToken('malte@example.org');

    await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${mitgliedZugang}` },
    });

    const antwort = await app.inject({
      method: 'GET',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().teilnehmer).toEqual([{ anzeige: 'malte@example.org', gast: false }]);
    await app.close();
  });

  it('zeigt einem gewöhnlichen Mitglied keine Teilnehmer — die Rolle entscheidet', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'GET',
      url: `/termine/${await offenerSchluessel()}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().teilnehmer).toBeUndefined();
    await app.close();
  });

  it('antwortet 404 auf einen unbekannten Schlüssel', async () => {
    const app = bauen();
    const antwort = await app.inject({ method: 'GET', url: '/termine/gibtsnicht~0' });

    expect(antwort.statusCode).toBe(404);
    expect(antwort.json().fehler).toBe('Diesen Termin gibt es nicht.');
    await app.close();
  });
});

describe('POST /termine/:schluessel — Mitglieder', () => {
  it('meldet mit Bearer an', async () => {
    const app = bauen();
    const { zugang } = await mitgliedMitToken('malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${await offenerSchluessel()}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(201);
    expect(antwort.json()).toEqual({ belegt: 1 });
    await app.close();
  });

  it('antwortet bei vollem Termin 409 mit Belegung', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    for (const email of ['a@example.org', 'b@example.org']) {
      const { zugang } = await mitgliedMitToken(email);
      await app.inject({ method: 'POST', url: `/termine/${s}`, headers: { authorization: `Bearer ${zugang}` } });
    }
    const { zugang } = await mitgliedMitToken('c@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json()).toEqual({ fehler: 'Die Tour ist voll.', belegt: 2, plaetze: 2 });
    await app.close();
  });
});

describe('POST /termine/:schluessel — Gäste', () => {
  it('meldet mit Einwilligung an und schickt den Storno-Link, der genau einmal gilt', async () => {
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);
    const s = await offenerSchluessel();

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(201);
    expect(mailer.versendet).toHaveLength(1);
    expect(mailer.versendet[0]?.an).toBe('traute@example.org');

    const token = mailer.versendet[0]?.text.match(/\/gast\/storno\/([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeDefined();

    const storno = await app.inject({ method: 'GET', url: `/gast/storno/${token}` });
    expect(storno.statusCode).toBe(200);
    expect(storno.body).toContain('storniert');

    const nochmal = await app.inject({ method: 'GET', url: `/gast/storno/${token}` });
    expect(nochmal.statusCode).toBe(404);
    await app.close();
  });

  it('lehnt ohne Einwilligung ab, ohne etwas zu speichern', async () => {
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${await offenerSchluessel()}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org' },
    });

    expect(antwort.statusCode).toBe(400);
    expect(mailer.versendet).toHaveLength(0);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
    await app.close();
  });

  it('lehnt Gäste ab, wenn der Termin sie nicht erlaubt', async () => {
    const app = bauen();
    const termine = await dienst().holeTermine();
    const intern = termine.find((t) => t.uid === 'intern@test');

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${terminSchluessel(intern!)}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(409);
    expect(antwort.json().fehler).toBe('Bei diesem Termin können sich nur Mitglieder anmelden.');
    await app.close();
  });

  it('lässt die Anmeldung bestehen, wenn die Storno-Mail scheitert', async () => {
    const kaputterMailer: Mailer = {
      sende: async () => {
        throw new Error('SMTP weg');
      },
    };
    const app = bauen(kaputterMailer);
    const s = await offenerSchluessel();

    const antwort = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      payload: { gastName: 'Traute', gastEmail: 'traute@example.org', einwilligung: true },
    });

    expect(antwort.statusCode).toBe(201);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung WHERE storniert_am IS NULL');
    expect(rows).toHaveLength(1);
    await app.close();
  });
});

describe('DELETE /termine/:schluessel/ich', () => {
  it('meldet ab und macht den Platz frei', async () => {
    const app = bauen();
    const s = await offenerSchluessel();
    const { zugang } = await mitgliedMitToken('malte@example.org');
    await app.inject({ method: 'POST', url: `/termine/${s}`, headers: { authorization: `Bearer ${zugang}` } });

    const antwort = await app.inject({
      method: 'DELETE',
      url: `/termine/${s}/ich`,
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(204);
    const danach = await app.inject({ method: 'GET', url: `/termine/${s}` });
    expect(danach.json().belegt).toBe(0);
    await app.close();
  });

  it('verlangt ein Token', async () => {
    const app = bauen();
    const antwort = await app.inject({
      method: 'DELETE',
      url: `/termine/${await offenerSchluessel()}/ich`,
    });

    expect(antwort.statusCode).toBe(401);
    await app.close();
  });
});
```

Hinweise: Prüfe die tatsächliche Gestalt von `Protokoll` und die Signatur von `legeSitzungAn` (nimmt `pg.Pool | pg.PoolClient`) — passe die Attrappen an, falls nötig. Der Schlüssel enthält ein `@` aus der `uid`; `app.inject` kodiert Pfade nicht, `@` und `~` sind in Pfaden erlaubt.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd api && npm test tests/termine-endpunkte.test.ts
```

Erwartet: 404-Fehlschläge — die Endpunkte fehlen.

- [ ] **Schritt 3: Endpunkte in `api/src/app.ts` einbauen**

In `Abhaengigkeiten`:

```ts
  /** Standard: `erzeugeStandardTerminDienst` — Tests reichen einen mit eingebettetem Kalender. */
  terminDienst?: TerminDienst;
```

Im Rumpf von `baueApp` (nach den bestehenden Diensten):

```ts
  const termine = terminDienst ?? erzeugeStandardTerminDienst(log);
```

Die vier Endpunkte, nach den Konto-Endpunkten:

```ts
  app.get('/termine/:schluessel', async (anfrage, antwort) => {
    const { schluessel } = anfrage.params as { schluessel: string };

    let termin;
    try {
      termin = await termine.findeTermin(schluessel);
    } catch (fehler) {
      log.error({ fehler: serialisiereFehler(fehler) }, 'Kalender nicht lesbar');
      return antwort.code(503).send({
        fehler: 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
      });
    }
    if (!termin) return antwort.code(404).send({ fehler: 'Diesen Termin gibt es nicht.' });

    const belegt = await holeBelegung(pool, schluessel);
    const plaetze = termin.details.maxParticipants ?? null;
    const grunddaten = {
      belegt,
      plaetze,
      frei: plaetze === null ? null : Math.max(0, plaetze - belegt),
      gaesteErlaubt: termin.details.gaesteErlaubt === true,
      abgesagt: termin.cancelled,
    };

    const ausweis = await holeAusweis(anfrage);
    if (ausweis?.rolle === 'guide') {
      return antwort.send({ ...grunddaten, teilnehmer: await holeTeilnehmer(pool, schluessel) });
    }
    return antwort.send(grunddaten);
  });

  app.post('/termine/:schluessel', async (anfrage, antwort) => {
    const { schluessel } = anfrage.params as { schluessel: string };

    let termin;
    try {
      termin = await termine.findeTermin(schluessel);
    } catch (fehler) {
      log.error({ fehler: serialisiereFehler(fehler) }, 'Kalender nicht lesbar');
      return antwort.code(503).send({
        fehler: 'Der Vereinskalender ist gerade nicht erreichbar. Versuch es gleich noch einmal.',
      });
    }
    if (!termin) return antwort.code(404).send({ fehler: 'Diesen Termin gibt es nicht.' });

    const ausweis = await holeAusweis(anfrage);
    let wunsch: Teilnahmewunsch;

    if (ausweis) {
      wunsch = { mitgliedId: ausweis.mitgliedId };
    } else {
      const koerper = (anfrage.body ?? {}) as {
        gastName?: unknown;
        gastEmail?: unknown;
        einwilligung?: unknown;
      };
      if (typeof koerper.gastName !== 'string' || koerper.gastName.trim().length === 0) {
        return antwort.code(400).send({ fehler: 'Name fehlt.' });
      }
      if (typeof koerper.gastEmail !== 'string' || !koerper.gastEmail.includes('@')) {
        return antwort.code(400).send({ fehler: 'E-Mail-Adresse fehlt oder ist ungültig.' });
      }
      // Kein vorangekreuztes Kästchen: Die Einwilligung muss ausdrücklich
      // mitgeschickt werden, sonst wird nichts gespeichert.
      if (koerper.einwilligung !== true) {
        return antwort.code(400).send({
          fehler:
            'Ohne Einwilligung geht es nicht: Name und E-Mail-Adresse werden bis 30 Tage nach dem Termin gespeichert und sind nur für den Guide sichtbar.',
        });
      }
      wunsch = { gastName: koerper.gastName.trim(), gastEmail: koerper.gastEmail.trim() };
    }

    const ergebnis = await meldeAn(pool, termin, wunsch, jetzt());

    if (!ergebnis.ok) {
      const texte: Record<typeof ergebnis.grund, string> = {
        abgesagt: 'Dieser Termin wurde abgesagt.',
        voll: 'Die Tour ist voll.',
        'gaeste-nicht-erlaubt': 'Bei diesem Termin können sich nur Mitglieder anmelden.',
        'schon-angemeldet': 'Du bist schon angemeldet.',
      };
      return antwort.code(409).send({
        fehler: texte[ergebnis.grund],
        belegt: ergebnis.belegt,
        plaetze: ergebnis.plaetze,
      });
    }

    // Die Storno-Mail nach dem Speichern: Scheitert sie, bleibt die
    // Anmeldung bestehen — der Gast ist angemeldet, die Mail ist Komfort.
    // Der Fehler geht laut ins Protokoll, nicht an den Anfragenden.
    if (ergebnis.stornoToken && !('mitgliedId' in wunsch)) {
      const basis = process.env.API_BASIS_URL ?? 'https://api.mtb-bielefeld.de';
      try {
        await mailer.sende(
          wunsch.gastEmail,
          `Deine Anmeldung: ${termin.title}`,
          [
            `Hallo ${wunsch.gastName},`,
            '',
            `du bist angemeldet: ${termin.title}.`,
            '',
            'Wenn du doch nicht mitfahren kannst, sag mit einem Klick ab:',
            `${basis}/gast/storno/${ergebnis.stornoToken}`,
            '',
            'Deine Angaben werden 30 Tage nach dem Termin gelöscht und sind nur für den Guide sichtbar.',
            '',
            'Viele Grüße',
            'MTB Bielefeld e.V.',
          ].join('\r\n'),
        );
      } catch (fehler) {
        log.error(
          { fehler: serialisiereFehler(fehler) },
          'Storno-Mail an Gast nicht verschickt — Anmeldung bleibt bestehen',
        );
      }
    }

    return antwort.code(201).send({ belegt: ergebnis.belegt });
  });

  app.delete('/termine/:schluessel/ich', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { schluessel } = anfrage.params as { schluessel: string };
    await meldeAb(pool, schluessel, ausweis.mitgliedId, jetzt());
    return antwort.code(204).send();
  });

  app.get('/gast/storno/:token', async (anfrage, antwort) => {
    const { token } = anfrage.params as { token: string };
    const storniert = await storniereGast(pool, token, jetzt());

    // Der Link wird aus einer Mail heraus im Browser geöffnet — die Antwort
    // ist deshalb eine kleine Seite, kein JSON.
    if (!storniert) {
      return antwort
        .code(404)
        .type('text/html; charset=utf-8')
        .send('<p>Dieser Link ist nicht mehr gültig.</p>');
    }
    return antwort
      .type('text/html; charset=utf-8')
      .send('<p>Deine Anmeldung ist storniert. Danke fürs Bescheidsagen!</p>');
  });
```

Importe entsprechend ergänzen (`TerminDienst`, `erzeugeStandardTerminDienst` aus `./termine.ts`; `meldeAn`, `meldeAb`, `storniereGast`, `holeBelegung`, `holeTeilnehmer`, `type Teilnahmewunsch` aus `./tourenanmeldung.ts`).

- [ ] **Schritt 4: IP-Pfade und Caddy-Vorlage erweitern**

In `api/src/app.ts` die Liste `IP_GESCHUETZTE_PFAD_PRAEFIXE` um `'/termine/'` und `'/gast/'` ergänzen; den Kommentar mitziehen. In `api/caddy/anmeldung.Caddyfile` die `path`-Liste um `/termine* /gast*` erweitern und den Kommentar anpassen — die Listen müssen wieder übereinstimmen.

Beachte für die Tests: Der `GET /termine/…`-Endpunkt fällt damit unter die IP-Begrenzung (20/min von derselben Test-IP). Tests mit vielen Anfragen reichen wie gehabt eine großzügige `IpBegrenzung` herein.

- [ ] **Schritt 5: `api/src/server.ts`**

`baueApp` bekommt dort keinen `terminDienst` — die Voreinstellung (`erzeugeStandardTerminDienst`) greift. Prüfe nur, dass nichts zu ändern ist, und ergänze in der Startmeldung nichts. Kein Commit-Bestandteil, falls tatsächlich keine Änderung nötig ist.

- [ ] **Schritt 6: Erfolg bestätigen und committen**

```bash
cd api && npm test && npm test && npm run typecheck
git add api/
git commit -m "Endpunkte der Tourenanmeldung: Belegung, Anmelden, Abmelden, Gast-Storno"
```

---

## Aufgabe 6: Löschfristen, Auskunft, Kaskade

Der Datenschutz-Teil: Gastdaten verschwinden von selbst, die Kontoauskunft nennt die Anmeldungen, die Kontolöschung nimmt sie mit.

**Dateien:**
- Ändern: `api/src/aufraeumen.ts` — Anmeldungen nach Frist löschen
- Ändern: `api/src/konto.ts` — Anmeldungen in der Auskunft
- Test: `api/tests/aufraeumen.test.ts`, `api/tests/konto.test.ts` (bestehende Dateien, neue Fälle)

**Schnittstellen:**
- Ändert: `Aufraeumbilanz` um `tourenanmeldungen: number`.
- Ändert: `KontoAuskunft` um `anmeldungen: number` (aktive, nicht stornierte).

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

In `api/tests/aufraeumen.test.ts` ergänzen — zuerst die Hilfsfunktion zu den bestehenden (`sitzung`, `magicLink`):

```ts
/** Eine Gastanmeldung mit frei wählbarem Terminbeginn — fürs Fristen-Prüfen. */
async function gastanmeldung(schluessel: string, terminStart: Date): Promise<void> {
  await pool.query(
    `INSERT INTO tourenanmeldung
       (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
     VALUES ($1, $2, 'Traute', 'traute@example.org', $3, $4)`,
    [schluessel, terminStart, hashe(`storno-${schluessel}`), terminStart],
  );
}
```

Dann die Fälle:

```ts
describe('raeumeAuf — Tourenanmeldungen', () => {
  it('löscht Anmeldungen 30 Tage nach dem Termin', async () => {
    const vor31Tagen = new Date(jetzt.getTime() - 31 * 24 * 60 * 60 * 1000);
    await gastanmeldung('alt~1', vor31Tagen);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
  });

  it('lässt Anmeldungen zu jüngeren Terminen stehen', async () => {
    const vor10Tagen = new Date(jetzt.getTime() - 10 * 24 * 60 * 60 * 1000);
    await gastanmeldung('frisch~1', vor10Tagen);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.tourenanmeldungen).toBe(0);
    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(1);
  });
});
```

In `api/tests/konto.test.ts` ergänzen:

```ts
  it('nennt die aktiven Anmeldungen in der Auskunft', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { id, zugang } = await angemeldetesMitglied();
    await pool.query(
      `INSERT INTO tourenanmeldung (terminschluessel, termin_start, mitglied_id, angelegt_am)
       VALUES ('tour~1', $2, $1, $3), ('tour~2', $2, $1, $3)`,
      [id, new Date('2026-08-20T16:00:00Z'), jetzt],
    );
    await pool.query(
      `UPDATE tourenanmeldung SET storniert_am = $1 WHERE terminschluessel = 'tour~2'`,
      [jetzt],
    );

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().anmeldungen).toBe(1);
    await app.close();
  });

  it('nimmt die Anmeldungen bei der Kontolöschung mit', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { id, zugang } = await angemeldetesMitglied();
    await pool.query(
      `INSERT INTO tourenanmeldung (terminschluessel, termin_start, mitglied_id, angelegt_am)
       VALUES ('tour~1', $2, $1, $3)`,
      [id, new Date('2026-08-20T16:00:00Z'), jetzt],
    );

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
    await app.close();
  });
```

Prüfe, ob `angemeldetesMitglied()` in `konto.test.ts` die `id` mitliefert — falls nicht, erweitere die Hilfsfunktion.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd api && npm test tests/aufraeumen.test.ts tests/konto.test.ts
```

- [ ] **Schritt 3: `aufraeumen.ts` erweitern**

Konstante und dritte Löschanweisung:

```ts
/**
 * Wie lange eine Anmeldung nach dem Termin aufbewahrt bleibt.
 *
 * Die Frist kommt aus der Spec und gilt der Gastanmeldung: Name und Adresse
 * eines Nicht-Mitglieds haben kein Bleiberecht über den Zweck hinaus. Sie
 * gilt hier bewusst für **alle** Anmeldungen — auch die von Mitgliedern.
 * Eine Buchhaltung vergangener Ausfahrten ist nicht der Zweck dieser
 * Tabelle, und was nicht da ist, muss niemand schützen.
 */
const ANMELDUNG_AUFBEWAHRUNG_TAGE = 30;
```

In `raeumeAuf` (Muster der bestehenden Anweisungen):

```ts
  const tourengrenze = new Date(
    jetzt.getTime() - ANMELDUNG_AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000,
  );
  const tourenanmeldungen = await pool.query(
    'DELETE FROM tourenanmeldung WHERE termin_start < $1',
    [tourengrenze],
  );
```

Und `tourenanmeldungen: tourenanmeldungen.rowCount ?? 0` in die Bilanz samt Typ `Aufraeumbilanz`.

- [ ] **Schritt 4: `konto.ts` erweitern**

`KontoAuskunft` um `anmeldungen: number`; in der Abfrage von `holeKontoAuskunft` eine weitere Unterabfrage nach dem Muster der Sitzungszählung:

```sql
            (SELECT count(*) FROM tourenanmeldung a
              WHERE a.mitglied_id = m.id AND a.storniert_am IS NULL) AS anmeldungen
```

Die Kontolöschung braucht **keine** Änderung — `ON DELETE CASCADE` aus der Migration nimmt die Zeilen mit; genau das belegt der Test.

- [ ] **Schritt 5: Erfolg bestätigen und committen**

```bash
cd api && npm test && npm test && npm run typecheck
cd .. && npm test && npm run typecheck && npx expo install --check
git add api/
git commit -m "Gastdaten verfallen von selbst; Auskunft und Löschung kennen Anmeldungen"
```

---

## Nach diesem Plan

Die API kann alles, was die Spec für den ersten Ausbaustand verlangt — außer dem, was bewusst anderswo liegt:

- **Plan 3:** Der Knopf in der App, der diese Endpunkte benutzt (heute verschickt er eine Mail).
- **Plan 4:** Echter Mailversand (der `NichtEingerichteterMailer` wirft weiterhin laut — Gäste bekommen ihre Storno-Mail erst dann), Caddy anwenden, `trustProxy`, Inbetriebnahme.
- **Rechtliches** (Verzeichnis, AVV, Datenschutzerklärung, Einwilligungstext prüfen lassen) — läuft laut Spec vor der Inbetriebnahme, nicht vor dem Code.

**Bewusste Abweichungen von der Spec, hier festgehalten:**
- Der Endpunkt heißt `DELETE /termine/:schluessel/ich` (wie in der Spec) — Gäste stornieren ausschließlich über den Mail-Link, nicht über diesen Endpunkt.
- Die Aufbewahrungsfrist gilt für alle Anmeldungen, nicht nur für Gäste (Begründung im Code der Aufgabe 6).
