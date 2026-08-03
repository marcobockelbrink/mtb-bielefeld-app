# Plan 1b — Aufräumen und Ratenbegrenzung

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Die API schließt drei Lücken, die die Gesamtprüfung von Plan 1 offengelassen hat: unbegrenzt wachsende Tabellen, unbegrenzt anforderbare Magic Links, und ein Zeitunterschied, der verrät, wer Mitglied ist.

**Architektur:** Das Aufräumen zieht aus den heißen Pfaden in ein eigenes Modul mit einem Zeitgeber — Rechenlogik in einer Datei, die Anbindung ans Betriebssystem in einer anderen, wie es die `CLAUDE.md` für dieses Projekt beschreibt. Die Begrenzung je Adresse zählt auf `magic_link`, statt eine neue Tabelle einzuführen. Der Endpunkt antwortet, bevor er arbeitet.

**Technik:** Node 26 · TypeScript · Fastify 5 · Postgres 16 über `pg` 8 · Vitest

**Voraussetzung:** Plan 1 ist umgesetzt (Zweig `backend-anmeldung`, 28 Commits). Dieser Plan setzt darauf auf.

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, SQL und Commit-Nachrichten auf Deutsch. Fachbegriffe ohne gute Entsprechung (Token, Hash, Commit) bleiben stehen.
- **Kein Geheimnis im Repository.** Es ist öffentlich und MIT-lizenziert.
- **Die API verrät nie**, ob eine E-Mail-Adresse bekannt ist — weder über den Statuscode, noch über den Text, noch über die Antwortzeit.
- **Keine stillen Fehlschläge.** Was schiefgeht, geht ins Protokoll.
- **Rechenlogik ohne Rahmenwerk**, damit sie ohne laufenden Server prüfbar bleibt.
- **Die App außerhalb von `api/` wird nicht verändert.**
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.
- Vor jeder Rückmeldung: `cd api && npm test && npm test` (zweimal grün ohne Datenbank-Reset), `npm run typecheck` in `api/`, und in der Wurzel `npm test` → 13 Dateien / 184 Tests.

---

## Aufgabe 1: Aufräumen an einer Stelle

Heute räumt `erneuereSitzung` abgelaufene Sitzungen weg — nach der Transaktion, aber immer noch im Anfragepfad. `magic_link` räumt niemand. Beides zieht in ein eigenes Modul mit einem Zeitgeber.

**Dateien:**
- Anlegen: `api/src/aufraeumen.ts`
- Anlegen: `api/src/aufraeumen-cli.ts`
- Anlegen: `api/src/migrationen/008-magic-link-gueltig-bis-index.sql`
- Anlegen: `api/tests/aufraeumen.test.ts`
- Ändern: `api/src/sitzung.ts` — `raeumeAbgelaufeneSitzungenAuf` entfernen, Aufruf aus `erneuereSitzung` entfernen
- Ändern: `api/src/server.ts` — Zeitgeber
- Ändern: `api/package.json` — Skript `aufraeumen`
- Ändern: `api/tests/sitzung-erneuern.test.ts` — Tests zum Aufräumen ziehen um

**Schnittstellen:**
- Liefert: `raeumeAuf(pool: pg.Pool, jetzt: Date): Promise<Aufraeumbilanz>` mit `Aufraeumbilanz = { sitzungen: number; magicLinks: number }`
- Entfällt: `raeumeAbgelaufeneSitzungenAuf` aus `api/src/sitzung.ts`

- [ ] **Schritt 1: Migration anlegen**

`api/src/migrationen/008-magic-link-gueltig-bis-index.sql`:

```sql
-- Ohne diesen Index liest das Aufräumen jedes Mal die ganze Tabelle.
-- Dieselbe Lehre wie bei `sitzung_erneuerung_bis`: Wer nach einer Frist
-- löscht, braucht einen Index auf die Frist.
CREATE INDEX magic_link_gueltig_bis ON magic_link (gueltig_bis);
```

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`api/tests/aufraeumen.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { raeumeAuf } from '../src/aufraeumen.ts';
import { pool } from '../src/datenbank.ts';
import { hashe } from '../src/token.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-03T12:00:00Z');
const gestern = new Date('2026-08-02T12:00:00Z');

async function neuesMitglied(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  return rows[0]!.id;
}

/** Legt eine Sitzung mit frei wählbaren Fristen an. */
async function sitzung(
  mitgliedId: string,
  erneuerungBis: Date,
  ersetztAm: Date | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO sitzung
       (mitglied_id, zugang_hash, erneuerung_hash, zugang_bis, erneuerung_bis, ersetzt_am)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      mitgliedId,
      hashe(`zugang-${Math.random()}`),
      hashe(`erneuerung-${Math.random()}`),
      erneuerungBis,
      erneuerungBis,
      ersetztAm,
    ],
  );
}

async function magicLink(gueltigBis: Date): Promise<void> {
  await pool.query(
    `INSERT INTO magic_link (token_hash, email, gueltig_bis)
     VALUES ($1, 'malte@example.org', $2)`,
    [hashe(`link-${Math.random()}`), gueltigBis],
  );
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('raeumeAuf', () => {
  it('wirft abgelaufene Sitzungen weg', async () => {
    const id = await neuesMitglied();
    await sitzung(id, gestern, null);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(1);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(0);
  });

  it('lässt ersetzte, aber noch gültige Sitzungen stehen', async () => {
    // Der wichtigste Test dieser Datei: Genau an einer solchen Zeile
    // erkennt die Wiederverwendungserkennung ein kopiertes Token. Wer sie
    // wegräumt, macht aus einem Alarm ein stilles „gilt nicht".
    const id = await neuesMitglied();
    const morgen = new Date('2026-08-04T12:00:00Z');
    await sitzung(id, morgen, gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.sitzungen).toBe(0);
    const { rows } = await pool.query('SELECT id FROM sitzung');
    expect(rows).toHaveLength(1);
  });

  it('wirft abgelaufene Magic Links weg', async () => {
    await magicLink(gestern);

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(1);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(0);
  });

  it('lässt noch gültige Magic Links stehen', async () => {
    await magicLink(new Date('2026-08-03T12:10:00Z'));

    const bilanz = await raeumeAuf(pool, jetzt);

    expect(bilanz.magicLinks).toBe(0);
    const { rows } = await pool.query('SELECT id FROM magic_link');
    expect(rows).toHaveLength(1);
  });

  it('meldet null, wenn es nichts zu tun gibt', async () => {
    expect(await raeumeAuf(pool, jetzt)).toEqual({ sitzungen: 0, magicLinks: 0 });
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/aufraeumen.test.ts
```

Erwartet: Fehlschlag, `Cannot find module '../src/aufraeumen.ts'`.

- [ ] **Schritt 4: `api/src/aufraeumen.ts` schreiben**

```ts
/**
 * Aufräumen abgelaufener Zeilen — an einer Stelle, nicht in drei.
 *
 * `sitzung` und `magic_link` wachsen beide mit der Benutzung: Jede
 * Erneuerung legt eine Sitzungszeile an, jede Anforderung einen Magic Link.
 * Was nie abgeräumt wird, wächst — bei einem Gerät alle fünfzehn Minuten.
 *
 * Der erste Versuch hängte das Aufräumen an die Erneuerung. Das war
 * falsch: Die Erneuerung ist der Pfad, den jedes Gerät ständig geht, und
 * sie darf nicht davon abhängen, dass das Aufräumen gelingt. Deshalb steht
 * es hier für sich, wird vom Zeitgeber in `server.ts` angestoßen und lässt
 * sich mit `npm run aufraeumen` auch von Hand oder per cron auslösen.
 *
 * Diese Datei kennt kein Fastify und keinen Zeitgeber — sie ist reine
 * Rechenlogik und ohne laufenden Server prüfbar. Dasselbe Muster wie
 * `notifications/scheduler.ts` gegenüber `notifications/index.ts` in der App.
 */

import type pg from 'pg';

export interface Aufraeumbilanz {
  sitzungen: number;
  magicLinks: number;
}

/**
 * Räumt weg, was seine Frist überschritten hat.
 *
 * Die Grenze bei den Sitzungen ist `erneuerung_bis` und **nicht**
 * `ersetzt_am`: Eine ersetzte, aber noch nicht abgelaufene Zeile ist genau
 * das, woran die Wiederverwendungserkennung ein wiederaufgetauchtes Token
 * erkennt. Ist die Frist dagegen vorbei, würde das Token ohnehin abgelehnt
 * — die Zeile ist dann auch für die Erkennung wertlos.
 *
 * Bewusst zwei getrennte Anweisungen ohne Transaktion: Es gibt nichts, was
 * die beiden gemeinsam richtig oder falsch machen könnten, und ein Fehler
 * bei der einen soll die andere nicht verhindern.
 */
export async function raeumeAuf(pool: pg.Pool, jetzt: Date): Promise<Aufraeumbilanz> {
  const sitzungen = await pool.query('DELETE FROM sitzung WHERE erneuerung_bis < $1', [
    jetzt,
  ]);
  const magicLinks = await pool.query('DELETE FROM magic_link WHERE gueltig_bis < $1', [
    jetzt,
  ]);

  return {
    sitzungen: sitzungen.rowCount ?? 0,
    magicLinks: magicLinks.rowCount ?? 0,
  };
}
```

- [ ] **Schritt 5: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test tests/aufraeumen.test.ts
```

Erwartet: 5 Tests grün.

- [ ] **Schritt 6: Aufräumen aus `sitzung.ts` entfernen**

In `api/src/sitzung.ts`:

- Die Funktion `raeumeAbgelaufeneSitzungenAuf` **löschen** — sie lebt jetzt in `aufraeumen.ts`.
- In `erneuereSitzung` den Aufruf samt umgebendem `try`/`catch` und Protokolleintrag **löschen**.
- Den Absatz im Dokumentationskopf von `erneuereSitzung`, der das Aufräumen beschreibt, durch einen Satz ersetzen, der sagt, **warum es dort nicht mehr steht**:

```
 * Das Aufräumen abgelaufener Sitzungen stand einmal hier. Es steht jetzt in
 * `aufraeumen.ts`: Die Erneuerung ist der Pfad, den jedes Gerät alle
 * fünfzehn Minuten geht, und sie darf weder auf ein Aufräumen warten noch
 * mit ihm scheitern.
```

- [ ] **Schritt 7: Die zugehörigen Tests umziehen**

Die Tests zum Aufräumen in `api/tests/sitzung-erneuern.test.ts` (abgelaufene weg, ersetzte bleiben, Erneuerung gelingt trotz gescheitertem Aufräumen) sind durch `tests/aufraeumen.test.ts` abgedeckt. **Entferne sie dort**, samt eventuell nur dafür gebauter Testdoubles. Die Tests zu Rotation und Wiederverwendungserkennung bleiben unangetastet.

- [ ] **Schritt 8: `api/src/aufraeumen-cli.ts` schreiben**

```ts
/**
 * Aufräumen von der Kommandozeile — für cron oder von Hand.
 *
 * Der Zeitgeber in `server.ts` erledigt es im Normalbetrieb. Dieses
 * Werkzeug gibt es für den Fall, dass die API nicht läuft oder jemand
 * nachsehen will, wie viel sich angesammelt hat.
 */

import { raeumeAuf } from './aufraeumen.ts';
import { pool } from './datenbank.ts';

const bilanz = await raeumeAuf(pool, new Date());
console.log(
  `Weggeräumt: ${bilanz.sitzungen} Sitzung(en), ${bilanz.magicLinks} Magic Link(s).`,
);
await pool.end();
```

- [ ] **Schritt 9: Skript eintragen**

In `api/package.json`, im Feld `scripts`, hinter `migrieren`:

```json
    "aufraeumen": "node --experimental-strip-types src/aufraeumen-cli.ts",
```

- [ ] **Schritt 10: Zeitgeber in `api/src/server.ts` ergänzen**

Nach dem erfolgreichen `listen` einfügen — Importe entsprechend ergänzen:

```ts
/**
 * Wie oft aufgeräumt wird.
 *
 * Fünfzehn Minuten sind die Lebensdauer eines Magic Links: Häufiger wäre
 * Arbeit ohne Ertrag, seltener ließe die Tabelle unnötig anwachsen.
 */
const AUFRAEUM_ABSTAND_MS = 15 * 60 * 1000;

const zeitgeber = setInterval(() => {
  void raeumeAuf(pool, new Date())
    .then((bilanz) => {
      if (bilanz.sitzungen > 0 || bilanz.magicLinks > 0) {
        app.log.info(bilanz, 'aufgeräumt');
      }
    })
    // Aufräumen ist Hausarbeit: Sie darf scheitern, ohne den Betrieb zu
    // stören — aber nicht unbemerkt.
    .catch((fehler) => app.log.error({ fehler }, 'Aufräumen fehlgeschlagen'));
}, AUFRAEUM_ABSTAND_MS);

// Ohne das hält der Zeitgeber den Prozess am Leben und ein `docker stop`
// wartet, bis das Betriebssystem nachhilft.
zeitgeber.unref();
```

- [ ] **Schritt 11: Alles prüfen**

```bash
cd api && npm test && npm test && npm run typecheck
cd .. && npm test && npm run typecheck
```

Erwartet: `api` zweimal grün, Wurzel 13 Dateien / 184 Tests.

- [ ] **Schritt 12: Commit**

```bash
git add api/
git commit -m "Aufräumen an einer Stelle statt im Erneuerungspfad"
```

---

## Aufgabe 2: Begrenzung je Adresse

Bis Plan 1 war der Codeverbrauch beim Anfordern eine zufällige Bremse. Seit der Code erst beim Einlösen verbraucht wird, gibt es keine mehr: Jeder kann beliebig oft für jede Adresse einen Link anfordern. Das ist ein Werkzeug, um das Postfach eines Mitglieds zu fluten.

**Dateien:**
- Anlegen: `api/src/migrationen/009-magic-link-adresse-zeit-index.sql`
- Ändern: `api/src/anmeldung.ts` — Begrenzung vor dem Anlegen
- Anlegen: `api/tests/anmeldung-begrenzung.test.ts`

**Schnittstellen:**
- Liefert (modulintern, nicht exportiert): `darfAnfordern(pool, email, jetzt): Promise<boolean>`
- Unverändert: `fordereMagicLinkAn(pool, mailer, protokoll, email, einladungscode, jetzt)` — Signatur und Verhalten nach außen bleiben gleich

- [ ] **Schritt 1: Migration anlegen**

`api/src/migrationen/009-magic-link-adresse-zeit-index.sql`:

```sql
-- Die Begrenzung zählt je Adresse in einem Zeitfenster. Ohne diesen Index
-- läse sie dafür die ganze Tabelle — bei jedem Anmeldeversuch.
CREATE INDEX magic_link_adresse_zeit ON magic_link (lower(email), angelegt_am);
```

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`api/tests/anmeldung-begrenzung.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fordereMagicLinkAn } from '../src/anmeldung.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import type { Protokoll } from '../src/protokoll.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

/**
 * Ein Protokoll, das nichts tut — hier wird nichts davon geprüft.
 *
 * Sieh in `api/src/protokoll.ts` nach, welche Methoden der Typ `Protokoll`
 * tatsächlich verlangt, und ergänze fehlende. Die Liste hier ist der Stand
 * bei Planerstellung, nicht die Wahrheit.
 */
const stillesProtokoll: Protokoll = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

const start = new Date('2026-08-03T12:00:00Z');

/** Legt ein Mitglied an, damit kein Einladungscode nötig ist. */
async function mitgliedAnlegen(): Promise<void> {
  await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
}

/** Fordert an und gibt zurück, wie viele Mails insgesamt verschickt wurden. */
async function fordere(mailer: GemerkterMailer, jetzt: Date): Promise<number> {
  await fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'malte@example.org', undefined, jetzt);
  return mailer.versendet.length;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('Begrenzung je Adresse', () => {
  it('lässt die erste Anforderung durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    expect(await fordere(mailer, start)).toBe(1);
  });

  it('lehnt eine zweite Anforderung innerhalb einer Minute ab', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachDreissigSekunden = new Date(start.getTime() + 30 * 1000);

    expect(await fordere(mailer, nachDreissigSekunden)).toBe(1);
  });

  it('lässt nach einer Minute wieder eine durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachZweiMinuten = new Date(start.getTime() + 2 * 60 * 1000);

    expect(await fordere(mailer, nachZweiMinuten)).toBe(2);
  });

  it('lässt höchstens drei je Stunde durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    // Drei im Abstand von je fünf Minuten: alle erlaubt.
    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Die vierte innerhalb derselben Stunde nicht mehr.
    const anzahl = await fordere(mailer, new Date(start.getTime() + 15 * 60 * 1000));

    expect(anzahl).toBe(3);
  });

  it('zählt das Fenster gleitend, nicht je voller Stunde', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Gut eine Stunde nach der ersten: Die erste ist aus dem Fenster
    // gefallen, also ist wieder Platz.
    const spaeter = new Date(start.getTime() + 61 * 60 * 1000);

    expect(await fordere(mailer, spaeter)).toBe(4);
  });

  it('begrenzt je Adresse, nicht insgesamt', async () => {
    await mitgliedAnlegen();
    await pool.query("INSERT INTO mitglied (email) VALUES ('anna@example.org')");
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'anna@example.org',
      undefined,
      new Date(start.getTime() + 1000),
    );

    expect(mailer.versendet).toHaveLength(2);
  });

  it('unterscheidet Groß- und Kleinschreibung nicht', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'MALTE@example.org',
      undefined,
      new Date(start.getTime() + 30 * 1000),
    );

    expect(mailer.versendet).toHaveLength(1);
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und Fehlschlag bestätigen**

```bash
cd api && npm test tests/anmeldung-begrenzung.test.ts
```

Erwartet: Fehlschlag — mehrere Tests melden zu viele versendete Mails, weil es noch keine Begrenzung gibt.

- [ ] **Schritt 4: Begrenzung in `api/src/anmeldung.ts` ergänzen**

Oben bei den anderen Konstanten:

```ts
/**
 * Wie oft eine Adresse einen Link anfordern darf.
 *
 * Bis der Einladungscode erst beim Einlösen verbraucht wurde, war sein
 * Verbrauch eine zufällige Bremse. Seit sie weg ist, könnte jeder das
 * Postfach eines Mitglieds fluten — die Adresse allein genügt, ein Konto
 * braucht es dafür nicht.
 *
 * Die Zahlen sind Erfahrungswerte, keine Glaubenssätze: Drei Versuche pro
 * Stunde reichen für „Mail nicht angekommen, nochmal", und eine Minute
 * Abstand fängt den doppelt getippten Knopf ab.
 */
const HOECHSTENS_JE_STUNDE = 3;
const MINDESTABSTAND_SEKUNDEN = 60;
```

Eine neue Funktion, unterhalb von `pruefeZutritt`:

```ts
/**
 * Ob für diese Adresse gerade ein weiterer Link entstehen darf.
 *
 * Gezählt wird auf `magic_link` — die Daten liegen schon da, eine eigene
 * Tabelle wäre ein zweites bewegliches Teil für dieselbe Auskunft.
 *
 * Das Fenster ist **gleitend**: Wer um 12:59 seine dritte Anforderung
 * verbraucht, ist nicht um 13:00 wieder frei, sondern eine Stunde nach der
 * ersten. Sonst könnte man an jeder vollen Stunde das Doppelte anfordern.
 */
async function darfAnfordern(pool: pg.Pool, email: string, jetzt: Date): Promise<boolean> {
  const stundeVorher = new Date(jetzt.getTime() - 60 * 60 * 1000);

  const { rows } = await pool.query<{ anzahl: string; letzte: Date | null }>(
    `SELECT count(*) AS anzahl, max(angelegt_am) AS letzte
       FROM magic_link
      WHERE lower(email) = lower($1) AND angelegt_am > $2`,
    [email, stundeVorher],
  );

  const zeile = rows[0];
  if (!zeile) return true;

  if (Number(zeile.anzahl) >= HOECHSTENS_JE_STUNDE) return false;

  if (zeile.letzte) {
    const abstandSekunden = (jetzt.getTime() - zeile.letzte.getTime()) / 1000;
    if (abstandSekunden < MINDESTABSTAND_SEKUNDEN) return false;
  }

  return true;
}
```

In `fordereMagicLinkAn`, direkt **nach** der Zutrittsprüfung und **vor** dem Erzeugen des Tokens:

```ts
  // Nach der Zutrittsprüfung, nicht davor: Wer gar nicht hereindarf, soll
  // auch keine Spur in der Begrenzung hinterlassen — sonst könnte jemand
  // durch Anfragen für eine fremde Adresse deren Kontingent aufbrauchen.
  if (!(await darfAnfordern(pool, email, jetzt))) return;
```

Und im Dokumentationskopf von `fordereMagicLinkAn` einen Absatz ergänzen:

```
 * Wirft auch **nicht**, wenn die Begrenzung greift. Nach außen bleibt es
 * bei 202 — eine eigene Antwort dafür wäre ein neues Orakel: Sie verriete,
 * dass für diese Adresse gerade etwas läuft.
```

- [ ] **Schritt 5: Test laufen lassen und Erfolg bestätigen**

```bash
cd api && npm test tests/anmeldung-begrenzung.test.ts
```

Erwartet: 7 Tests grün.

- [ ] **Schritt 6: Prüfen, dass der Endpunkt weiter gleich antwortet**

Ein Test in `api/tests/anmeldung-anfordern.test.ts` ergänzen:

```ts
  it('antwortet auch bei greifender Begrenzung mit 202', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer });
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");

    const anfordern = () =>
      app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org' },
      });

    const erste = await anfordern();
    const zweite = await anfordern();

    // Gleicher Code, gleicher Text — der Unterschied steckt nur darin, ob
    // eine Mail entstand.
    expect(zweite.statusCode).toBe(erste.statusCode);
    expect(zweite.json()).toEqual(erste.json());
    expect(mailer.versendet).toHaveLength(1);
    await app.close();
  });
```

- [ ] **Schritt 7: Alles prüfen**

```bash
cd api && npm test && npm test && npm run typecheck
cd .. && npm test && npm run typecheck
```

- [ ] **Schritt 8: Commit**

```bash
git add api/
git commit -m "Anforderungen je Adresse begrenzen, Antwort bleibt gleich"
```

---

## Aufgabe 3: Erst antworten, dann arbeiten

Der berechtigte Pfad schreibt in die Datenbank und verschickt eine Mail; der unberechtigte kehrt sofort um. Der Unterschied ist messbar und hebelt genau die Ununterscheidbarkeit aus, die die Aufgaben davor herstellen.

**Dateien:**
- Ändern: `api/src/app.ts` — Antwort vor der Arbeit, Hintergrundarbeit nachverfolgbar
- Ändern: `api/tests/anmeldung-anfordern.test.ts` — auf die Hintergrundarbeit warten
- Ändern: `api/tests/anmeldung-einloesen.test.ts` — dito, die Testhilfe `holeToken` betrifft es
- Anlegen: `api/caddy/anmeldung.Caddyfile`

**Schnittstellen:**
- Liefert: `app.warteAufHintergrundarbeit(): Promise<void>` — von Fastify dekoriert, damit Tests deterministisch bleiben

- [ ] **Schritt 1: Die Hintergrundarbeit in `api/src/app.ts` einführen**

Innerhalb von `baueApp`, vor den Endpunkten:

```ts
  /**
   * Arbeit, die nach der Antwort weiterläuft.
   *
   * Der Grund ist keine Geschwindigkeit, sondern Gleichheit: Solange der
   * berechtigte Pfad schreibt und verschickt, während der unberechtigte
   * sofort umkehrt, ist die Antwortzeit ein Orakel. Wer eine Liste von
   * Adressen durchprobiert, sieht am Zeitunterschied, welche zum Verein
   * gehören — obwohl Statuscode und Text überall gleich sind.
   *
   * Also antworten wir zuerst und arbeiten danach. Die laufenden Vorgänge
   * werden gesammelt, damit Tests darauf warten können; ohne das wären sie
   * ein Wettrennen.
   */
  const laufendeArbeit = new Set<Promise<unknown>>();

  function imHintergrund(arbeit: Promise<unknown>): void {
    laufendeArbeit.add(arbeit);
    void arbeit
      // Nichts darf hier unbemerkt sterben: Ein unbehandelter Fehlschlag
      // wäre genau der stille Fehlschlag, den dieses Projekt ausschließt.
      .catch((fehler) => log.error({ fehler: serialisiereFehler(fehler) }, 'Hintergrundarbeit fehlgeschlagen'))
      .finally(() => laufendeArbeit.delete(arbeit));
  }

  app.decorate('warteAufHintergrundarbeit', async () => {
    while (laufendeArbeit.size > 0) {
      await Promise.allSettled([...laufendeArbeit]);
    }
  });
```

Dazu die Typerweiterung, oberhalb von `baueApp`:

```ts
declare module 'fastify' {
  interface FastifyInstance {
    /** Wartet, bis alle nach der Antwort gestarteten Vorgänge fertig sind. Für Tests. */
    warteAufHintergrundarbeit(): Promise<void>;
  }
}
```

- [ ] **Schritt 2: Den Endpunkt umstellen**

In `/anmeldung/anfordern` den `await fordereMagicLinkAn(...)` ersetzen: nicht mehr abwarten, sondern in den Hintergrund geben und sofort antworten.

```ts
    imHintergrund(
      fordereMagicLinkAn(
        pool,
        mailer,
        log,
        email,
        einladungscode === undefined || einladungscode.length === 0
          ? undefined
          : einladungscode,
        jetzt(),
      ),
    );

    return antwort.code(202).send({
      hinweis: 'Wenn die Angaben stimmen, ist eine Mail unterwegs.',
    });
```

Die Prüfungen der Eingabeform (400er) bleiben davor und unverändert: Sie sagen nichts über die Adresse aus, nur über die Anfrage.

- [ ] **Schritt 3: Die Tests auf die Hintergrundarbeit warten lassen**

Überall dort, wo ein Test nach `POST /anmeldung/anfordern` prüft, ob eine Mail entstand oder eine Zeile geschrieben wurde, muss davor stehen:

```ts
    await app.warteAufHintergrundarbeit();
```

Betroffen sind `api/tests/anmeldung-anfordern.test.ts` und die Testhilfe `holeToken` in `api/tests/anmeldung-einloesen.test.ts`. Geh beide Dateien durch und ergänze es an jeder Stelle, die nach dem Anfordern etwas erwartet.

- [ ] **Schritt 4: Alles prüfen**

```bash
cd api && npm test && npm test && npm run typecheck
```

Erwartet: alle grün. Schlägt etwas sporadisch fehl, fehlt an dieser Stelle das Warten.

- [ ] **Schritt 5: Die IP-Schicht als Konfiguration ablegen**

`api/caddy/anmeldung.Caddyfile` — angewandt wird sie erst bei der Inbetriebnahme in Plan 4, aber sie gehört zur Sache und nicht in jemandes Gedächtnis:

```
# Ratenbegrenzung je IP für die Anmeldeendpunkte.
#
# Diese Schicht und die Begrenzung in der API tun Verschiedenes:
# Caddy sieht den Anfragekörper nicht und kann deshalb nicht je Adresse
# begrenzen — er schützt den Server vor einer Flut. Die Begrenzung in der
# API schützt einzelne Mitglieder davor, dass ihr Postfach geflutet wird.
# Keine der beiden ersetzt die andere.
#
# Angewandt wird das in Plan 4 (Inbetriebnahme). Bis dahin ist es eine
# Vorlage, kein laufender Schutz.
#
# Braucht das Modul caddy-ratelimit:
#   xcaddy build --with github.com/mholt/caddy-ratelimit

api.mtb-bielefeld.de {
	rate_limit {
		zone anmeldung {
			match {
				path /anmeldung/*
			}
			key {remote_host}
			events 10
			window 1m
		}
	}

	reverse_proxy localhost:3000
}
```

- [ ] **Schritt 6: Commit**

```bash
git add api/
git commit -m "Erst antworten, dann arbeiten; Caddy-Vorlage für die IP-Schicht"
```

---

## Nach diesem Plan

`sitzung` und `magic_link` werden regelmäßig abgeräumt, an einer Stelle und außerhalb der Anfragepfade. Eine Adresse kann höchstens dreimal je Stunde einen Link anfordern. Statuscode, Text **und** Antwortzeit sind in allen Fällen gleich.

**Weiterhin offen und bewusst späteren Plänen vorbehalten:**

- Der echte Mailversand (`NichtEingerichteterMailer` wirft weiterhin laut) — Plan 4
- Die Caddy-Konfiguration anwenden — Plan 4
- Die Tourenanmeldung selbst — Plan 2
