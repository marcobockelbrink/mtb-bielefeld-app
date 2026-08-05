# Plan 5 — Jugendtrainings, API und Rollen

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Ein Guide legt ein Jugendtraining als Entwurf an, alle Guides bekommen eine Mail und sagen zu oder ab, der Guide veröffentlicht, Eltern melden ein bis zwei Kinder an — alles über die API, ohne dass die App etwas davon weiß.

**Architektur:** Drei neue Tabellen neben dem bestehenden `mitglied`. Die Rechenlogik steht in `api/src/jugendtraining.ts`, die Endpunkte in `api/src/app.ts` — dieselbe Trennung wie bei `tourenanmeldung.ts`. Mails laufen wie überall **nach** der Antwort über `imHintergrund`. Ein einziger Pfad kommt ohne Token aus: die kleine Seite hinter einem geteilten Link.

**Technik:** Fastify 5 · Postgres 16 (`pg`, rohes SQL) · Vitest gegen ein echtes Postgres

**Vorlage:** `docs/superpowers/specs/2026-08-05-jugendtrainings-design.md`

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, sichtbare Texte und Commit-Nachrichten auf Deutsch.
- **Kein Geheimnis im Repository.** Es ist öffentlich.
- **Keine stillen Fehlschläge.** Was schiefgeht, sieht die Person — in ihrer Sprache, nicht als Statuscode.
- **Guides sehen immer Vor- und Nachname der Kinder.** Andere Mitglieder sehen nur, was die Eltern je Kind freigegeben haben. Gespeichert wird immer der volle Name.
- **Grenzen gehören in die Datenbank**, nicht in eine Zählung im Code: Zwei gleichzeitige Anfragen bestehen jede Zählung.
- **Mails laufen im Hintergrund**, nie vor der Antwort — sonst wird die Antwortzeit zum Orakel.
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.
- Vor jeder Rückmeldung: `cd api && npm test && npm run typecheck` — beide grün.

## Was dieser Plan **nicht** tut

Die App bleibt unverändert. Sie erfährt von Jugendtrainings erst in Plan 6. Geprüft wird hier ausschließlich über Tests und `curl` gegen den laufenden Aufbau.

**Voraussetzung:** Der SMTP-Zugang des Vereins muss in `betrieb/.env` stehen, sonst lassen sich die Mails aus Aufgabe 6 nur als Attrappe prüfen — was für die Tests reicht, für den Abnahmelauf aber nicht.

---

## Aufgabe 1: Tabellen und die Guide-Rolle

**Dateien:**
- Anlegen: `api/src/migrationen/012-jugendtraining.sql`
- Anlegen: `api/src/rolle.ts`
- Anlegen: `api/src/rolle-cli.ts`
- Anlegen: `api/tests/rolle.test.ts`
- Ändern: `api/package.json` — Skript `rolle:setzen`

**Schnittstellen:**
- Liefert: `setzeRolle(pool, email: string, rolle: Rolle): Promise<boolean>` — `false`, wenn es die Adresse nicht gibt
- Liefert: `type Rolle = 'mitglied' | 'guide' | 'verwaltung'`

- [ ] **Schritt 1: Die Migration schreiben**

`api/src/migrationen/012-jugendtraining.sql`:

```sql
-- Der Abonnement-Schalter. Eine Spalte statt einer eigenen Tabelle: Für ein
-- Ja/Nein je Mitglied wäre alles andere Aufwand ohne Gegenwert.
ALTER TABLE mitglied
  ADD COLUMN jugend_benachrichtigung boolean NOT NULL DEFAULT false;

CREATE TABLE jugendtraining (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beginnt_am         timestamptz NOT NULL,
  endet_am           timestamptz,
  ort                text NOT NULL,
  hinweis            text,
  plaetze            integer,
  guides_noetig      integer NOT NULL DEFAULT 2,
  zustand            text NOT NULL DEFAULT 'entwurf'
                     CHECK (zustand IN ('entwurf', 'veroeffentlicht', 'abgesagt')),
  absagegrund        text,
  angelegt_von       uuid NOT NULL REFERENCES mitglied(id),
  angelegt_am        timestamptz NOT NULL DEFAULT now(),
  veroeffentlicht_am timestamptz,
  abgesagt_am        timestamptz,

  -- Ein Zustand ohne seinen Zeitstempel ist ein halber Zustand: Wer später
  -- „wann ging das online?" fragt, bekäme NULL und wüsste nicht, ob die
  -- Angabe fehlt oder der Zustand falsch gesetzt wurde.
  CONSTRAINT jugendtraining_veroeffentlicht_hat_zeit
    CHECK (zustand <> 'veroeffentlicht' OR veroeffentlicht_am IS NOT NULL),
  CONSTRAINT jugendtraining_absage_hat_grund
    CHECK (zustand <> 'abgesagt' OR (abgesagt_am IS NOT NULL AND absagegrund IS NOT NULL)),
  CONSTRAINT jugendtraining_plaetze_positiv
    CHECK (plaetze IS NULL OR plaetze > 0)
);

CREATE INDEX jugendtraining_kommend ON jugendtraining (beginnt_am);

CREATE TABLE jugendtraining_guide (
  training_id    uuid NOT NULL REFERENCES jugendtraining(id) ON DELETE CASCADE,
  mitglied_id    uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  zusage         boolean NOT NULL,
  geantwortet_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (training_id, mitglied_id)
);

CREATE TABLE jugendtraining_kind (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id    uuid NOT NULL REFERENCES jugendtraining(id) ON DELETE CASCADE,
  mitglied_id    uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  vorname        text NOT NULL,
  nachname       text NOT NULL,
  -- 1 oder 2. Beim Einfügen wird der erste freie Wert genommen; zusammen mit
  -- dem Teilindex unten setzt das die Grenze in der Datenbank durch, statt in
  -- einer Zählung, die zwei gleichzeitige Anfragen beide bestehen.
  platz          smallint NOT NULL CHECK (platz IN (1, 2)),
  -- Was andere Mitglieder sehen. Guides sehen immer beides.
  zeigt_vorname  boolean NOT NULL DEFAULT true,
  zeigt_nachname boolean NOT NULL DEFAULT false,
  angelegt_am    timestamptz NOT NULL DEFAULT now(),
  storniert_am   timestamptz,

  CONSTRAINT jugendtraining_kind_namen_nicht_leer
    CHECK (length(btrim(vorname)) > 0 AND length(btrim(nachname)) > 0)
);

CREATE UNIQUE INDEX jugendtraining_kind_hoechstens_zwei
  ON jugendtraining_kind (training_id, mitglied_id, platz)
  WHERE storniert_am IS NULL;

CREATE INDEX jugendtraining_kind_je_training
  ON jugendtraining_kind (training_id)
  WHERE storniert_am IS NULL;
```

- [ ] **Schritt 2: Prüfen, dass die Migration läuft**

```bash
cd api && npm test -- migrationen
```

Erwartet: grün. Die Testdatei legt das Schema von Grund auf neu an; eine Migration mit Syntaxfehler fällt hier auf.

- [ ] **Schritt 3: Test für `setzeRolle` schreiben**

`api/tests/rolle.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { setzeRolle } from '../src/rolle.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

async function legeMitgliedAn(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email) VALUES ($1) RETURNING id',
    [email],
  );
  return rows[0]!.id;
}

describe('setzeRolle', () => {
  it('setzt die Rolle eines vorhandenen Mitglieds', async () => {
    await legeMitgliedAn('anna@example.org');

    expect(await setzeRolle(pool, 'anna@example.org', 'guide')).toBe(true);

    const { rows } = await pool.query<{ rolle: string }>(
      'SELECT rolle FROM mitglied WHERE email = $1',
      ['anna@example.org'],
    );
    expect(rows[0]?.rolle).toBe('guide');
  });

  it('findet die Adresse unabhängig von Groß- und Kleinschreibung', async () => {
    // Sonst legt jemand „Anna@…" an und wundert sich, warum „anna@…" nichts
    // findet — der eindeutige Index auf `lower(email)` verhindert genau das
    // an anderer Stelle schon.
    await legeMitgliedAn('anna@example.org');
    expect(await setzeRolle(pool, 'ANNA@Example.ORG', 'guide')).toBe(true);
  });

  it('meldet false statt zu scheitern, wenn es die Adresse nicht gibt', async () => {
    // Kein Wurf: Das Werkzeug soll dem Aufrufer sagen können, dass nichts
    // passiert ist, ohne dass er eine Ausnahme fangen muss.
    expect(await setzeRolle(pool, 'gibtsnicht@example.org', 'guide')).toBe(false);
  });
});
```

- [ ] **Schritt 4: Test laufen lassen — muss scheitern**

```bash
cd api && npm test -- rolle
```

Erwartet: FEHLER, `Cannot find module '../src/rolle.ts'`.

- [ ] **Schritt 5: `api/src/rolle.ts` schreiben**

```ts
/**
 * Die Rolle eines Mitglieds setzen.
 *
 * `mitglied.rolle` gibt es seit der ersten Migration, aber bisher konnte sie
 * niemand ändern — sie stand auf `mitglied` und blieb dort. Mit den
 * Jugendtrainings braucht es Guides, und jemand muss sie ernennen können.
 *
 * Bewusst ohne Oberfläche: Ein Verein mit einer Handvoll Guides braucht keine
 * Benutzerverwaltung. Kommt er je auf fünfzig, ist das der Zeitpunkt, es zu
 * überdenken — nicht vorher.
 */

import type pg from 'pg';

export type Rolle = 'mitglied' | 'guide' | 'verwaltung';

/** `false`, wenn es die Adresse nicht gibt. */
export async function setzeRolle(
  ausfuehrer: pg.Pool | pg.PoolClient,
  email: string,
  rolle: Rolle,
): Promise<boolean> {
  const { rowCount } = await ausfuehrer.query(
    'UPDATE mitglied SET rolle = $2 WHERE lower(email) = lower($1)',
    [email, rolle],
  );
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Schritt 6: Test laufen lassen — muss grün sein**

```bash
cd api && npm test -- rolle
```

- [ ] **Schritt 7: Das Kommandozeilenwerkzeug**

`api/src/rolle-cli.ts`:

```ts
/**
 * Kommandozeilenwerkzeug: setzt die Rolle eines Mitglieds.
 *
 * Aufruf:
 *   npm run rolle:setzen -- anna@example.org guide
 *
 * Auf dem Server:
 *   docker compose -f betrieb/docker-compose.yml exec api \
 *     npm run rolle:setzen -- anna@example.org guide
 *
 * Nur wer schon ein Konto hat, kann eine Rolle bekommen — die Adresse muss
 * also vorher einen Einladungscode eingelöst haben. Andernfalls hätte man
 * Rollen für Menschen, die es in der Datenbank nicht gibt.
 */

import { pool } from './datenbank.ts';
import { setzeRolle, type Rolle } from './rolle.ts';

const ERLAUBT: Rolle[] = ['mitglied', 'guide', 'verwaltung'];

const [email, rolle] = process.argv.slice(2);

if (!email || !rolle) {
  console.error('Adresse und Rolle angeben, zum Beispiel:');
  console.error('  npm run rolle:setzen -- anna@example.org guide');
  console.error(`Erlaubte Rollen: ${ERLAUBT.join(', ')}`);
  process.exit(1);
}

if (!ERLAUBT.includes(rolle as Rolle)) {
  console.error(`„${rolle}" ist keine Rolle. Erlaubt: ${ERLAUBT.join(', ')}`);
  process.exit(1);
}

const gefunden = await setzeRolle(pool, email, rolle as Rolle);
await pool.end();

if (!gefunden) {
  console.error(
    `Kein Mitglied mit der Adresse ${email}. Wer noch nie einen ` +
      'Einladungscode eingelöst hat, steht auch nicht in der Datenbank.',
  );
  process.exit(1);
}

console.log(`${email} ist jetzt: ${rolle}`);
```

In `api/package.json` bei den Skripten ergänzen:

```json
    "rolle:setzen": "node --experimental-strip-types src/rolle-cli.ts",
```

- [ ] **Schritt 8: Gegen den laufenden Aufbau probieren**

```bash
docker compose -f betrieb/docker-compose.yml up -d --build api
docker compose -f betrieb/docker-compose.yml exec api npm run rolle:setzen -- gibtsnicht@example.org guide
```

Erwartet: Rückgabewert 1 und die Meldung über die fehlende Adresse. **Ein Werkzeug, das bei einem Tippfehler „fertig" sagt, ist gefährlicher als eines, das gar nicht läuft.**

- [ ] **Schritt 9: Prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Tabellen für Jugendtrainings und ein Werkzeug für die Guide-Rolle"
```

---

## Aufgabe 2: Trainings anlegen, ändern, veröffentlichen, absagen

**Dateien:**
- Anlegen: `api/src/jugendtraining.ts`
- Anlegen: `api/tests/jugendtraining.test.ts`

**Schnittstellen:**
- Liefert: `interface Training { id: string; beginntAm: Date; endetAm: Date | null; ort: string; hinweis: string | null; plaetze: number | null; guidesNoetig: number; zustand: Zustand; absagegrund: string | null; angelegtVon: string }`
- Liefert: `type Zustand = 'entwurf' | 'veroeffentlicht' | 'abgesagt'`
- Liefert: `legeTrainingAn(pool, eingabe: TrainingEingabe, guideId: string, jetzt: Date): Promise<Training>`
- Liefert: `interface TrainingEingabe { beginntAm: Date; endetAm?: Date | null; ort: string; hinweis?: string | null; plaetze?: number | null; guidesNoetig?: number }`
- Liefert: `holeTraining(pool, id: string): Promise<Training | null>`
- Liefert: `holeTrainings(pool, mitEntwuerfen: boolean, jetzt: Date): Promise<Training[]>`
- Liefert: `aendereTraining(pool, id: string, eingabe: Partial<TrainingEingabe>): Promise<Training | null>`
- Liefert: `veroeffentliche(pool, id: string, jetzt: Date): Promise<{ ok: true; training: Training } | { ok: false; grund: 'unbekannt' | 'falscher-zustand' }>`
- Liefert: `sageAb(pool, id: string, grund: string, jetzt: Date): Promise<{ ok: true; training: Training } | { ok: false; grund: 'unbekannt' | 'falscher-zustand' }>`

- [ ] **Schritt 1: Die Tests schreiben**

`api/tests/jugendtraining.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import {
  aendereTraining,
  holeTraining,
  holeTrainings,
  legeTrainingAn,
  sageAb,
  veroeffentliche,
} from '../src/jugendtraining.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-05T12:00:00Z');
const sonntag = new Date('2026-08-09T08:30:00Z'); // 10:30 Ortszeit

let guideId: string;

beforeEach(async () => {
  await frischeDatenbank();
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email, rolle) VALUES ('trainer@example.org', 'guide') RETURNING id",
  );
  guideId = rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

function eingabe() {
  return { beginntAm: sonntag, ort: 'Wanderparkplatz Kalkofen' };
}

describe('legeTrainingAn', () => {
  it('legt einen Entwurf an, nicht etwas Sichtbares', async () => {
    // Der Entwurf ist der ganze Zweck der ersten Phase: Erst wenn genug
    // Guides zugesagt haben, soll jemand davon erfahren.
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect(training.zustand).toBe('entwurf');
    expect(training.ort).toBe('Wanderparkplatz Kalkofen');
    expect(training.guidesNoetig).toBe(2);
  });
});

describe('holeTrainings', () => {
  it('zeigt Entwürfe nur, wenn ausdrücklich danach gefragt wird', async () => {
    await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    expect(await holeTrainings(pool, false, jetzt)).toHaveLength(0);
    expect(await holeTrainings(pool, true, jetzt)).toHaveLength(1);
  });

  it('lässt vergangene Trainings weg', async () => {
    // Wer den Bereich öffnet, will wissen, was kommt. Was war, steht in
    // niemandes Weg herum.
    const vorbei = { ...eingabe(), beginntAm: new Date('2026-07-01T08:30:00Z') };
    await legeTrainingAn(pool, vorbei, guideId, jetzt);
    await veroeffentliche(pool, (await holeTrainings(pool, true, new Date('2026-06-01T00:00:00Z')))[0]!.id, jetzt);

    expect(await holeTrainings(pool, true, jetzt)).toHaveLength(0);
  });
});

describe('veroeffentliche', () => {
  it('macht aus dem Entwurf ein sichtbares Training', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    const ergebnis = await veroeffentliche(pool, id, jetzt);
    expect(ergebnis.ok).toBe(true);
    expect((await holeTraining(pool, id))?.zustand).toBe('veroeffentlicht');
    expect(await holeTrainings(pool, false, jetzt)).toHaveLength(1);
  });

  it('lehnt ein zweites Veröffentlichen ab, statt still nichts zu tun', async () => {
    // Sonst ginge die Mail an die Abonnenten zweimal raus.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);

    const nochmal = await veroeffentliche(pool, id, jetzt);
    expect(nochmal).toEqual({ ok: false, grund: 'falscher-zustand' });
  });

  it('meldet ein unbekanntes Training als solches', async () => {
    const ergebnis = await veroeffentliche(pool, '00000000-0000-0000-0000-000000000000', jetzt);
    expect(ergebnis).toEqual({ ok: false, grund: 'unbekannt' });
  });
});

describe('sageAb', () => {
  it('sagt ein veröffentlichtes Training mit Grund ab', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);

    const ergebnis = await sageAb(pool, id, 'Dauerregen', jetzt);
    expect(ergebnis.ok).toBe(true);

    const nachher = await holeTraining(pool, id);
    expect(nachher?.zustand).toBe('abgesagt');
    expect(nachher?.absagegrund).toBe('Dauerregen');
  });

  it('sagt auch einen Entwurf ab — dann hat sich die Guide-Suche erledigt', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect((await sageAb(pool, id, 'zu wenig Guides', jetzt)).ok).toBe(true);
  });

  it('lehnt eine zweite Absage ab', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await sageAb(pool, id, 'Regen', jetzt);
    expect(await sageAb(pool, id, 'immer noch Regen', jetzt)).toEqual({
      ok: false,
      grund: 'falscher-zustand',
    });
  });

  it('bleibt in der Liste sichtbar, damit niemand umsonst hinfährt', async () => {
    // Ein abgesagtes Training verschwinden zu lassen wäre das Gegenteil von
    // hilfreich: Wer es gestern gesehen hat, hielte das Verschwinden für
    // einen Fehler der App und führe hin.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, id, jetzt);
    await sageAb(pool, id, 'Regen', jetzt);

    const sichtbar = await holeTrainings(pool, false, jetzt);
    expect(sichtbar).toHaveLength(1);
    expect(sichtbar[0]?.zustand).toBe('abgesagt');
  });
});

describe('aendereTraining', () => {
  it('ändert nur, was angegeben ist', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    const geaendert = await aendereTraining(pool, id, { ort: 'Eisgrund' });
    expect(geaendert?.ort).toBe('Eisgrund');
    expect(geaendert?.beginntAm.getTime()).toBe(sonntag.getTime());
  });
});
```

- [ ] **Schritt 2: Laufen lassen — muss scheitern**

```bash
cd api && npm test -- jugendtraining
```

Erwartet: `Cannot find module '../src/jugendtraining.ts'`.

- [ ] **Schritt 3: `api/src/jugendtraining.ts` schreiben**

```ts
/**
 * Jugendtrainings — anlegen, ändern, veröffentlichen, absagen.
 *
 * Anders als Touren kommen diese Termine nicht aus dem Vereinskalender,
 * sondern entstehen hier: Ein Guide legt sie an. Das ist die erste Stelle,
 * an der diese API Inhalte **erzeugt**, statt fremde zu spiegeln.
 *
 * Zwei Phasen, und der Übergang ist eine menschliche Entscheidung:
 *
 *   entwurf → veroeffentlicht → (abgesagt)
 *
 * Aus dem Entwurf wird nichts von selbst. Ob zwei Guides für acht Kinder
 * reichen, hängt an Strecke, Alter und Wetter — ein Schwellenwert im Code
 * träfe eine Entscheidung, die Erfahrung braucht. `guides_noetig` ist
 * deshalb eine **Anzeige** für den Guide, keine Bedingung.
 */

import type pg from 'pg';

export type Zustand = 'entwurf' | 'veroeffentlicht' | 'abgesagt';

export interface Training {
  id: string;
  beginntAm: Date;
  endetAm: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  angelegtVon: string;
}

export interface TrainingEingabe {
  beginntAm: Date;
  endetAm?: Date | null;
  ort: string;
  hinweis?: string | null;
  plaetze?: number | null;
  guidesNoetig?: number;
}

interface Zeile {
  id: string;
  beginnt_am: Date;
  endet_am: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guides_noetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  angelegt_von: string;
}

const SPALTEN = `id, beginnt_am, endet_am, ort, hinweis, plaetze,
                 guides_noetig, zustand, absagegrund, angelegt_von`;

function zuTraining(zeile: Zeile): Training {
  return {
    id: zeile.id,
    beginntAm: zeile.beginnt_am,
    endetAm: zeile.endet_am,
    ort: zeile.ort,
    hinweis: zeile.hinweis,
    plaetze: zeile.plaetze,
    guidesNoetig: zeile.guides_noetig,
    zustand: zeile.zustand,
    absagegrund: zeile.absagegrund,
    angelegtVon: zeile.angelegt_von,
  };
}

export async function legeTrainingAn(
  ausfuehrer: pg.Pool | pg.PoolClient,
  eingabe: TrainingEingabe,
  guideId: string,
  jetzt: Date,
): Promise<Training> {
  const { rows } = await ausfuehrer.query<Zeile>(
    `INSERT INTO jugendtraining
       (beginnt_am, endet_am, ort, hinweis, plaetze, guides_noetig,
        angelegt_von, angelegt_am)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 2), $7, $8)
     RETURNING ${SPALTEN}`,
    [
      eingabe.beginntAm,
      eingabe.endetAm ?? null,
      eingabe.ort,
      eingabe.hinweis ?? null,
      eingabe.plaetze ?? null,
      eingabe.guidesNoetig ?? null,
      guideId,
      jetzt,
    ],
  );
  return zuTraining(rows[0]!);
}

export async function holeTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
): Promise<Training | null> {
  // Eine erfundene Kennung ist keine UUID und würde Postgres mit 22P02
  // abbrechen lassen. Das hier abzufangen ist billiger, als jeden Aufrufer
  // eine Ausnahme fangen zu lassen — und die Antwort ist dieselbe wie bei
  // einer gültigen, aber unbekannten Kennung: kein Orakel über Kennungen.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { rows } = await ausfuehrer.query<Zeile>(
    `SELECT ${SPALTEN} FROM jugendtraining WHERE id = $1`,
    [id],
  );
  return rows[0] ? zuTraining(rows[0]) : null;
}

/**
 * Was kommt — vergangenes lassen wir weg.
 *
 * `mitEntwuerfen` entscheidet der **Endpunkt** anhand der Rolle, nicht diese
 * Funktion: Sie soll nichts über Rollen wissen müssen.
 *
 * Abgesagte bleiben sichtbar. Sie verschwinden zu lassen wäre das Gegenteil
 * von hilfreich — wer das Training gestern gesehen hat, hielte das
 * Verschwinden für einen Fehler der App und führe hin.
 */
export async function holeTrainings(
  ausfuehrer: pg.Pool | pg.PoolClient,
  mitEntwuerfen: boolean,
  jetzt: Date,
): Promise<Training[]> {
  const { rows } = await ausfuehrer.query<Zeile>(
    `SELECT ${SPALTEN} FROM jugendtraining
      WHERE COALESCE(endet_am, beginnt_am) >= $1
        AND ($2 OR zustand <> 'entwurf')
      ORDER BY beginnt_am`,
    [jetzt, mitEntwuerfen],
  );
  return rows.map(zuTraining);
}

export async function aendereTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  eingabe: Partial<TrainingEingabe>,
): Promise<Training | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  // `COALESCE` je Spalte statt eines zusammengebauten SET: So bleibt die
  // Abfrage eine feste Zeichenkette, und „nicht angegeben" heißt zuverlässig
  // „unverändert" — auch für Felder, die absichtlich NULL sein dürfen, denn
  // die schickt der Aufrufer dann als expliziten Wert.
  const { rows } = await ausfuehrer.query<Zeile>(
    `UPDATE jugendtraining SET
       beginnt_am    = COALESCE($2, beginnt_am),
       endet_am      = CASE WHEN $3::boolean THEN $4 ELSE endet_am END,
       ort           = COALESCE($5, ort),
       hinweis       = CASE WHEN $6::boolean THEN $7 ELSE hinweis END,
       plaetze       = CASE WHEN $8::boolean THEN $9 ELSE plaetze END,
       guides_noetig = COALESCE($10, guides_noetig)
     WHERE id = $1
     RETURNING ${SPALTEN}`,
    [
      id,
      eingabe.beginntAm ?? null,
      'endetAm' in eingabe,
      eingabe.endetAm ?? null,
      eingabe.ort ?? null,
      'hinweis' in eingabe,
      eingabe.hinweis ?? null,
      'plaetze' in eingabe,
      eingabe.plaetze ?? null,
      eingabe.guidesNoetig ?? null,
    ],
  );
  return rows[0] ? zuTraining(rows[0]) : null;
}

type Uebergang =
  | { ok: true; training: Training }
  | { ok: false; grund: 'unbekannt' | 'falscher-zustand' };

/**
 * Der Zustandswechsel passiert in **einer** Anweisung mit Bedingung.
 *
 * Erst lesen, dann prüfen, dann schreiben hätte ein Fenster: Zwei Guides,
 * die gleichzeitig auf veröffentlichen drücken, kämen beide durch — und die
 * Mail an die Abonnenten ginge zweimal raus. Die Bedingung im `WHERE` lässt
 * genau einen gewinnen.
 */
async function wechsle(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  anweisung: string,
  werte: unknown[],
  erlaubteZustaende: Zustand[],
): Promise<Uebergang> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, grund: 'unbekannt' };

  const { rows } = await ausfuehrer.query<Zeile>(anweisung, [id, ...werte, erlaubteZustaende]);
  if (rows[0]) return { ok: true, training: zuTraining(rows[0]) };

  // Nichts geändert: entweder gibt es das Training nicht, oder es war im
  // falschen Zustand. Die beiden auseinanderzuhalten kostet eine zweite
  // Abfrage und ist es wert — „schon veröffentlicht" und „gibt es nicht"
  // verlangen Verschiedenes vom Guide.
  const vorhanden = await holeTraining(ausfuehrer, id);
  return { ok: false, grund: vorhanden ? 'falscher-zustand' : 'unbekannt' };
}

export function veroeffentliche(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  jetzt: Date,
): Promise<Uebergang> {
  return wechsle(
    ausfuehrer,
    id,
    `UPDATE jugendtraining
        SET zustand = 'veroeffentlicht', veroeffentlicht_am = $2
      WHERE id = $1 AND zustand = ANY($3)
      RETURNING ${SPALTEN}`,
    [jetzt],
    ['entwurf'],
  );
}

export function sageAb(
  ausfuehrer: pg.Pool | pg.PoolClient,
  id: string,
  grund: string,
  jetzt: Date,
): Promise<Uebergang> {
  return wechsle(
    ausfuehrer,
    id,
    `UPDATE jugendtraining
        SET zustand = 'abgesagt', abgesagt_am = $2, absagegrund = $3
      WHERE id = $1 AND zustand = ANY($4)
      RETURNING ${SPALTEN}`,
    [jetzt, grund],
    ['entwurf', 'veroeffentlicht'],
  );
}
```

- [ ] **Schritt 4: Tests grün**

```bash
cd api && npm test -- jugendtraining
```

- [ ] **Schritt 5: Committen**

```bash
git add api/
git commit -m "Jugendtrainings anlegen, ändern, veröffentlichen, absagen"
```

---

## Aufgabe 3: Die Guide-Zusagen

**Dateien:**
- Ändern: `api/src/jugendtraining.ts`
- Ändern: `api/tests/jugendtraining.test.ts`

**Schnittstellen:**
- Verbraucht: `Training`, `holeTraining` aus Aufgabe 2
- Liefert: `setzeGuideAntwort(pool, trainingId: string, mitgliedId: string, zusage: boolean, jetzt: Date): Promise<boolean>`
- Liefert: `holeGuideAntworten(pool, trainingId: string): Promise<Array<{ mitgliedId: string; email: string; zusage: boolean }>>`
- Liefert: `holeGuideAdressen(pool): Promise<string[]>` — alle mit Rolle `guide`

- [ ] **Schritt 1: Tests ergänzen**

An `api/tests/jugendtraining.test.ts` anhängen:

```ts
describe('Guide-Antworten', () => {
  it('merkt sich Zusage und Absage je Guide', async () => {
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);

    expect(await setzeGuideAntwort(pool, id, guideId, true, jetzt)).toBe(true);

    const antworten = await holeGuideAntworten(pool, id);
    expect(antworten).toEqual([
      { mitgliedId: guideId, email: 'trainer@example.org', zusage: true },
    ]);
  });

  it('überschreibt eine frühere Antwort, statt eine zweite anzulegen', async () => {
    // Wer erst zusagt und dann doch nicht kann, drückt auf denselben Knopf.
    const { id } = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await setzeGuideAntwort(pool, id, guideId, true, jetzt);
    await setzeGuideAntwort(pool, id, guideId, false, jetzt);

    const antworten = await holeGuideAntworten(pool, id);
    expect(antworten).toHaveLength(1);
    expect(antworten[0]?.zusage).toBe(false);
  });

  it('meldet false für ein unbekanntes Training, statt einen Fremdschlüssel zu werfen', async () => {
    expect(
      await setzeGuideAntwort(pool, '00000000-0000-0000-0000-000000000000', guideId, true, jetzt),
    ).toBe(false);
  });

  it('holeGuideAdressen findet nur Guides', async () => {
    await pool.query(
      "INSERT INTO mitglied (email, rolle) VALUES ('eltern@example.org', 'mitglied')",
    );
    await pool.query(
      "INSERT INTO mitglied (email, rolle) VALUES ('zweiter@example.org', 'guide')",
    );

    const adressen = await holeGuideAdressen(pool);
    expect(adressen.sort()).toEqual(['trainer@example.org', 'zweiter@example.org']);
  });
});
```

Den Import oben in der Datei erweitern:

```ts
import {
  aendereTraining,
  holeGuideAdressen,
  holeGuideAntworten,
  holeTraining,
  holeTrainings,
  legeTrainingAn,
  sageAb,
  setzeGuideAntwort,
  veroeffentliche,
} from '../src/jugendtraining.ts';
```

- [ ] **Schritt 2: Laufen lassen — muss scheitern**

```bash
cd api && npm test -- jugendtraining
```

- [ ] **Schritt 3: An `api/src/jugendtraining.ts` anhängen**

```ts
/**
 * Zusage oder Absage eines Guides — ein Datensatz je Guide und Training.
 *
 * `ON CONFLICT` statt Löschen und neu Einfügen: Wer erst zusagt und dann
 * doch nicht kann, drückt auf denselben Knopf, und es soll eine Antwort
 * bleiben, keine zwei.
 *
 * `false` heißt: Das Training gibt es nicht. Der Fremdschlüssel würde sonst
 * eine Ausnahme werfen, die jeder Aufrufer fangen müsste.
 */
export async function setzeGuideAntwort(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  zusage: boolean,
  jetzt: Date,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return false;

  const { rowCount } = await ausfuehrer.query(
    `INSERT INTO jugendtraining_guide (training_id, mitglied_id, zusage, geantwortet_am)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM jugendtraining WHERE id = $1)
     ON CONFLICT (training_id, mitglied_id)
     DO UPDATE SET zusage = EXCLUDED.zusage, geantwortet_am = EXCLUDED.geantwortet_am`,
    [trainingId, mitgliedId, zusage, jetzt],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Wer geantwortet hat — mit Adresse, denn mehr als die Adresse speichert
 * diese API über ein Mitglied nicht.
 *
 * Sichtbar nur für Guides; das entscheidet der Endpunkt.
 */
export async function holeGuideAntworten(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<Array<{ mitgliedId: string; email: string; zusage: boolean }>> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return [];

  const { rows } = await ausfuehrer.query<{
    mitglied_id: string;
    email: string;
    zusage: boolean;
  }>(
    `SELECT g.mitglied_id, m.email, g.zusage
       FROM jugendtraining_guide g
       JOIN mitglied m ON m.id = g.mitglied_id
      WHERE g.training_id = $1
      ORDER BY g.geantwortet_am`,
    [trainingId],
  );
  return rows.map((z) => ({ mitgliedId: z.mitglied_id, email: z.email, zusage: z.zusage }));
}

/** Alle Adressen mit der Rolle `guide` — die Empfänger der Anfrage-Mail. */
export async function holeGuideAdressen(
  ausfuehrer: pg.Pool | pg.PoolClient,
): Promise<string[]> {
  const { rows } = await ausfuehrer.query<{ email: string }>(
    "SELECT email FROM mitglied WHERE rolle = 'guide' ORDER BY email",
  );
  return rows.map((z) => z.email);
}
```

- [ ] **Schritt 4: Grün, dann committen**

```bash
cd api && npm test -- jugendtraining
git add api/
git commit -m "Guides sagen zu oder ab"
```

---

## Aufgabe 4: Kinder an- und abmelden

**Dateien:**
- Ändern: `api/src/jugendtraining.ts`
- Ändern: `api/tests/jugendtraining.test.ts`

**Schnittstellen:**
- Liefert: `meldeKindAn(pool, trainingId, mitgliedId, kind: KindEingabe, jetzt): Promise<Anmeldeergebnis>`
- Liefert: `interface KindEingabe { vorname: string; nachname: string; zeigtVorname: boolean; zeigtNachname: boolean }`
- Liefert: `type Anmeldeergebnis = { ok: true; kindId: string; belegt: number } | { ok: false; grund: 'unbekannt' | 'nicht-offen' | 'vorbei' | 'voll' | 'schon-zwei' }`
- Liefert: `meldeKindAb(pool, trainingId, mitgliedId, kindId, jetzt): Promise<boolean>`
- Liefert: `holeKinder(pool, trainingId, alsGuide: boolean): Promise<Array<{ id: string; anzeige: string }>>`
- Liefert: `holeBelegungTraining(pool, trainingId): Promise<number>`
- Liefert: `holeElternAdressen(pool, trainingId): Promise<string[]>`

- [ ] **Schritt 1: Tests ergänzen**

```ts
describe('Kinder anmelden', () => {
  let elternId: string;
  let trainingId: string;

  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('eltern@example.org') RETURNING id",
    );
    elternId = rows[0]!.id;
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, training.id, jetzt);
    trainingId = training.id;
  });

  const lena = { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false };
  const jonas = { vorname: 'Jonas', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false };

  it('trägt ein Kind ein und zählt es', async () => {
    const ergebnis = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    expect(ergebnis).toMatchObject({ ok: true, belegt: 1 });
  });

  it('lässt genau zwei Kinder je Konto zu', async () => {
    await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    await meldeKindAn(pool, trainingId, elternId, jonas, jetzt);

    const drittes = await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { ...lena, vorname: 'Mia' },
      jetzt,
    );
    expect(drittes).toEqual({ ok: false, grund: 'schon-zwei' });
  });

  it('gibt einen Platz wieder frei, wenn ein Kind abgemeldet wird', async () => {
    // Sonst hätte ein Elternteil, das sich vertippt und korrigiert, dauerhaft
    // einen Platz verbrannt.
    const erst = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');
    await meldeKindAb(pool, trainingId, elternId, erst.kindId, jetzt);

    await meldeKindAn(pool, trainingId, elternId, jonas, jetzt);
    const drittes = await meldeKindAn(pool, trainingId, elternId, { ...lena, vorname: 'Mia' }, jetzt);
    expect(drittes.ok).toBe(true);
  });

  it('lehnt einen Entwurf ab — den soll niemand sehen, geschweige denn buchen', async () => {
    const entwurf = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    expect(await meldeKindAn(pool, entwurf.id, elternId, lena, jetzt)).toEqual({
      ok: false,
      grund: 'nicht-offen',
    });
  });

  it('lehnt ein abgesagtes Training ab', async () => {
    await sageAb(pool, trainingId, 'Regen', jetzt);
    expect(await meldeKindAn(pool, trainingId, elternId, lena, jetzt)).toEqual({
      ok: false,
      grund: 'nicht-offen',
    });
  });

  it('lehnt ein vergangenes Training ab', async () => {
    const spaeter = new Date('2026-09-01T00:00:00Z');
    expect(await meldeKindAn(pool, trainingId, elternId, lena, spaeter)).toEqual({
      ok: false,
      grund: 'vorbei',
    });
  });

  it('lehnt ab, wenn kein Platz mehr frei ist', async () => {
    await aendereTraining(pool, trainingId, { plaetze: 1 });
    await meldeKindAn(pool, trainingId, elternId, lena, jetzt);

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('andere@example.org') RETURNING id",
    );
    expect(await meldeKindAn(pool, trainingId, rows[0]!.id, jonas, jetzt)).toEqual({
      ok: false,
      grund: 'voll',
    });
  });

  it('meldet nur eigene Kinder ab', async () => {
    // Sonst könnte jedes Mitglied fremde Kinder austragen.
    const erst = await meldeKindAn(pool, trainingId, elternId, lena, jetzt);
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');

    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('fremd@example.org') RETURNING id",
    );
    expect(await meldeKindAb(pool, trainingId, rows[0]!.id, erst.kindId, jetzt)).toBe(false);
  });
});

describe('holeKinder', () => {
  let elternId: string;
  let trainingId: string;

  beforeEach(async () => {
    const { rows } = await pool.query<{ id: string }>(
      "INSERT INTO mitglied (email) VALUES ('eltern@example.org') RETURNING id",
    );
    elternId = rows[0]!.id;
    const training = await legeTrainingAn(pool, eingabe(), guideId, jetzt);
    await veroeffentliche(pool, training.id, jetzt);
    trainingId = training.id;
  });

  it('zeigt Guides immer Vor- und Nachname', async () => {
    // Sie haben die Aufsicht. Bei einem Sturz muss jemand wissen, wer da liegt.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );
    const fuerGuide = await holeKinder(pool, trainingId, true);
    expect(fuerGuide[0]?.anzeige).toBe('Lena Musterfrau');
  });

  it('zeigt anderen Mitgliedern nur, was freigegeben ist', async () => {
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );
    const fuerMitglied = await holeKinder(pool, trainingId, false);
    expect(fuerMitglied[0]?.anzeige).toBe('Lena');
  });

  it('zeigt ein Kind ohne jede Freigabe als „ein Kind"', async () => {
    // Weglassen wäre falsch: Dann stimmte die Liste nicht mehr mit der Zahl
    // überein, und jemand hielte das für einen Fehler.
    await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'Musterfrau', zeigtVorname: false, zeigtNachname: false },
      jetzt,
    );
    const fuerMitglied = await holeKinder(pool, trainingId, false);
    expect(fuerMitglied[0]?.anzeige).toBe('ein Kind');
  });

  it('lässt abgemeldete Kinder weg', async () => {
    const erst = await meldeKindAn(
      pool,
      trainingId,
      elternId,
      { vorname: 'Lena', nachname: 'M', zeigtVorname: true, zeigtNachname: false },
      jetzt,
    );
    if (!erst.ok) throw new Error('Anmeldung schlug fehl');
    await meldeKindAb(pool, trainingId, elternId, erst.kindId, jetzt);

    expect(await holeKinder(pool, trainingId, true)).toHaveLength(0);
  });
});
```

Import erweitern um `holeBelegungTraining`, `holeElternAdressen`, `holeKinder`, `meldeKindAb`, `meldeKindAn`.

- [ ] **Schritt 2: Laufen lassen — muss scheitern**

- [ ] **Schritt 3: An `api/src/jugendtraining.ts` anhängen**

```ts
/** Wie lange auf die Sperre gewartet wird, bevor abgebrochen wird. */
const SPERR_ZEITSCHRANKE = '3s';

export interface KindEingabe {
  vorname: string;
  nachname: string;
  zeigtVorname: boolean;
  zeigtNachname: boolean;
}

export type Anmeldeergebnis =
  | { ok: true; kindId: string; belegt: number }
  | { ok: false; grund: 'unbekannt' | 'nicht-offen' | 'vorbei' | 'voll' | 'schon-zwei' };

export async function holeBelegungTraining(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<number> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return 0;
  const { rows } = await ausfuehrer.query<{ belegt: string }>(
    `SELECT count(*) AS belegt FROM jugendtraining_kind
      WHERE training_id = $1 AND storniert_am IS NULL`,
    [trainingId],
  );
  return Number(rows[0]?.belegt ?? 0);
}

/**
 * Ein Kind eintragen.
 *
 * Gesperrt wird je Training mit `pg_advisory_xact_lock`, genau wie bei der
 * Tourenanmeldung und aus demselben Grund: Ohne Sperre könnten zwei
 * gleichzeitige Anfragen beide die Platzprüfung bestehen und ein volles
 * Training überbuchen.
 *
 * Die Grenze von zwei Kindern je Konto steht dagegen **nicht** im Code,
 * sondern im Teilindex `jugendtraining_kind_hoechstens_zwei`: `platz` ist
 * der erste freie Wert aus (1, 2), und mehr gibt es nicht. Eine Zählung im
 * Code hätten zwei gleichzeitige Anfragen beide bestanden.
 */
export async function meldeKindAn(
  pool: pg.Pool,
  trainingId: string,
  mitgliedId: string,
  kind: KindEingabe,
  jetzt: Date,
): Promise<Anmeldeergebnis> {
  const training = await holeTraining(pool, trainingId);
  if (!training) return { ok: false, grund: 'unbekannt' };
  if (training.zustand !== 'veroeffentlicht') return { ok: false, grund: 'nicht-offen' };

  // Wer noch am Parkplatz steht, soll sich eintragen können; wer sich zu
  // einem Training vom letzten Monat anmeldet, nicht.
  const ende = training.endetAm ?? training.beginntAm;
  if (ende.getTime() < jetzt.getTime()) return { ok: false, grund: 'vorbei' };

  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    await verbindung.query(`SET LOCAL lock_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query(`SET LOCAL statement_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `jugendtraining:${trainingId}`,
    ]);

    const belegt = await holeBelegungTraining(verbindung, trainingId);
    if (training.plaetze !== null && belegt >= training.plaetze) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'voll' };
    }

    // Der erste freie Platz aus (1, 2). Gibt es keinen, war das Konto schon
    // mit zwei Kindern da.
    const { rows: frei } = await verbindung.query<{ platz: number }>(
      `SELECT p.platz FROM (VALUES (1), (2)) AS p(platz)
        WHERE NOT EXISTS (
          SELECT 1 FROM jugendtraining_kind k
           WHERE k.training_id = $1 AND k.mitglied_id = $2
             AND k.platz = p.platz AND k.storniert_am IS NULL)
        ORDER BY p.platz LIMIT 1`,
      [trainingId, mitgliedId],
    );
    const platz = frei[0]?.platz;
    if (platz === undefined) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'schon-zwei' };
    }

    const { rows } = await verbindung.query<{ id: string }>(
      `INSERT INTO jugendtraining_kind
         (training_id, mitglied_id, vorname, nachname, platz,
          zeigt_vorname, zeigt_nachname, angelegt_am)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        trainingId,
        mitgliedId,
        kind.vorname.trim(),
        kind.nachname.trim(),
        platz,
        kind.zeigtVorname,
        kind.zeigtNachname,
        jetzt,
      ],
    );
    await verbindung.query('COMMIT');
    return { ok: true, kindId: rows[0]!.id, belegt: belegt + 1 };
  } catch (fehler) {
    await verbindung.query('ROLLBACK').catch(() => {});
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/**
 * Ein Kind abmelden — nur das eigene.
 *
 * `mitglied_id` steht in der Bedingung, nicht in einer Prüfung davor: Sonst
 * könnte jedes Mitglied fremde Kinder austragen, und die Prüfung davor wäre
 * eine Stelle, die jemand später „vereinfacht".
 */
export async function meldeKindAb(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  kindId: string,
  jetzt: Date,
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(kindId)) return false;
  const { rowCount } = await ausfuehrer.query(
    `UPDATE jugendtraining_kind SET storniert_am = $4
      WHERE id = $3 AND training_id = $1 AND mitglied_id = $2
        AND storniert_am IS NULL`,
    [trainingId, mitgliedId, kindId, jetzt],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Die Teilnehmerliste.
 *
 * `alsGuide` entscheidet der Endpunkt anhand der Rolle. Gespeichert ist immer
 * der volle Name; die Wahl der Eltern steuert ausschließlich, was **andere
 * Mitglieder** sehen.
 *
 * Ein Kind ohne jede Freigabe erscheint als „ein Kind" statt zu fehlen: Sonst
 * stimmte die Liste nicht mit der Zahl überein, und jemand hielte das für
 * einen Fehler.
 */
export async function holeKinder(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  alsGuide: boolean,
): Promise<Array<{ id: string; anzeige: string }>> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return [];

  const { rows } = await ausfuehrer.query<{
    id: string;
    vorname: string;
    nachname: string;
    zeigt_vorname: boolean;
    zeigt_nachname: boolean;
  }>(
    `SELECT id, vorname, nachname, zeigt_vorname, zeigt_nachname
       FROM jugendtraining_kind
      WHERE training_id = $1 AND storniert_am IS NULL
      ORDER BY angelegt_am`,
    [trainingId],
  );

  return rows.map((z) => {
    if (alsGuide) return { id: z.id, anzeige: `${z.vorname} ${z.nachname}` };
    const teile = [z.zeigt_vorname ? z.vorname : null, z.zeigt_nachname ? z.nachname : null];
    const anzeige = teile.filter(Boolean).join(' ');
    return { id: z.id, anzeige: anzeige || 'ein Kind' };
  });
}

/** Die Adressen der Konten, die Kinder angemeldet haben — für die Absage-Mail. */
export async function holeElternAdressen(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(trainingId)) return [];
  const { rows } = await ausfuehrer.query<{ email: string }>(
    `SELECT DISTINCT m.email
       FROM jugendtraining_kind k JOIN mitglied m ON m.id = k.mitglied_id
      WHERE k.training_id = $1 AND k.storniert_am IS NULL`,
    [trainingId],
  );
  return rows.map((z) => z.email);
}
```

- [ ] **Schritt 4: Grün, dann committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Kinder an- und abmelden, mit Sperre und Anzeige nach Freigabe"
```

---

## Aufgabe 5: Die Endpunkte

**Dateien:**
- Ändern: `api/src/app.ts`
- Ändern: `betrieb/Caddyfile`
- Ändern: `api/caddy/anmeldung.Caddyfile`
- Anlegen: `api/tests/jugendtraining-endpunkte.test.ts`

**Schnittstellen:**
- Verbraucht: alles aus den Aufgaben 2 bis 4

- [ ] **Schritt 1: Die Endpunkte in `api/src/app.ts`**

Nach den Termin-Endpunkten einfügen. Zuerst eine Hilfe direkt neben `holeAusweis`:

```ts
  /** Wie `holeAusweis`, aber besteht auf der Guide-Rolle. */
  async function holeGuide(anfrage: { headers: Record<string, unknown> }) {
    const ausweis = await holeAusweis(anfrage);
    return ausweis?.rolle === 'guide' ? ausweis : null;
  }
```

Dann die Routen:

```ts
  app.post('/jugendtraining', async (anfrage, antwort) => {
    const guide = await holeGuide(anfrage);
    // 403 und nicht 404: Wer angemeldet ist, darf erfahren, dass es diesen
    // Weg gibt — nur nicht, dass er ihn gehen darf. Ein 404 wäre hier
    // Geheimniskrämerei ohne Gewinn.
    if (!guide) return antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });

    const koerper = anfrage.body as Record<string, unknown>;
    const beginntAm = new Date(String(koerper?.beginntAm ?? ''));
    const ort = typeof koerper?.ort === 'string' ? koerper.ort.trim() : '';
    if (Number.isNaN(beginntAm.getTime()) || ort === '') {
      return antwort.code(400).send({ fehler: 'Beginn und Ort werden gebraucht.' });
    }

    const training = await jugend.legeTrainingAn(
      pool,
      {
        beginntAm,
        endetAm: koerper.endetAm ? new Date(String(koerper.endetAm)) : null,
        ort,
        hinweis: typeof koerper.hinweis === 'string' ? koerper.hinweis.trim() : null,
        plaetze: typeof koerper.plaetze === 'number' ? koerper.plaetze : null,
        guidesNoetig: typeof koerper.guidesNoetig === 'number' ? koerper.guidesNoetig : undefined,
      },
      guide.mitgliedId,
      jetzt(),
    );

    // Erst antworten, dann fragen: Der Mailversand darf die Antwort nicht
    // aufhalten — dieselbe Regel wie bei den Magic Links.
    antwort.code(201).send(training);
    imHintergrund(() => fragteGuides(training));
    return antwort;
  });

  app.get('/jugendtraining', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const trainings = await jugend.holeTrainings(pool, ausweis.rolle === 'guide', jetzt());
    const mitZahlen = await Promise.all(
      trainings.map(async (t) => ({
        ...t,
        belegt: await jugend.holeBelegungTraining(pool, t.id),
      })),
    );
    return antwort.send(mitZahlen);
  });

  app.get('/jugendtraining/:id', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const training = await jugend.holeTraining(pool, id);
    const istGuide = ausweis.rolle === 'guide';
    // Ein Entwurf ist für alle anderen dasselbe wie ein Training, das es
    // nicht gibt — sonst verriete der Statuscode seine Existenz.
    if (!training || (training.zustand === 'entwurf' && !istGuide)) {
      return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });
    }

    return antwort.send({
      ...training,
      belegt: await jugend.holeBelegungTraining(pool, id),
      kinder: await jugend.holeKinder(pool, id, istGuide),
      guides: istGuide ? await jugend.holeGuideAntworten(pool, id) : undefined,
    });
  });

  app.patch('/jugendtraining/:id', async (anfrage, antwort) => {
    const guide = await holeGuide(anfrage);
    if (!guide) return antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    const geaendert = await jugend.aendereTraining(pool, id, {
      ...(koerper.beginntAm ? { beginntAm: new Date(String(koerper.beginntAm)) } : {}),
      ...(typeof koerper.ort === 'string' ? { ort: koerper.ort.trim() } : {}),
      ...('hinweis' in koerper ? { hinweis: koerper.hinweis === null ? null : String(koerper.hinweis) } : {}),
      ...('plaetze' in koerper ? { plaetze: koerper.plaetze === null ? null : Number(koerper.plaetze) } : {}),
    });
    if (!geaendert) return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });
    return antwort.send(geaendert);
  });

  app.post('/jugendtraining/:id/veroeffentlichen', async (anfrage, antwort) => {
    const guide = await holeGuide(anfrage);
    if (!guide) return antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });

    const { id } = anfrage.params as { id: string };
    const ergebnis = await jugend.veroeffentliche(pool, id, jetzt());
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' })
        : antwort.code(409).send({ fehler: 'Dieses Training ist nicht mehr im Entwurf.' });
    }

    antwort.send(ergebnis.training);
    imHintergrund(() => benachrichtigeAbonnenten(ergebnis.training));
    return antwort;
  });

  app.post('/jugendtraining/:id/absage', async (anfrage, antwort) => {
    const guide = await holeGuide(anfrage);
    if (!guide) return antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    const grund = typeof koerper?.grund === 'string' ? koerper.grund.trim() : '';
    // Ein Grund ist Pflicht: „abgesagt" ohne Warum lässt acht Familien
    // rätseln, und jemand fährt trotzdem hin.
    if (grund === '') return antwort.code(400).send({ fehler: 'Bitte einen Grund angeben.' });

    // Die Adressen **vor** der Absage holen: Danach ändert sich zwar nichts
    // an den Anmeldungen, aber die Reihenfolge macht es unabhängig davon,
    // ob später einmal beim Absagen aufgeräumt wird.
    const eltern = await jugend.holeElternAdressen(pool, id);
    const ergebnis = await jugend.sageAb(pool, id, grund, jetzt());
    if (!ergebnis.ok) {
      return ergebnis.grund === 'unbekannt'
        ? antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' })
        : antwort.code(409).send({ fehler: 'Dieses Training ist schon abgesagt.' });
    }

    antwort.send(ergebnis.training);
    imHintergrund(() => meldeAbsage(ergebnis.training, eltern));
    return antwort;
  });

  app.put('/jugendtraining/:id/guide', async (anfrage, antwort) => {
    const guide = await holeGuide(anfrage);
    if (!guide) return antwort.code(403).send({ fehler: 'Das dürfen nur Guides.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    if (typeof koerper?.zusage !== 'boolean') {
      return antwort.code(400).send({ fehler: 'Zusage oder Absage angeben.' });
    }

    const gesetzt = await jugend.setzeGuideAntwort(pool, id, guide.mitgliedId, koerper.zusage, jetzt());
    if (!gesetzt) return antwort.code(404).send({ fehler: 'Dieses Training gibt es nicht.' });
    return antwort.code(204).send();
  });

  app.post('/jugendtraining/:id/kinder', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id } = anfrage.params as { id: string };
    const koerper = anfrage.body as Record<string, unknown>;
    const vorname = typeof koerper?.vorname === 'string' ? koerper.vorname.trim() : '';
    const nachname = typeof koerper?.nachname === 'string' ? koerper.nachname.trim() : '';
    if (vorname === '' || nachname === '') {
      return antwort.code(400).send({ fehler: 'Vor- und Nachname werden gebraucht.' });
    }

    const ergebnis = await jugend.meldeKindAn(
      pool,
      id,
      ausweis.mitgliedId,
      {
        vorname,
        nachname,
        zeigtVorname: koerper.zeigtVorname !== false,
        zeigtNachname: koerper.zeigtNachname === true,
      },
      jetzt(),
    );

    if (!ergebnis.ok) {
      const texte: Record<string, [number, string]> = {
        unbekannt: [404, 'Dieses Training gibt es nicht.'],
        'nicht-offen': [409, 'Für dieses Training kann man sich nicht anmelden.'],
        vorbei: [409, 'Dieses Training ist vorbei.'],
        voll: [409, 'Dieses Training ist voll.'],
        'schon-zwei': [409, 'Mehr als zwei Kinder gehen über ein Konto nicht.'],
      };
      const [code, text] = texte[ergebnis.grund]!;
      return antwort.code(code).send({ fehler: text });
    }

    return antwort.code(201).send({ kindId: ergebnis.kindId, belegt: ergebnis.belegt });
  });

  app.delete('/jugendtraining/:id/kinder/:kindId', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const { id, kindId } = anfrage.params as { id: string; kindId: string };
    const weg = await jugend.meldeKindAb(pool, id, ausweis.mitgliedId, kindId, jetzt());
    // 404 auch für ein fremdes Kind: „Gibt es nicht" und „gehört dir nicht"
    // dürfen sich für den Anfragenden nicht unterscheiden.
    if (!weg) return antwort.code(404).send({ fehler: 'Diese Anmeldung gibt es nicht.' });
    return antwort.code(204).send();
  });
```

Import oben ergänzen:

```ts
import * as jugend from './jugendtraining.ts';
```

Die drei Mailfunktionen (`fragteGuides`, `benachrichtigeAbonnenten`, `meldeAbsage`) kommen in Aufgabe 6. **Bis dahin genügen Platzhalter, die nichts tun** — schreib sie als leere `async` Funktionen mit einem Kommentar, der auf Aufgabe 6 zeigt, damit die Datei übersetzt.

- [ ] **Schritt 2: Ratenbegrenzung — beide Stellen**

In `api/src/app.ts` bei `IP_GESCHUETZTE_PFAD_PRAEFIXE` ergänzen:

```ts
const IP_GESCHUETZTE_PFAD_PRAEFIXE = [
  '/anmeldung/', '/sitzung', '/konto', '/termine/', '/gast/', '/jugendtraining',
];
```

Und `NUR_SCHREIBEND_GEZAEHLT` erweitern, damit die Liste nicht bei jedem Öffnen zählt. Da die Konstante heute ein einzelner String ist, wird sie zu einer Liste:

```ts
const NUR_SCHREIBEND_GEZAEHLT = ['/termine/', '/jugendtraining'];

function zaehltGegenIpGrenze(methode: string, pfad: string): boolean {
  if (!IP_GESCHUETZTE_PFAD_PRAEFIXE.some((p) => pfad.startsWith(p))) return false;
  return !(methode === 'GET' && NUR_SCHREIBEND_GEZAEHLT.some((p) => pfad.startsWith(p)));
}
```

In **beiden** Caddyfiles (`betrieb/Caddyfile` und `api/caddy/anmeldung.Caddyfile`) die Zone `tourenanmeldung` um den Pfad erweitern:

```
		zone tourenanmeldung {
			match {
				path /termine/* /jugendtraining*
				method POST DELETE PATCH PUT
			}
			key {remote_host}
			events 10
			window 1m
		}
```

**Beide Dateien, nicht eine.** Wer nur die geprüfte ändert, hat eine Vorlage, die davon abweicht — und umgekehrt greift die Änderung gar nicht.

- [ ] **Schritt 3: Endpunkt-Tests schreiben**

`api/tests/jugendtraining-endpunkte.test.ts` — nach dem Muster von `termine-endpunkte.test.ts`. Mindestens diese Fälle, jeder mit einem Satz, warum er zählt:

```ts
it('weist einen Nicht-Guide beim Anlegen mit 403 ab', async () => { /* … */ });
it('zeigt Entwürfe nur Guides — für andere ist es ein 404', async () => { /* … */ });
it('gibt einem Mitglied keine Guide-Liste heraus', async () => { /* … */ });
it('verlangt beim Absagen einen Grund', async () => { /* … */ });
it('lehnt ein zweites Veröffentlichen mit 409 ab', async () => { /* … */ });
it('meldet ein fremdes Kind mit 404 ab, nicht mit 403', async () => { /* … */ });
```

Der Aufbau (App bauen, Mitglied und Sitzung anlegen, Bearer-Token setzen) steht in `termine-endpunkte.test.ts` — übernimm ihn von dort, statt ihn zu erfinden.

- [ ] **Schritt 4: Prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/ betrieb/
git commit -m "Endpunkte für Jugendtrainings, samt Ratenbegrenzung in beiden Caddyfiles"
```

---

## Aufgabe 6: Die Mails und der Abonnement-Schalter

**Dateien:**
- Anlegen: `api/src/jugendmails.ts`
- Anlegen: `api/tests/jugendmails.test.ts`
- Ändern: `api/src/app.ts` — Platzhalter ersetzen, Abonnement-Endpunkt
- Ändern: `api/src/konto.ts` — Abonnement in der Auskunft

**Schnittstellen:**
- Liefert: `baueGuideAnfrage(training: Training): { betreff: string; text: string }`
- Liefert: `baueVeroeffentlichung(training: Training): { betreff: string; text: string }`
- Liefert: `baueAbsage(training: Training): { betreff: string; text: string }`
- Liefert: `holeAbonnenten(pool): Promise<string[]>`
- Liefert: `setzeAbonnement(pool, mitgliedId: string, an: boolean): Promise<void>`

- [ ] **Schritt 1: Tests für die Texte**

Reine Rechenlogik, ohne Datenbank und ohne Mailer — genau deshalb prüfbar:

```ts
import { describe, expect, it } from 'vitest';
import { baueAbsage, baueGuideAnfrage, baueVeroeffentlichung } from '../src/jugendmails.ts';

const training = {
  id: 'abc',
  beginntAm: new Date('2026-08-09T08:30:00Z'),
  endetAm: null,
  ort: 'Wanderparkplatz Kalkofen',
  hinweis: null,
  plaetze: null,
  guidesNoetig: 2,
  zustand: 'veroeffentlicht' as const,
  absagegrund: null,
  angelegtVon: 'x',
};

describe('baueGuideAnfrage', () => {
  it('nennt Tag, Uhrzeit und Ort in Vereinszeit', () => {
    // 08:30 UTC sind 10:30 in Bielefeld. Wer hier UTC anzeigt, schickt
    // Guides zwei Stunden zu früh los.
    const { text } = baueGuideAnfrage(training);
    expect(text).toContain('Sonntag, 9. August');
    expect(text).toContain('10:30');
    expect(text).toContain('Wanderparkplatz Kalkofen');
  });

  it('sagt, wie viele Guides gebraucht werden', () => {
    expect(baueGuideAnfrage(training).text).toContain('2');
  });
});

describe('baueAbsage', () => {
  it('nennt den Grund — eine Absage ohne Warum lässt Familien rätseln', () => {
    const { text } = baueAbsage({ ...training, zustand: 'abgesagt', absagegrund: 'Dauerregen' });
    expect(text).toContain('Dauerregen');
  });
});

describe('Umlaute', () => {
  it('bleiben erhalten', () => {
    expect(baueVeroeffentlichung(training).text).toMatch(/[äöüß]/);
  });
});
```

- [ ] **Schritt 2: `api/src/jugendmails.ts` schreiben**

Die Zeitformatierung geht über `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'` — **nie** über die Zeitzone des Servers. Der Server läuft in UTC; wer das vergisst, schickt Guides zwei Stunden zu früh los. Nach dem Muster von `src/features/events/format.ts`.

- [ ] **Schritt 3: Die Platzhalter in `app.ts` ersetzen**

```ts
  async function fragteGuides(training: jugend.Training): Promise<void> {
    const adressen = await jugend.holeGuideAdressen(pool);
    const { betreff, text } = jugendmails.baueGuideAnfrage(training);
    // Einzeln verschickt, nicht als Sammel-Mail: Ein Verteiler im An-Feld
    // gäbe jedem Guide die Adressen aller anderen.
    for (const adresse of adressen) {
      await mailer.sende(adresse, betreff, text).catch((fehler) => {
        log.error({ fehler: serialisiereFehler(fehler), adresse }, 'Guide-Anfrage nicht zugestellt');
      });
    }
  }
```

`benachrichtigeAbonnenten` und `meldeAbsage` analog, mit `holeAbonnenten` beziehungsweise den vorher geholten Elternadressen.

- [ ] **Schritt 4: Der Abonnement-Endpunkt**

```ts
  app.put('/konto/jugend-benachrichtigung', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const koerper = anfrage.body as Record<string, unknown>;
    if (typeof koerper?.an !== 'boolean') {
      return antwort.code(400).send({ fehler: 'An oder aus angeben.' });
    }
    await jugendmails.setzeAbonnement(pool, ausweis.mitgliedId, koerper.an);
    return antwort.code(204).send();
  });
```

Und `holeKontoAuskunft` in `api/src/konto.ts` um `jugendBenachrichtigung` erweitern, damit die App den Zustand des Schalters kennt.

- [ ] **Schritt 5: Prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Mails an Guides, Abonnenten und Eltern, plus der Abonnement-Schalter"
```

---

## Aufgabe 7: Der geteilte Link und das Aufräumen

**Dateien:**
- Ändern: `api/src/app.ts` — `GET /t/:id`
- Ändern: `api/src/aufraeumen.ts`
- Ändern: `api/tests/aufraeumen.test.ts`
- Ändern: `betrieb/Caddyfile`, `api/caddy/anmeldung.Caddyfile`

- [ ] **Schritt 1: Die kleine Seite**

```ts
  /**
   * Das Ziel eines geteilten Links — der **einzige** Pfad ohne Token.
   *
   * Er zeigt bewusst wenig: kein Ort, keine Uhrzeit, keine Teilnehmer.
   * WhatsApp-Nachrichten werden weitergeleitet, und ein Link ist kein
   * Zugangsschutz. Im Nachrichtentext selbst dürfen Ort und Zeit stehen —
   * die gehen heute ohnehin durch dieselbe Gruppe.
   *
   * Für ein unbekanntes Kürzel antwortet er **genauso** wie für ein
   * bekanntes: gleiche Seite, gleicher Statuscode. Sonst wäre er ein
   * Auskunftsdienst darüber, welche Kennungen existieren — dieselbe
   * Überlegung wie bei `/anmeldung/anfordern`.
   */
  app.get('/t/:id', async (_anfrage, antwort) => {
    return antwort.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MTB Bielefeld e.V.</title></head>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Jugendtraining</h1>
<p>Die Einzelheiten stehen in der App des MTB Bielefeld e.V. — dort kannst du
dein Kind auch anmelden.</p>
<p><a href="mtbie://">App öffnen</a></p>
</body></html>`);
  });
```

In **beide** Caddyfiles die Zone `anmeldung` um `/t/*` erweitern: Der Pfad ist ohne Token erreichbar und gehört deshalb gebremst.

- [ ] **Schritt 2: Kindernamen nach 30 Tagen löschen**

In `api/src/aufraeumen.ts` ergänzen — der Mechanismus räumt schon abgelaufene Token und Sitzungen weg:

```ts
  // Kindernamen sind die empfindlichste Kategorie, die diese API speichert.
  // Nach dem Training werden sie nicht mehr gebraucht; dreißig Tage sind
  // lang genug für Rückfragen und kurz genug, um nicht zu horten. Gelöscht
  // wird die Zeile ganz, nicht nur der Name — ein Datensatz mit leeren
  // Feldern wäre Buchhaltung über ein Kind, das niemand mehr braucht.
  const kinder = await ausfuehrer.query(
    `DELETE FROM jugendtraining_kind k USING jugendtraining t
      WHERE k.training_id = t.id
        AND COALESCE(t.endet_am, t.beginnt_am) < $1`,
    [new Date(jetzt.getTime() - 30 * 24 * 60 * 60 * 1000)],
  );
```

Die Bilanz um `kinder: kinder.rowCount ?? 0` erweitern und im Test prüfen, dass ein Kind zu einem alten Training verschwindet und eines zu einem kommenden bleibt.

- [ ] **Schritt 3: Abnahme gegen den laufenden Aufbau**

```bash
docker compose -f betrieb/docker-compose.yml up -d --build api
docker compose -f betrieb/docker-compose.yml exec api npm run rolle:setzen -- <deine Adresse> guide
```

Dann von Hand mit `curl` durchspielen: anlegen → Guides-Mail in Mailpit ansehen → zusagen → veröffentlichen → Kind anmelden → Teilnehmerliste als Guide und als Mitglied vergleichen → absagen → Absage-Mail ansehen.

**Die Teilnehmerliste zweimal ansehen — als Guide und als gewöhnliches Mitglied — ist der eigentliche Prüfstein dieses Plans.** Zeigt sie einem Mitglied den Nachnamen eines Kindes, das ihn nicht freigegeben hat, ist alles andere gleichgültig.

- [ ] **Schritt 4: Prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/ betrieb/
git commit -m "Der geteilte Link und das Löschen der Kindernamen nach 30 Tagen"
```

---

## Nach diesem Plan

Die API kann Jugendtrainings vollständig. Die App weiß noch nichts davon — das ist Plan 6.

**Was danach offen bleibt:**

- **Push.** Der Abonnement-Schalter ist die Liste, an die es andockt.
- **Die Einwilligungstexte.** Muss der Verein formulieren, nicht der Code.
- **Der Eintrag im Verzeichnis von Verarbeitungstätigkeiten** für die neue Kategorie „Namen Minderjähriger, Löschung nach 30 Tagen".
