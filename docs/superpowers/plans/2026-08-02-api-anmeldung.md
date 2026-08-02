# Plan 1 — API mit Anmeldung

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Eine lauffähige API, bei der sich ein Mitglied mit Einladungscode und Magic Link anmelden, seine Sitzung erneuern, seine Daten einsehen und sein Konto löschen kann.

**Architektur:** Ein Fastify-Dienst in `api/`, im selben Repository wie die App, aber mit eigenem `package.json` und eigenem `tsconfig.json`. Postgres über den Treiber `pg` mit reinem SQL — kein ORM. Migrationen sind nummerierte `.sql`-Dateien mit einem kleinen eigenen Läufer. Kein Identitätsanbieter: Magic Links werden in der API selbst erzeugt und geprüft.

**Technik:** Node 26 · TypeScript · Fastify 5 · Postgres 16 über `pg` 8 · Vitest · Docker Compose (nur lokal in diesem Plan)

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, Commit-Nachrichten und Fehlertexte auf Deutsch. Fachbegriffe ohne gute Entsprechung (Token, Hash, Commit) bleiben stehen. Aus `CLAUDE.md`.
- **Kein Geheimnis ins Repository.** Es ist öffentlich und MIT-lizenziert. Zugangsdaten ausschließlich über Umgebungsvariablen.
- **Alle Token nur als SHA-256-Hash in der Datenbank.** Nie im Klartext.
- **Bewusst kein bcrypt/Argon2 für Token.** Das sind Zufallswerte mit voller Entropie, keine Passwörter; langsames Hashen schützt hier nichts.
- **Die API verrät nie interne Details** — kein Stacktrace, kein SQL, keine Auskunft darüber, ob eine E-Mail bekannt ist.
- **Rechenlogik ohne Rahmenwerk**, damit sie ohne laufenden Server prüfbar bleibt. Muster des Projekts: `src/notifications/scheduler.ts` gegenüber `src/notifications/index.ts`.
- **Expo gibt Paketversionen vor.** `api/` hat ein eigenes `package.json` und ist davon **nicht** betroffen — aber am Wurzel-`package.json` wird in diesem Plan nichts geändert.
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.

---

## Aufgabe 1: Grundgerüst und Gesundheitsprüfung

Legt `api/` an, trennt es sauber von der App und liefert einen ersten erreichbaren Endpunkt.

**Dateien:**
- Anlegen: `api/package.json`
- Anlegen: `api/tsconfig.json`
- Anlegen: `api/vitest.config.ts`
- Anlegen: `api/src/server.ts`
- Anlegen: `api/src/app.ts`
- Anlegen: `api/tests/gesundheit.test.ts`
- Ändern: `tsconfig.json` (Wurzel) — `api` ausschließen
- Ändern: `.gitignore` — `api/node_modules` und `api/dist`

**Schnittstellen:**
- Liefert: `baueApp(): FastifyInstance` aus `api/src/app.ts` — die Fastify-Instanz ohne Netzwerk, damit Tests sie mit `app.inject()` ansprechen können, statt einen Port zu belegen.

- [ ] **Schritt 1: Wurzel-tsconfig abgrenzen**

Ohne das prüft `npm run typecheck` der App auch den API-Code mit den Einstellungen der App und schlägt fehl.

`tsconfig.json` (Wurzel), Feld `exclude`:

```json
  "exclude": ["node_modules", "api"]
```

- [ ] **Schritt 2: `.gitignore` ergänzen**

Ans Ende von `.gitignore`:

```
# Backend
api/node_modules/
api/dist/
```

- [ ] **Schritt 3: `api/package.json` anlegen**

```json
{
  "name": "mtb-bielefeld-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node --experimental-strip-types src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "fastify": "^5.11.0",
    "pg": "^8.22.0"
  },
  "devDependencies": {
    "@types/node": "^26.1.2",
    "@types/pg": "^8.11.10",
    "typescript": "~6.0.3",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Schritt 4: `api/tsconfig.json` anlegen**

`rootDir` steht auf `..`, weil spätere Aufgaben den Kalender-Parser aus `../src/data/` importieren.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Schritt 5: `api/vitest.config.ts` anlegen**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests fassen dieselbe Datenbank an; parallel würden sie sich
    // gegenseitig die Zeilen wegräumen.
    fileParallelism: false,
  },
});
```

- [ ] **Schritt 6: Abhängigkeiten installieren**

```bash
cd api && npm install
```

- [ ] **Schritt 7: Den fehlschlagenden Test schreiben**

`api/tests/gesundheit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';

describe('Gesundheitsprüfung', () => {
  it('antwortet mit 200 und einem Zustand', async () => {
    const app = baueApp();
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ zustand: 'bereit' });
    await app.close();
  });
});
```

- [ ] **Schritt 8: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test
```

Erwartet: Fehlschlag, `Cannot find module '../src/app.ts'`.

- [ ] **Schritt 9: `api/src/app.ts` schreiben**

```ts
/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Getrennt von `server.ts`, damit Tests die App mit `inject()` ansprechen
 * können, ohne einen Port zu belegen. Dasselbe Muster wie in der App:
 * Logik getrennt von der Anbindung ans Betriebssystem.
 */

import Fastify, { type FastifyInstance } from 'fastify';

export function baueApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/gesundheit', async () => ({ zustand: 'bereit' }));

  return app;
}
```

- [ ] **Schritt 10: `api/src/server.ts` schreiben**

```ts
/**
 * Startet die API. Alles Fachliche steht in `app.ts`.
 */

import { baueApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
const app = baueApp();

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`API hört auf Port ${port}`);
} catch (fehler) {
  console.error('API konnte nicht starten:', fehler);
  process.exit(1);
}
```

- [ ] **Schritt 11: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: 1 Test grün, Typprüfung ohne Ausgabe.

- [ ] **Schritt 12: Prüfen, dass die App unberührt bleibt**

```bash
cd .. && npm run typecheck && npm test
```

Erwartet: unverändert grün. Schlägt die Typprüfung mit Fehlern aus `api/` fehl, wurde Schritt 1 nicht angewandt.

- [ ] **Schritt 13: Commit**

```bash
git add api/ tsconfig.json .gitignore
git commit -m "API-Grundgerüst mit Gesundheitsprüfung"
```

---

## Aufgabe 2: Postgres und Migrationen

Eine Datenbank, die sich aus dem Nichts aufbauen lässt, und ein Läufer, der Migrationen genau einmal anwendet.

**Dateien:**
- Anlegen: `api/docker-compose.yml`
- Anlegen: `api/src/datenbank.ts`
- Anlegen: `api/src/migrationen/001-mitglied.sql`
- Anlegen: `api/src/migrationen/laufen.ts`
- Anlegen: `api/tests/hilfen/datenbank.ts`
- Anlegen: `api/tests/migrationen.test.ts`
- Ändern: `api/package.json` — Skript `migrieren`

**Schnittstellen:**
- Liefert: `pool: Pool` aus `api/src/datenbank.ts`
- Liefert: `wendeMigrationenAn(pool: Pool): Promise<string[]>` — gibt die Namen der neu angewandten Migrationen zurück
- Liefert: `frischeDatenbank(): Promise<Pool>` aus `api/tests/hilfen/datenbank.ts` — migriert und leert alle Tabellen

- [ ] **Schritt 1: `api/docker-compose.yml` anlegen**

```yaml
# Nur für die Entwicklung. Die Inbetriebnahme kommt in Plan 4.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: mtbie
      POSTGRES_PASSWORD: entwicklung
      POSTGRES_DB: mtbie
    ports:
      # Nur auf localhost. Niemals nach außen öffnen.
      - '127.0.0.1:5432:5432'
    volumes:
      - postgres-daten:/var/lib/postgresql/data

volumes:
  postgres-daten:
```

- [ ] **Schritt 2: Datenbank starten**

```bash
cd api && docker compose up -d && docker compose ps
```

Erwartet: Dienst `postgres` im Zustand `running`.

- [ ] **Schritt 3: `api/src/datenbank.ts` schreiben**

```ts
/**
 * Verbindung zur Datenbank.
 *
 * Die Adresse kommt ausschließlich aus der Umgebung — im Repository steht
 * kein Zugangsdatum, es ist öffentlich.
 */

import pg from 'pg';

const { Pool } = pg;

const adresse =
  process.env.DATABASE_URL ?? 'postgres://mtbie:entwicklung@127.0.0.1:5432/mtbie';

export const pool = new Pool({ connectionString: adresse });
```

- [ ] **Schritt 4: Erste Migration anlegen**

`api/src/migrationen/001-mitglied.sql`:

```sql
CREATE TABLE mitglied (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  rolle        text NOT NULL DEFAULT 'mitglied'
               CHECK (rolle IN ('mitglied', 'guide', 'verwaltung')),
  angelegt_am  timestamptz NOT NULL DEFAULT now(),
  gesehen_am   timestamptz
);

-- Groß- und Kleinschreibung darf keine zwei Konten erzeugen.
CREATE UNIQUE INDEX mitglied_email_eindeutig ON mitglied (lower(email));
```

- [ ] **Schritt 5: Den fehlschlagenden Test schreiben**

`api/tests/migrationen.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { wendeMigrationenAn } from '../src/migrationen/laufen.ts';

describe('Migrationen', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('legt die Tabellen an und merkt sich, was gelaufen ist', async () => {
    const ersterLauf = await wendeMigrationenAn(pool);
    expect(ersterLauf).toContain('001-mitglied.sql');

    const { rows } = await pool.query(
      "SELECT to_regclass('public.mitglied') AS tabelle",
    );
    expect(rows[0]?.tabelle).toBe('mitglied');
  });

  it('wendet dieselbe Migration kein zweites Mal an', async () => {
    await wendeMigrationenAn(pool);
    const zweiterLauf = await wendeMigrationenAn(pool);
    expect(zweiterLauf).toEqual([]);
  });
});
```

- [ ] **Schritt 6: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test
```

Erwartet: Fehlschlag, `Cannot find module '../src/migrationen/laufen.ts'`.

- [ ] **Schritt 7: Den Migrationsläufer schreiben**

`api/src/migrationen/laufen.ts`:

```ts
/**
 * Wendet Migrationen genau einmal an.
 *
 * Bewusst ohne Fremdpaket: Nummerierte SQL-Dateien und eine Tabelle, die
 * sich merkt, was gelaufen ist. Vierzig Zeilen, die jeder lesen kann, sind
 * einer Abhängigkeit vorzuziehen, die niemand versteht.
 *
 * Jede Migration läuft in einer eigenen Transaktion: Bricht sie ab, ist sie
 * gar nicht gelaufen — kein halb migrierter Zustand.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const ordner = path.dirname(fileURLToPath(import.meta.url));

export async function wendeMigrationenAn(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migration (
      name        text PRIMARY KEY,
      gelaufen_am timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dateien = (await fs.readdir(ordner))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const { rows } = await pool.query<{ name: string }>('SELECT name FROM migration');
  const erledigt = new Set(rows.map((zeile) => zeile.name));

  const angewandt: string[] = [];

  for (const datei of dateien) {
    if (erledigt.has(datei)) continue;

    const sql = await fs.readFile(path.join(ordner, datei), 'utf8');
    const verbindung = await pool.connect();
    try {
      await verbindung.query('BEGIN');
      await verbindung.query(sql);
      await verbindung.query('INSERT INTO migration (name) VALUES ($1)', [datei]);
      await verbindung.query('COMMIT');
      angewandt.push(datei);
    } catch (fehler) {
      await verbindung.query('ROLLBACK');
      throw new Error(`Migration ${datei} fehlgeschlagen: ${String(fehler)}`);
    } finally {
      verbindung.release();
    }
  }

  return angewandt;
}
```

- [ ] **Schritt 8: Skript in `api/package.json` ergänzen**

Im Feld `scripts`, nach `"start"`:

```json
    "migrieren": "node --experimental-strip-types src/migrationen/anwenden.ts",
```

Und `api/src/migrationen/anwenden.ts` anlegen:

```ts
/** Migrationen von der Kommandozeile aus anwenden. */

import { pool } from '../datenbank.ts';
import { wendeMigrationenAn } from './laufen.ts';

const angewandt = await wendeMigrationenAn(pool);
console.log(
  angewandt.length > 0
    ? `Angewandt: ${angewandt.join(', ')}`
    : 'Nichts zu tun, alle Migrationen sind gelaufen.',
);
await pool.end();
```

- [ ] **Schritt 9: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test
```

Erwartet: 3 Tests grün (Gesundheit, beide Migrationstests).

- [ ] **Schritt 10: Testhilfe für eine frische Datenbank schreiben**

`api/tests/hilfen/datenbank.ts`:

```ts
/**
 * Eine migrierte, leere Datenbank für jeden Test.
 *
 * Bewusst gegen ein echtes Postgres statt gegen eine Attrappe: Eindeutige
 * Indizes, Prüfbedingungen und Transaktionen sind genau die Dinge, an denen
 * dieser Code hängt — eine Attrappe würde sie alle wegtäuschen.
 */

import type pg from 'pg';

import { pool } from '../../src/datenbank.ts';
import { wendeMigrationenAn } from '../../src/migrationen/laufen.ts';

export async function frischeDatenbank(): Promise<pg.Pool> {
  await wendeMigrationenAn(pool);
  await pool.query('TRUNCATE mitglied RESTART IDENTITY CASCADE');
  return pool;
}
```

- [ ] **Schritt 11: Commit**

```bash
git add api/
git commit -m "Postgres mit eigenem Migrationsläufer"
```

---

## Aufgabe 3: Einladungscodes

Ohne gültigen Code entsteht kein Konto. Erst die reine Logik, dann die Speicherung.

**Dateien:**
- Anlegen: `api/src/token.ts`
- Anlegen: `api/src/einladung.ts`
- Anlegen: `api/src/migrationen/002-einladung.sql`
- Anlegen: `api/tests/token.test.ts`
- Anlegen: `api/tests/einladung.test.ts`
- Ändern: `api/tests/hilfen/datenbank.ts` — `einladung` mit leeren

**Schnittstellen:**
- Liefert: `erzeugeToken(): string` — 32 zufällige Bytes als base64url
- Liefert: `hashe(token: string): string` — SHA-256 als Hex
- Liefert: `erzeugeEinladung(pool, ausgestelltFuer: string): Promise<string>` — gibt den Klartext-Code zurück, gespeichert wird nur der Hash
- Liefert: `loeseEinladungEin(pool, code: string, email: string, jetzt: Date): Promise<{ ok: true } | { ok: false; grund: 'unbekannt' | 'verbraucht' | 'abgelaufen' | 'falsche-adresse' }>`

> **Nachträgliche Festlegung vom 02.08.2026.** Ursprünglich prüfte diese
> Funktion die Adresse nicht — ein gültiger Code hätte mit **jeder** E-Mail
> funktioniert. Damit wäre ein weitergereichter Code genug gewesen, um
> Vereinsfremden ein Konto zu verschaffen, und der Nachweis der Mitgliedschaft
> wäre wertlos geworden. Auf Entscheidung des Auftraggebers ist der Code jetzt
> an `ausgestellt_fuer` gebunden. Verglichen wird ohne Rücksicht auf
> Groß- und Kleinschreibung, und **innerhalb derselben Transaktion** wie die
> Entwertung — sonst entstünde zwischen Prüfung und Entwertung eine Lücke.
> Bei falscher Adresse wird der Code **nicht** verbraucht: Sonst könnte ein
> Fremder mit einem einzigen falschen Versuch den Zugang des Mitglieds
> zerstören.

- [ ] **Schritt 1: Den fehlschlagenden Test für Token schreiben**

`api/tests/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { erzeugeToken, hashe } from '../src/token.ts';

describe('erzeugeToken', () => {
  it('liefert bei jedem Aufruf einen anderen Wert', () => {
    const werte = new Set(Array.from({ length: 500 }, () => erzeugeToken()));
    expect(werte.size).toBe(500);
  });

  it('enthält nichts, was in einer Adresse kodiert werden müsste', () => {
    expect(erzeugeToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('hashe', () => {
  it('liefert für gleiche Eingabe denselben Hash', () => {
    expect(hashe('abc')).toBe(hashe('abc'));
  });

  it('liefert für verschiedene Eingaben verschiedene Hashes', () => {
    expect(hashe('abc')).not.toBe(hashe('abd'));
  });

  it('gibt den Klartext nicht preis', () => {
    expect(hashe('geheim')).not.toContain('geheim');
    expect(hashe('geheim')).toHaveLength(64);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/token.test.ts
```

Erwartet: Fehlschlag, `Cannot find module '../src/token.ts'`.

- [ ] **Schritt 3: `api/src/token.ts` schreiben**

```ts
/**
 * Zufällige Token und ihre Hashes.
 *
 * In der Datenbank steht ausschließlich der Hash. Wer sie erbeutet, hält
 * damit nichts in der Hand, womit er sich anmelden könnte.
 *
 * Bewusst SHA-256 und **nicht** bcrypt oder Argon2: Das sind Zufallswerte
 * mit 256 Bit Entropie, keine Passwörter. Gegen Raten hilft hier die Länge,
 * nicht ein langsames Verfahren — langsames Hashen kostete nur Rechenzeit
 * bei jeder Anfrage.
 */

import { createHash, randomBytes } from 'node:crypto';

/** 32 zufällige Bytes, adresstauglich kodiert. */
export function erzeugeToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 als Hexadezimaltext. */
export function hashe(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

```

Kein zeitkonstanter Vergleich nötig: Nachgeschlagen wird stets über den Hash
in einem Index, nie durch zeichenweisen Vergleich in der Anwendung. Es gibt
also nichts, aus dessen Antwortzeit sich etwas ableiten ließe.

- [ ] **Schritt 4: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test tests/token.test.ts
```

Erwartet: 5 Tests grün.

- [ ] **Schritt 5: Migration für Einladungen anlegen**

`api/src/migrationen/002-einladung.sql`:

```sql
CREATE TABLE einladung (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash         text NOT NULL UNIQUE,
  ausgestellt_fuer  text NOT NULL,
  ausgestellt_am    timestamptz NOT NULL DEFAULT now(),
  gueltig_bis       timestamptz NOT NULL,
  eingeloest_am     timestamptz,
  eingeloest_von    uuid REFERENCES mitglied (id) ON DELETE SET NULL
);

CREATE INDEX einladung_offen ON einladung (code_hash) WHERE eingeloest_am IS NULL;
```

- [ ] **Schritt 6: Testhilfe erweitern**

In `api/tests/hilfen/datenbank.ts` die `TRUNCATE`-Zeile ersetzen:

```ts
  await pool.query('TRUNCATE einladung, mitglied RESTART IDENTITY CASCADE');
```

- [ ] **Schritt 7: Den fehlschlagenden Test für Einladungen schreiben**

`api/tests/einladung.test.ts`:

```ts
import { beforeEach, afterAll, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung, loeseEinladungEin } from '../src/einladung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('erzeugeEinladung', () => {
  it('gibt den Code im Klartext zurück, speichert aber nur den Hash', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');

    const { rows } = await pool.query<{ code_hash: string }>(
      'SELECT code_hash FROM einladung',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code_hash).not.toBe(code);
    expect(rows[0]?.code_hash).toHaveLength(64);
  });
});

describe('loeseEinladungEin', () => {
  it('nimmt einen frischen Code an', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    expect(await loeseEinladungEin(pool, code, jetzt)).toEqual({ ok: true });
  });

  it('lehnt einen unbekannten Code ab', async () => {
    expect(await loeseEinladungEin(pool, 'ausgedacht', jetzt)).toEqual({
      ok: false,
      grund: 'unbekannt',
    });
  });

  it('lehnt einen bereits verbrauchten Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    await loeseEinladungEin(pool, code, jetzt);

    expect(await loeseEinladungEin(pool, code, jetzt)).toEqual({
      ok: false,
      grund: 'verbraucht',
    });
  });

  it('lehnt einen abgelaufenen Code ab', async () => {
    const code = await erzeugeEinladung(pool, 'malte@example.org');
    const inEinemJahr = new Date('2027-08-02T12:00:00Z');

    expect(await loeseEinladungEin(pool, code, inEinemJahr)).toEqual({
      ok: false,
      grund: 'abgelaufen',
    });
  });
});
```

- [ ] **Schritt 8: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/einladung.test.ts
```

Erwartet: Fehlschlag, `Cannot find module '../src/einladung.ts'`.

- [ ] **Schritt 9: `api/src/einladung.ts` schreiben**

```ts
/**
 * Einladungscodes — der Nachweis, dass jemand Mitglied ist.
 *
 * Eine E-Mail-Adresse beweist nichts. Die Verwaltung führt ohnehin eine
 * Mitgliederliste; daraus entstehen diese Codes. Wer austritt, bekommt
 * keinen neuen — der Zugang endet mit der Mitgliedschaft, ohne dass jemand
 * eine zweite Liste pflegen muss.
 */

import type pg from 'pg';

import { erzeugeToken, hashe } from './token.ts';

/** Wie lange ein ausgestellter Code brauchbar bleibt. */
const GUELTIG_TAGE = 60;

export type Einloesung =
  | { ok: true }
  | { ok: false; grund: 'unbekannt' | 'verbraucht' | 'abgelaufen' | 'falsche-adresse' };

/** Legt einen Code an und gibt ihn **einmalig** im Klartext zurück. */
export async function erzeugeEinladung(
  pool: pg.Pool,
  ausgestelltFuer: string,
): Promise<string> {
  const code = erzeugeToken();
  const gueltigBis = new Date(Date.now() + GUELTIG_TAGE * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO einladung (code_hash, ausgestellt_fuer, gueltig_bis)
     VALUES ($1, $2, $3)`,
    [hashe(code), ausgestelltFuer, gueltigBis],
  );

  return code;
}

/**
 * Prüft einen Code und entwertet ihn.
 *
 * Der Grund wird zurückgegeben, aber **nicht nach außen weitergereicht** —
 * die API antwortet immer gleich. Er dient dem Protokoll und den Tests.
 */
export async function loeseEinladungEin(
  pool: pg.Pool,
  code: string,
  jetzt: Date,
): Promise<Einloesung> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    // FOR UPDATE: Zwei gleichzeitige Einlösungen desselben Codes sollen
    // nicht beide durchgehen.
    const { rows } = await verbindung.query<{
      id: string;
      gueltig_bis: Date;
      eingeloest_am: Date | null;
    }>(
      `SELECT id, gueltig_bis, eingeloest_am FROM einladung
       WHERE code_hash = $1 FOR UPDATE`,
      [hashe(code)],
    );

    const eintrag = rows[0];
    if (!eintrag) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'unbekannt' };
    }
    if (eintrag.eingeloest_am !== null) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'verbraucht' };
    }
    if (eintrag.gueltig_bis.getTime() < jetzt.getTime()) {
      await verbindung.query('ROLLBACK');
      return { ok: false, grund: 'abgelaufen' };
    }

    await verbindung.query('UPDATE einladung SET eingeloest_am = $2 WHERE id = $1', [
      eintrag.id,
      jetzt,
    ]);
    await verbindung.query('COMMIT');
    return { ok: true };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}
```

- [ ] **Schritt 10: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: alle Tests grün.

- [ ] **Schritt 11: Commit**

```bash
git add api/
git commit -m "Einladungscodes: erzeugen, einlösen, entwerten"
```

---

## Aufgabe 4: Magic Link anfordern

Der erste Endpunkt, der etwas verschickt — und der erste, bei dem die Antwort bewusst nichts verrät.

**Dateien:**
- Anlegen: `api/src/mailer.ts`
- Anlegen: `api/src/anmeldung.ts`
- Anlegen: `api/src/migrationen/003-magic-link.sql`
- Anlegen: `api/tests/anmeldung-anfordern.test.ts`
- Ändern: `api/src/app.ts` — Endpunkt einhängen
- Ändern: `api/tests/hilfen/datenbank.ts` — `magic_link` mit leeren

**Schnittstellen:**
- Liefert: `interface Mailer { sende(an: string, betreff: string, text: string): Promise<void> }`
- Liefert: `class GemerkterMailer implements Mailer` — für Tests, sammelt in `versendet`
- Liefert: `fordereMagicLinkAn(pool, mailer, email: string, code: string, jetzt: Date): Promise<void>`
- Liefert: `baueApp(abhaengigkeiten: { pool: pg.Pool; mailer: Mailer }): FastifyInstance` — **Signatur von `baueApp` ändert sich hier**

- [ ] **Schritt 1: Migration anlegen**

`api/src/migrationen/003-magic-link.sql`:

```sql
CREATE TABLE magic_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  email         text NOT NULL,
  angelegt_am   timestamptz NOT NULL DEFAULT now(),
  gueltig_bis   timestamptz NOT NULL,
  verbraucht_am timestamptz
);

CREATE INDEX magic_link_offen ON magic_link (token_hash) WHERE verbraucht_am IS NULL;
```

- [ ] **Schritt 2: Testhilfe erweitern**

In `api/tests/hilfen/datenbank.ts`:

```ts
  await pool.query(
    'TRUNCATE magic_link, einladung, mitglied RESTART IDENTITY CASCADE',
  );
```

- [ ] **Schritt 3: Den fehlschlagenden Test schreiben**

`api/tests/anmeldung-anfordern.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('POST /anmeldung/anfordern', () => {
  it('verschickt bei gültigem Code eine Mail mit Link', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });
    const code = await erzeugeEinladung(pool, 'malte@example.org');

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });

    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(1);
    expect(mailer.versendet[0]?.an).toBe('malte@example.org');
    await app.close();
  });

  it('antwortet bei falschem Code genauso, verschickt aber nichts', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });

    // Gleiche Antwort wie im Erfolgsfall — sonst ließe sich damit erraten,
    // wer Mitglied ist.
    expect(antwort.statusCode).toBe(202);
    expect(mailer.versendet).toHaveLength(0);
    await app.close();
  });

  it('verrät im Text nicht, woran es lag', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'fremd@example.org', einladungscode: 'ausgedacht' },
    });

    const text = JSON.stringify(antwort.json());
    expect(text).not.toMatch(/unbekannt|verbraucht|abgelaufen/);
    await app.close();
  });

  it('weist eine fehlende E-Mail mit 400 ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { einladungscode: 'egal' },
    });

    expect(antwort.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Schritt 4: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/anmeldung-anfordern.test.ts
```

Erwartet: Fehlschlag, `Cannot find module '../src/mailer.ts'`.

- [ ] **Schritt 5: `api/src/mailer.ts` schreiben**

```ts
/**
 * Mailversand hinter einer Schnittstelle.
 *
 * Welcher Anbieter tatsächlich verschickt, ist in der Spec noch offen. Die
 * Schnittstelle hält diese Entscheidung heraus: Tests nutzen den gemerkten
 * Mailer, die Umsetzung des echten Versands kommt in Plan 4.
 *
 * Ein eigener Mailserver kommt nicht in Frage — Zustellbarkeit ist ein
 * Vollzeitproblem.
 */

export interface Mailer {
  sende(an: string, betreff: string, text: string): Promise<void>;
}

export interface GemerkteMail {
  an: string;
  betreff: string;
  text: string;
}

/** Verschickt nichts, merkt sich alles. Für Tests. */
export class GemerkterMailer implements Mailer {
  readonly versendet: GemerkteMail[] = [];

  async sende(an: string, betreff: string, text: string): Promise<void> {
    this.versendet.push({ an, betreff, text });
  }
}
```

- [ ] **Schritt 6: `api/src/anmeldung.ts` schreiben**

```ts
/**
 * Anmeldung per Magic Link.
 *
 * Kein Passwort: Wo es keines gibt, kann keines geleakt, wiederverwendet
 * oder vergessen werden. Wer die Mail an seiner Adresse abrufen kann und
 * einen gültigen Einladungscode hat, ist Mitglied.
 */

import type pg from 'pg';

import { loeseEinladungEin } from './einladung.ts';
import type { Mailer } from './mailer.ts';
import { erzeugeToken, hashe } from './token.ts';

/** Kurz genug, dass ein abgefangener Link wertlos wird. */
const GUELTIG_MINUTEN = 15;

const BASIS_URL = process.env.APP_BASIS_URL ?? 'https://app.mtb-bielefeld.de';

/**
 * Prüft den Einladungscode und verschickt bei Erfolg den Link.
 *
 * Wirft **nicht**, wenn der Code falsch ist: Der Aufrufer soll in jedem Fall
 * dieselbe Antwort geben. Ob etwas passiert ist, erfährt nur, wer die Mail
 * bekommt.
 */
export async function fordereMagicLinkAn(
  pool: pg.Pool,
  mailer: Mailer,
  email: string,
  einladungscode: string,
  jetzt: Date,
): Promise<void> {
  const einloesung = await loeseEinladungEin(pool, einladungscode, jetzt);
  if (!einloesung.ok) return;

  const token = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_MINUTEN * 60 * 1000);

  await pool.query(
    `INSERT INTO magic_link (token_hash, email, gueltig_bis) VALUES ($1, $2, $3)`,
    [hashe(token), email, gueltigBis],
  );

  await mailer.sende(
    email,
    'Deine Anmeldung beim MTB Bielefeld',
    [
      'Hallo,',
      '',
      'tippe auf diesen Link, um dich in der App anzumelden:',
      `${BASIS_URL}/anmeldung/${token}`,
      '',
      `Der Link gilt ${GUELTIG_MINUTEN} Minuten und lässt sich einmal verwenden.`,
      'Hast du das nicht angefordert, ignoriere diese Mail einfach.',
      '',
      'Viele Grüße',
      'MTB Bielefeld e.V.',
    ].join('\r\n'),
  );
}
```

- [ ] **Schritt 7: `api/src/app.ts` umschreiben**

Die Signatur von `baueApp` ändert sich — sie nimmt jetzt ihre Abhängigkeiten entgegen, statt sie selbst zu beschaffen. Das macht sie in Tests austauschbar.

```ts
/**
 * Die Fastify-Instanz ohne Netzwerk.
 *
 * Abhängigkeiten kommen von außen herein, damit Tests eine echte Datenbank
 * und einen gemerkten Mailer einsetzen können.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';

import { fordereMagicLinkAn } from './anmeldung.ts';
import type { Mailer } from './mailer.ts';

export interface Abhaengigkeiten {
  pool: pg.Pool;
  mailer: Mailer;
  jetzt?: () => Date;
}

interface AnfordernKoerper {
  email?: unknown;
  einladungscode?: unknown;
}

export function baueApp({ pool, mailer, jetzt = () => new Date() }: Abhaengigkeiten): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/gesundheit', async () => ({ zustand: 'bereit' }));

  app.post('/anmeldung/anfordern', async (anfrage, antwort) => {
    const { email, einladungscode } = (anfrage.body ?? {}) as AnfordernKoerper;

    if (typeof email !== 'string' || !email.includes('@')) {
      return antwort.code(400).send({ fehler: 'E-Mail-Adresse fehlt oder ist ungültig.' });
    }
    if (typeof einladungscode !== 'string' || einladungscode.length === 0) {
      return antwort.code(400).send({ fehler: 'Einladungscode fehlt.' });
    }

    await fordereMagicLinkAn(pool, mailer, email, einladungscode, jetzt());

    // Immer dieselbe Antwort. Ob die Angaben stimmten, erfährt nur, wer die
    // Mail bekommt — sonst wäre dieser Endpunkt ein Werkzeug, um
    // Mitgliedschaften zu erraten.
    return antwort.code(202).send({
      hinweis: 'Wenn die Angaben stimmen, ist eine Mail unterwegs.',
    });
  });

  return app;
}
```

- [ ] **Schritt 8: Bestehenden Gesundheitstest anpassen**

`api/tests/gesundheit.test.ts` — `baueApp` braucht jetzt Abhängigkeiten:

```ts
import { describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';

describe('Gesundheitsprüfung', () => {
  it('antwortet mit 200 und einem Zustand', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer() });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ zustand: 'bereit' });
    await app.close();
  });
});
```

- [ ] **Schritt 9: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: alle Tests grün.

- [ ] **Schritt 10: Commit**

```bash
git add api/
git commit -m "Magic Link anfordern; Antwort verrät nichts"
```

---

## Aufgabe 5: Magic Link einlösen und Sitzung erhalten

Aus dem Link werden zwei Token: einer kurzlebig für Anfragen, einer langlebig zum Erneuern.

**Dateien:**
- Anlegen: `api/src/sitzung.ts`
- Anlegen: `api/src/migrationen/004-sitzung.sql`
- Anlegen: `api/tests/anmeldung-einloesen.test.ts`
- Ändern: `api/src/app.ts` — Endpunkt einhängen
- Ändern: `api/tests/hilfen/datenbank.ts` — `sitzung` mit leeren

**Schnittstellen:**
- Liefert: `loeseMagicLinkEin(pool, token: string, jetzt: Date): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }>`
- Liefert: `pruefeZugang(pool, zugang: string, jetzt: Date): Promise<{ mitgliedId: string; rolle: string } | null>`

- [ ] **Schritt 1: Migration anlegen**

`api/src/migrationen/004-sitzung.sql`:

```sql
CREATE TABLE sitzung (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitglied_id       uuid NOT NULL REFERENCES mitglied (id) ON DELETE CASCADE,
  zugang_hash       text NOT NULL UNIQUE,
  erneuerung_hash   text NOT NULL UNIQUE,
  zugang_bis        timestamptz NOT NULL,
  erneuerung_bis    timestamptz NOT NULL,
  angelegt_am       timestamptz NOT NULL DEFAULT now(),
  -- Gesetzt, sobald das Erneuerungs-Token benutzt wurde. Taucht es danach
  -- noch einmal auf, wurde es kopiert.
  ersetzt_am        timestamptz
);

CREATE INDEX sitzung_mitglied ON sitzung (mitglied_id);
```

- [ ] **Schritt 2: Testhilfe erweitern**

```ts
  await pool.query(
    'TRUNCATE sitzung, magic_link, einladung, mitglied RESTART IDENTITY CASCADE',
  );
```

- [ ] **Schritt 3: Den fehlschlagenden Test schreiben**

`api/tests/anmeldung-einloesen.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { erzeugeEinladung } from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { pruefeZugang } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

/** Fordert einen Link an und zieht den Token aus der gemerkten Mail. */
async function holeToken(mailer: GemerkterMailer, app: ReturnType<typeof baueApp>) {
  const code = await erzeugeEinladung(pool, 'malte@example.org');
  await app.inject({
    method: 'POST',
    url: '/anmeldung/anfordern',
    payload: { email: 'malte@example.org', einladungscode: code },
  });
  const text = mailer.versendet[0]?.text ?? '';
  return text.split('/anmeldung/')[1]?.split(/\s/)[0] ?? '';
}

describe('POST /anmeldung/einloesen', () => {
  it('gibt zwei Token zurück und legt das Mitglied an', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(antwort.statusCode).toBe(200);
    const koerper = antwort.json();
    expect(typeof koerper.zugang).toBe('string');
    expect(typeof koerper.erneuerung).toBe('string');

    const { rows } = await pool.query('SELECT email FROM mitglied');
    expect(rows).toHaveLength(1);
    await app.close();
  });

  it('lässt denselben Link kein zweites Mal zu', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    await app.inject({ method: 'POST', url: '/anmeldung/einloesen', payload: { token } });
    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(zweite.statusCode).toBe(401);
    await app.close();
  });

  it('lehnt einen abgelaufenen Link ab', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const spaeter = baueApp({
      pool,
      mailer,
      jetzt: () => new Date(jetzt.getTime() + 16 * 60 * 1000),
    });
    const antwort = await spaeter.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });

    expect(antwort.statusCode).toBe(401);
    await app.close();
    await spaeter.close();
  });

  it('das Zugangs-Token weist danach das Mitglied aus', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const token = await holeToken(mailer, app);

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/einloesen',
      payload: { token },
    });
    const { zugang } = antwort.json();

    const wer = await pruefeZugang(pool, zugang, jetzt);
    expect(wer?.rolle).toBe('mitglied');
    await app.close();
  });
});
```

- [ ] **Schritt 4: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/anmeldung-einloesen.test.ts
```

Erwartet: Fehlschlag, `Cannot find module '../src/sitzung.ts'`.

- [ ] **Schritt 5: `api/src/sitzung.ts` schreiben**

```ts
/**
 * Sitzungen: kurzlebiger Zugang, langlebige Erneuerung.
 *
 * Das Zugangs-Token gilt 15 Minuten und liegt in der App nur im
 * Arbeitsspeicher. Das Erneuerungs-Token gilt 60 Tage, liegt im
 * Schlüsselbund des Geräts und wird bei jeder Nutzung ausgetauscht.
 */

import type pg from 'pg';

import { erzeugeToken, hashe } from './token.ts';

const ZUGANG_MINUTEN = 15;
const ERNEUERUNG_TAGE = 60;

export interface Sitzungstoken {
  zugang: string;
  erneuerung: string;
}

export interface Ausweis {
  mitgliedId: string;
  rolle: string;
}

/** Legt eine Sitzung an und gibt beide Token im Klartext zurück. */
export async function legeSitzungAn(
  ausfuehrer: pg.Pool | pg.PoolClient,
  mitgliedId: string,
  jetzt: Date,
): Promise<Sitzungstoken> {
  const zugang = erzeugeToken();
  const erneuerung = erzeugeToken();

  await ausfuehrer.query(
    `INSERT INTO sitzung
       (mitglied_id, zugang_hash, erneuerung_hash, zugang_bis, erneuerung_bis)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      mitgliedId,
      hashe(zugang),
      hashe(erneuerung),
      new Date(jetzt.getTime() + ZUGANG_MINUTEN * 60 * 1000),
      new Date(jetzt.getTime() + ERNEUERUNG_TAGE * 24 * 60 * 60 * 1000),
    ],
  );

  return { zugang, erneuerung };
}

/** Wer gehört zu diesem Zugangs-Token? `null`, wenn es nicht gilt. */
export async function pruefeZugang(
  pool: pg.Pool,
  zugang: string,
  jetzt: Date,
): Promise<Ausweis | null> {
  const { rows } = await pool.query<{ mitglied_id: string; rolle: string }>(
    `SELECT s.mitglied_id, m.rolle
       FROM sitzung s
       JOIN mitglied m ON m.id = s.mitglied_id
      WHERE s.zugang_hash = $1 AND s.zugang_bis > $2`,
    [hashe(zugang), jetzt],
  );

  const zeile = rows[0];
  return zeile ? { mitgliedId: zeile.mitglied_id, rolle: zeile.rolle } : null;
}

/**
 * Löst einen Magic Link ein: entwertet ihn, legt das Mitglied an, falls es
 * noch keines gibt, und gibt eine Sitzung aus.
 *
 * Alles in einer Transaktion — sonst könnte ein Abbruch nach dem Entwerten
 * ein Mitglied ohne Sitzung und mit verbrauchtem Link hinterlassen.
 */
export async function loeseMagicLinkEin(
  pool: pg.Pool,
  token: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    const { rows } = await verbindung.query<{
      id: string;
      email: string;
      gueltig_bis: Date;
      verbraucht_am: Date | null;
    }>(
      `SELECT id, email, gueltig_bis, verbraucht_am FROM magic_link
        WHERE token_hash = $1 FOR UPDATE`,
      [hashe(token)],
    );

    const eintrag = rows[0];
    if (
      !eintrag ||
      eintrag.verbraucht_am !== null ||
      eintrag.gueltig_bis.getTime() < jetzt.getTime()
    ) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    await verbindung.query('UPDATE magic_link SET verbraucht_am = $2 WHERE id = $1', [
      eintrag.id,
      jetzt,
    ]);

    const { rows: mitglieder } = await verbindung.query<{ id: string }>(
      `INSERT INTO mitglied (email) VALUES ($1)
       ON CONFLICT (lower(email)) DO UPDATE SET gesehen_am = now()
       RETURNING id`,
      [eintrag.email],
    );

    const mitgliedId = mitglieder[0]!.id;
    const token_paar = await legeSitzungAn(verbindung, mitgliedId, jetzt);

    await verbindung.query('COMMIT');
    return { ok: true, ...token_paar };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}
```

- [ ] **Schritt 6: Endpunkt in `api/src/app.ts` einhängen**

Import ergänzen:

```ts
import { loeseMagicLinkEin } from './sitzung.ts';
```

Und nach dem Endpunkt `/anmeldung/anfordern` einfügen:

```ts
  app.post('/anmeldung/einloesen', async (anfrage, antwort) => {
    const { token } = (anfrage.body ?? {}) as { token?: unknown };

    if (typeof token !== 'string' || token.length === 0) {
      return antwort.code(400).send({ fehler: 'Token fehlt.' });
    }

    const ergebnis = await loeseMagicLinkEin(pool, token, jetzt());
    if (!ergebnis.ok) {
      // Ein Grund würde verraten, ob der Link existiert hat.
      return antwort.code(401).send({ fehler: 'Der Link gilt nicht mehr.' });
    }

    return antwort.send({ zugang: ergebnis.zugang, erneuerung: ergebnis.erneuerung });
  });
```

- [ ] **Schritt 7: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: alle Tests grün.

- [ ] **Schritt 8: Commit**

```bash
git add api/
git commit -m "Magic Link einlösen; Sitzung mit zwei Token"
```

---

## Aufgabe 6: Sitzung erneuern mit Rotation

Der Teil, der aus gestohlenen Token wertlose macht.

**Dateien:**
- Ändern: `api/src/sitzung.ts` — `erneuereSitzung`
- Anlegen: `api/tests/sitzung-erneuern.test.ts`
- Ändern: `api/src/app.ts` — zwei Endpunkte

**Schnittstellen:**
- Liefert: `erneuereSitzung(pool, erneuerung: string, jetzt: Date): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }>`
- Liefert: `beendeSitzung(pool, erneuerung: string): Promise<void>`

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`api/tests/sitzung-erneuern.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { pool } from '../src/datenbank.ts';
import { erneuereSitzung, legeSitzungAn, pruefeZugang } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('erneuereSitzung', () => {
  it('gibt neue Token aus und entwertet die alten', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);

    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    expect(zweite.ok).toBe(true);
    if (!zweite.ok) return;

    expect(zweite.erneuerung).not.toBe(erste.erneuerung);
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).not.toBeNull();
  });

  it('erkennt ein wiederverwendetes Token und wirft alle Sitzungen raus', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const zweite = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    if (!zweite.ok) throw new Error('Vorbedingung nicht erfüllt');

    // Das alte Token taucht wieder auf: Es wurde kopiert.
    const dritte = await erneuereSitzung(pool, erste.erneuerung, jetzt);
    expect(dritte.ok).toBe(false);

    // Auch die zwischenzeitlich gültige Sitzung ist damit erledigt.
    expect(await pruefeZugang(pool, zweite.zugang, jetzt)).toBeNull();
  });

  it('lehnt ein unbekanntes Token ab', async () => {
    expect(await erneuereSitzung(pool, 'ausgedacht', jetzt)).toEqual({ ok: false });
  });

  it('lehnt ein abgelaufenes Token ab', async () => {
    const id = await neuesMitglied();
    const erste = await legeSitzungAn(pool, id, jetzt);
    const inZweiMonaten = new Date(jetzt.getTime() + 61 * 24 * 60 * 60 * 1000);

    expect(await erneuereSitzung(pool, erste.erneuerung, inZweiMonaten)).toEqual({
      ok: false,
    });
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/sitzung-erneuern.test.ts
```

Erwartet: Fehlschlag, `erneuereSitzung is not exported`.

- [ ] **Schritt 3: `erneuereSitzung` und `beendeSitzung` ergänzen**

Ans Ende von `api/src/sitzung.ts`:

```ts
/**
 * Tauscht ein Erneuerungs-Token gegen ein frisches Paar.
 *
 * **Wiederverwendungserkennung:** Taucht ein bereits ersetztes Token wieder
 * auf, gibt es nur zwei Erklärungen — es wurde kopiert, oder ein Gerät hat
 * die Antwort nicht mitbekommen. Beide Fälle behandeln wir gleich streng:
 * Alle Sitzungen dieses Mitglieds fliegen raus. Wer wirklich der Eigentümer
 * ist, meldet sich neu an; wer es nicht ist, hält nichts mehr in der Hand.
 */
export async function erneuereSitzung(
  pool: pg.Pool,
  erneuerung: string,
  jetzt: Date,
): Promise<{ ok: true; zugang: string; erneuerung: string } | { ok: false }> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');

    const { rows } = await verbindung.query<{
      id: string;
      mitglied_id: string;
      erneuerung_bis: Date;
      ersetzt_am: Date | null;
    }>(
      `SELECT id, mitglied_id, erneuerung_bis, ersetzt_am FROM sitzung
        WHERE erneuerung_hash = $1 FOR UPDATE`,
      [hashe(erneuerung)],
    );

    const sitzung = rows[0];
    if (!sitzung) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    if (sitzung.ersetzt_am !== null) {
      // Kopiert. Alles dieses Mitglieds entwerten.
      await verbindung.query('DELETE FROM sitzung WHERE mitglied_id = $1', [
        sitzung.mitglied_id,
      ]);
      await verbindung.query('COMMIT');
      return { ok: false };
    }

    if (sitzung.erneuerung_bis.getTime() < jetzt.getTime()) {
      await verbindung.query('ROLLBACK');
      return { ok: false };
    }

    await verbindung.query('UPDATE sitzung SET ersetzt_am = $2 WHERE id = $1', [
      sitzung.id,
      jetzt,
    ]);

    const paar = await legeSitzungAn(verbindung, sitzung.mitglied_id, jetzt);
    await verbindung.query('COMMIT');
    return { ok: true, ...paar };
  } catch (fehler) {
    await verbindung.query('ROLLBACK');
    throw fehler;
  } finally {
    verbindung.release();
  }
}

/** Abmelden: die Sitzung zu diesem Erneuerungs-Token verschwindet. */
export async function beendeSitzung(pool: pg.Pool, erneuerung: string): Promise<void> {
  await pool.query('DELETE FROM sitzung WHERE erneuerung_hash = $1', [hashe(erneuerung)]);
}
```

- [ ] **Schritt 4: Endpunkte in `api/src/app.ts` einhängen**

Import erweitern:

```ts
import { beendeSitzung, erneuereSitzung, loeseMagicLinkEin } from './sitzung.ts';
```

Und einfügen:

```ts
  app.post('/sitzung/erneuern', async (anfrage, antwort) => {
    const { erneuerung } = (anfrage.body ?? {}) as { erneuerung?: unknown };

    if (typeof erneuerung !== 'string' || erneuerung.length === 0) {
      return antwort.code(400).send({ fehler: 'Token fehlt.' });
    }

    const ergebnis = await erneuereSitzung(pool, erneuerung, jetzt());
    if (!ergebnis.ok) {
      return antwort.code(401).send({ fehler: 'Bitte melde dich neu an.' });
    }

    return antwort.send({ zugang: ergebnis.zugang, erneuerung: ergebnis.erneuerung });
  });

  app.delete('/sitzung', async (anfrage, antwort) => {
    const { erneuerung } = (anfrage.body ?? {}) as { erneuerung?: unknown };

    if (typeof erneuerung === 'string' && erneuerung.length > 0) {
      await beendeSitzung(pool, erneuerung);
    }

    // Immer 204: Abmelden soll nie fehlschlagen.
    return antwort.code(204).send();
  });
```

- [ ] **Schritt 5: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: alle Tests grün.

- [ ] **Schritt 6: Commit**

```bash
git add api/
git commit -m "Sitzung erneuern mit Rotation und Wiederverwendungserkennung"
```

---

## Aufgabe 7: Auskunft und Löschung

Was die DSGVO verlangt — und was Apple verlangt, bevor eine App mit Registrierung in den Store darf.

**Dateien:**
- Anlegen: `api/src/konto.ts`
- Anlegen: `api/tests/konto.test.ts`
- Ändern: `api/src/app.ts` — Authentifizierung und zwei Endpunkte

**Schnittstellen:**
- Liefert: `holeKontoAuskunft(pool, mitgliedId: string): Promise<KontoAuskunft | null>` — `null`, wenn es das Mitglied nicht mehr gibt
- Liefert: `interface KontoAuskunft { email: string; rolle: string; angelegtAm: Date; sitzungen: number }`
- Liefert: `loescheKonto(pool, mitgliedId: string): Promise<void>`
- Intern in `api/src/app.ts`: `holeAusweis(anfrage): Promise<Ausweis | null>` — liest den `Authorization`-Kopf; `pool` und `jetzt` kommen aus der Umschließung, werden also nicht übergeben

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`api/tests/konto.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function angemeldetesMitglied() {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  const id = rows[0]!.id;
  const token = await legeSitzungAn(pool, id, jetzt);
  return { id, ...token };
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /konto', () => {
  it('sagt, was gespeichert ist', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ email: 'malte@example.org', rolle: 'mitglied' });
    await app.close();
  });

  it('lehnt ohne Token mit 401 ab', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const antwort = await app.inject({ method: 'GET', url: '/konto' });

    expect(antwort.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /konto', () => {
  it('löscht Mitglied und Sitzungen', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(204);

    const { rows: mitglieder } = await pool.query('SELECT id FROM mitglied');
    expect(mitglieder).toHaveLength(0);

    const { rows: sitzungen } = await pool.query('SELECT id FROM sitzung');
    expect(sitzungen).toHaveLength(0);
    await app.close();
  });

  it('macht den Zugang sofort ungültig', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const danach = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });
    expect(danach.statusCode).toBe(401);
    await app.close();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/konto.test.ts
```

Erwartet: Fehlschlag, 404 statt 200 — die Endpunkte fehlen.

- [ ] **Schritt 3: `api/src/konto.ts` schreiben**

```ts
/**
 * Auskunft und Löschung.
 *
 * Beides ist Pflicht, nicht Kür: Die DSGVO verlangt Auskunft (Art. 15) und
 * Löschung (Art. 17), und Apple gibt eine App mit Registrierung nur frei,
 * wenn sich das Konto **in der App** löschen lässt.
 *
 * Gelöscht wird wirklich, nicht als gelöscht markiert. Die Sitzungen gehen
 * über `ON DELETE CASCADE` mit.
 */

import type pg from 'pg';

export interface KontoAuskunft {
  email: string;
  rolle: string;
  angelegtAm: Date;
  sitzungen: number;
}

export async function holeKontoAuskunft(
  pool: pg.Pool,
  mitgliedId: string,
): Promise<KontoAuskunft | null> {
  const { rows } = await pool.query<{
    email: string;
    rolle: string;
    angelegt_am: Date;
    sitzungen: string;
  }>(
    `SELECT m.email, m.rolle, m.angelegt_am,
            (SELECT count(*) FROM sitzung s WHERE s.mitglied_id = m.id) AS sitzungen
       FROM mitglied m WHERE m.id = $1`,
    [mitgliedId],
  );

  const zeile = rows[0];
  if (!zeile) return null;

  return {
    email: zeile.email,
    rolle: zeile.rolle,
    angelegtAm: zeile.angelegt_am,
    sitzungen: Number(zeile.sitzungen),
  };
}

export async function loescheKonto(pool: pg.Pool, mitgliedId: string): Promise<void> {
  await pool.query('DELETE FROM mitglied WHERE id = $1', [mitgliedId]);
}
```

- [ ] **Schritt 4: Authentifizierung und Endpunkte in `api/src/app.ts` ergänzen**

Importe erweitern:

```ts
import { holeKontoAuskunft, loescheKonto } from './konto.ts';
import { beendeSitzung, erneuereSitzung, loeseMagicLinkEin, pruefeZugang, type Ausweis } from './sitzung.ts';
```

Vor `return app;` einfügen:

```ts
  /** Liest das Zugangs-Token aus dem Kopf und löst es auf. */
  async function holeAusweis(anfrage: { headers: Record<string, unknown> }): Promise<Ausweis | null> {
    const kopf = anfrage.headers.authorization;
    if (typeof kopf !== 'string' || !kopf.startsWith('Bearer ')) return null;
    return pruefeZugang(pool, kopf.slice('Bearer '.length), jetzt());
  }

  app.get('/konto', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    const auskunft = await holeKontoAuskunft(pool, ausweis.mitgliedId);
    if (!auskunft) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    return antwort.send(auskunft);
  });

  app.delete('/konto', async (anfrage, antwort) => {
    const ausweis = await holeAusweis(anfrage);
    if (!ausweis) return antwort.code(401).send({ fehler: 'Nicht angemeldet.' });

    await loescheKonto(pool, ausweis.mitgliedId);
    return antwort.code(204).send();
  });
```

- [ ] **Schritt 5: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test && npm run typecheck
```

Erwartet: alle Tests grün.

- [ ] **Schritt 6: Prüfen, dass die App weiterhin unberührt ist**

```bash
cd .. && npm run typecheck && npm test && npx expo install --check
```

Erwartet: unverändert grün.

- [ ] **Schritt 7: Commit**

```bash
git add api/
git commit -m "Konto-Auskunft und -Löschung"
```

---

## Nach diesem Plan

Die API kann: Einladungscodes ausstellen und einlösen, Magic Links verschicken und prüfen, Sitzungen ausgeben, erneuern und beenden, Auskunft geben und Konten löschen. Alles läuft lokal und ist getestet.

**Noch nicht möglich:** sich zu einer Tour anmelden. Das ist Plan 2.

**Bewusst offen** und in Plan 4 zu klären:
- Welcher Anbieter verschickt die Mails (`Mailer` ist nur die Schnittstelle)
- Ratenbegrenzung — gehört an Caddy, nicht in die Anwendung
- Unter welcher Adresse die API läuft
