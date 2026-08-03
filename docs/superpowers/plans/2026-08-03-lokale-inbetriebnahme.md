# Plan 4a — Lokale Inbetriebnahme

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Ein `docker compose up` startet den vollständigen Betriebsaufbau auf dem Entwicklungsrechner — Postgres, API, Caddy davor, Mailpit als Mailfänger. Der Magic-Link-Ablauf wird zum ersten Mal von Anfang bis Ende durchspielbar.

**Architektur:** Dieselbe `compose`-Datei, die später auf einem Server läuft — nur mit lokalen Adressen und einem Mailfänger statt eines echten Anbieters. Was hier geprüft wird, ist **Konfiguration und Zusammenspiel**: Caddys Ratenbegrenzung, `trustProxy`, Migrationen beim Start, der Mailversand. Was hier *nicht* geprüft werden kann, steht am Ende des Plans.

**Technik:** Docker Compose · Caddy 2 mit `caddy-ratelimit` · Mailpit · Node 26 · Postgres 16

**Voraussetzung:** Die API aus den Plänen 1, 1b und 2 ist umgesetzt und liegt auf `main`.

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, Konfiguration und Commit-Nachrichten auf Deutsch. Fachbegriffe ohne gute Entsprechung (Token, Container, Commit) bleiben stehen.
- **Kein Geheimnis im Repository.** Es ist öffentlich und MIT-lizenziert. Zugangsdaten kommen aus einer `.env`, die nicht versioniert wird; eine `.env.beispiel` **mit erkennbar wertlosen Beispielwerten** zeigt, welche Schlüssel es gibt.
- **Der Unterschied zwischen lokal und Server muss klein und benannt sein.** Wo eine Einstellung nur lokal gilt, gehört ein Kommentar dazu, was auf einem Server anders wäre — sonst wird aus „Simulation" ein Selbstbetrug.
- **Keine stillen Fehlschläge.** Ein Dienst, der nicht startet, muss laut scheitern statt halb zu laufen.
- **Die bestehenden Tests bleiben grün.** `cd api && npm test` läuft weiterhin gegen das lokale Postgres aus `api/docker-compose.yml`, nicht gegen den Betriebsaufbau.
- **Nach jeder Aufgabe committen.** Kleine Commits, deutsche Nachricht.

## Was dieser Plan prüft — und was nicht

**Wird echt geprüft:** Caddys Pfad- und Methoden-Muster gegen laufende Anfragen · zwei getrennte Ratenbegrenzungs-Zonen · `trustProxy` mit echtem Proxy davor · Migrationen beim Start eines frischen Volumes · Mailversand über SMTP · der vollständige Anmeldeablauf vom Formular bis zum eingelösten Link.

**Bleibt ungeprüft:** echtes TLS-Zertifikat und DNS · Zustellbarkeit bei echten Mailanbietern · Verhalten unter Last · SSH-Härtung, Firewall, automatische Sicherheitsupdates · Rücksicherung aus einem entfernten Backup. Das kommt in Plan 4b (echte Inbetriebnahme) und braucht Entscheidungen des Vereins.

---

## Aufgabe 1: Die API im Container

Bevor irgendetwas davorsteht, muss die API selbst in einem Container laufen — mit Migrationen beim Start und einem Gesundheitsendpunkt, auf den Compose warten kann.

**Dateien:**
- Anlegen: `api/Dockerfile`
- Anlegen: `api/.dockerignore`
- Anlegen: `api/src/start.ts`
- Ändern: `api/package.json` — Skript `betrieb`
- Ändern: `api/src/server.ts` — Startmeldung nennt den Zustand des Mailversands

**Schnittstellen:**
- Liefert: Ein Abbild, das `node --experimental-strip-types src/start.ts` ausführt; `start.ts` wendet zuerst die Migrationen an und startet dann den Server.

- [ ] **Schritt 1: `api/src/start.ts` schreiben**

Der Betriebseinstieg — anders als `server.ts`, das für die Entwicklung von Hand gestartet wird.

```ts
/**
 * Einstieg für den Betrieb: erst migrieren, dann starten.
 *
 * Getrennt von `server.ts`, das in der Entwicklung von Hand gestartet wird
 * und eine bereits migrierte Datenbank voraussetzt. Ein Container startet
 * dagegen jederzeit neu — er darf sich nicht darauf verlassen, dass jemand
 * vorher `npm run migrieren` getippt hat.
 *
 * Scheitern die Migrationen, endet der Prozess mit einem Fehler. Ein
 * Container, der mit halb migrierter Datenbank weiterläuft, wäre der
 * schlimmste Ausgang: Er antwortet auf Anfragen und macht dabei Falsches.
 */

import { pool } from './datenbank.ts';
import { wendeMigrationenAn } from './migrationen/laufen.ts';

const angewandt = await wendeMigrationenAn(pool);
console.log(
  angewandt.length > 0
    ? `Migrationen angewandt: ${angewandt.join(', ')}`
    : 'Migrationen: nichts zu tun.',
);

await import('./server.ts');
```

- [ ] **Schritt 2: `api/Dockerfile` schreiben**

```dockerfile
# Node 26: Die Skripte nutzen --experimental-strip-types, das gibt es erst
# ab 22.6 (siehe engines in package.json).
FROM node:26-alpine

WORKDIR /app

# Die geteilten Parser-Module liegen außerhalb von api/ — das Abbild wird
# deshalb aus dem Wurzelverzeichnis gebaut (siehe context in der
# compose-Datei), nicht aus api/.
COPY package.json package-lock.json ./
COPY api/package.json ./api/

# Nur die Abhängigkeiten der API, nicht die der App: Expo, React Native und
# die Schriften haben im Serverabbild nichts zu suchen.
RUN cd api && npm ci --omit=dev

COPY src ./src
COPY api/src ./api/src

WORKDIR /app/api

# Ohne diese Angabe startet Node als PID 1 und bekommt kein SIGTERM sauber
# weitergereicht — ein `docker stop` würde dann zehn Sekunden warten und
# hart abschießen.
STOPSIGNAL SIGTERM

EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/start.ts"]
```

**Prüfe beim Umsetzen:** Ob `npm ci` in `api/` ohne die Wurzel-`node_modules` durchläuft. Die API hat ein eigenes `package-lock.json`; falls `npm ci` dort ein anderes Verzeichnis erwartet, pass den Pfad an und schreib in einen Kommentar, warum.

- [ ] **Schritt 3: `api/.dockerignore` schreiben**

```
node_modules
tests
.superpowers
docker-compose.yml
caddy
```

- [ ] **Schritt 4: Skript in `api/package.json`**

Bei den anderen Skripten:

```json
    "betrieb": "node --experimental-strip-types src/start.ts",
```

- [ ] **Schritt 5: Startmeldung ehrlich machen**

In `api/src/server.ts`, nach dem erfolgreichen `listen`, ergänzen — der Betreiber soll beim Start sehen, ob Mails rausgehen können:

```ts
console.log(
  mailer instanceof NichtEingerichteterMailer
    ? 'Mailversand: NICHT eingerichtet — Anmeldungen scheitern sichtbar.'
    : 'Mailversand: eingerichtet.',
);
```

Passe das an die tatsächliche Struktur an — `mailer` ist dort womöglich nicht als Variable greifbar. Zieh ihn in eine benannte Konstante, wenn nötig.

- [ ] **Schritt 6: Abbild bauen und prüfen**

```bash
docker build -f api/Dockerfile -t mtbie-api .
docker run --rm mtbie-api node --version
```

Erwartet: Bau ohne Fehler, Node-Version 26.x.

- [ ] **Schritt 7: Commit**

```bash
git add api/
git commit -m "API im Container: erst migrieren, dann starten"
```

---

## Aufgabe 2: Der Betriebsaufbau mit Caddy und Mailpit

Vier Dienste, eine Datei — und zum ersten Mal ein echter Proxy vor der API.

**Dateien:**
- Anlegen: `betrieb/docker-compose.yml`
- Anlegen: `betrieb/Caddyfile`
- Anlegen: `betrieb/caddy/Dockerfile`
- Anlegen: `betrieb/.env.beispiel`
- Ändern: `.gitignore` — `betrieb/.env`
- Anlegen: `betrieb/LIESMICH.md`

**Schnittstellen:**
- Liefert: `docker compose -f betrieb/docker-compose.yml up` startet alles; die API ist über `http://localhost` erreichbar (durch Caddy), Mailpit über `http://localhost:8025`.

- [ ] **Schritt 1: Caddy mit Ratenbegrenzungs-Modul bauen**

Das Modul ist nicht im Standardabbild. `betrieb/caddy/Dockerfile`:

```dockerfile
# Caddys Ratenbegrenzung ist ein Zusatzmodul und im Standardabbild nicht
# enthalten — deshalb einmal selbst bauen. Genau dieselbe Zeile steht als
# Hinweis in api/caddy/anmeldung.Caddyfile.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/mholt/caddy-ratelimit

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

- [ ] **Schritt 2: `betrieb/Caddyfile` schreiben**

Die Vorlage aus `api/caddy/anmeldung.Caddyfile` wird hier zur laufenden Konfiguration. **Übernimm die Zonen wörtlich** — genau ihre Prüfung ist der Zweck dieses Plans.

```caddyfile
# Der Betriebsaufbau, lokal.
#
# Unterschiede zum Server, alle absichtlich und hier benannt:
#   - `:80` statt eines Domainnamens: Lokal gibt es kein DNS und kein
#     Let's-Encrypt-Zertifikat. Auf dem Server steht hier
#     `api.mtb-bielefeld.de`, und Caddy holt das Zertifikat von selbst.
#   - `reverse_proxy api:3000` statt `localhost:3000`: Im Compose-Netz
#     heißen die Dienste wie ihre Einträge.
# Alles andere — Zonen, Pfade, Kontingente — ist identisch mit dem, was
# später auf dem Server läuft. Genau deshalb ist dieser Aufbau mehr als
# eine Attrappe: Was hier greift, greift dort.

:80 {
	rate_limit {
		zone anmeldung {
			match {
				path /anmeldung/* /sitzung* /konto* /gast/*
			}
			key {remote_host}
			events 10
			window 1m
		}

		zone tourenanmeldung {
			match {
				path /termine/*
				method POST DELETE
			}
			key {remote_host}
			events 10
			window 1m
		}
	}

	reverse_proxy api:3000
}
```

- [ ] **Schritt 3: `betrieb/docker-compose.yml` schreiben**

```yaml
# Der vollständige Betriebsaufbau auf dem Entwicklungsrechner.
#
# Dieselbe Datei trägt später den Server — dort ändern sich nur die
# Umgebungswerte (.env) und der Domainname in der Caddyfile. Was hier
# zusammenspielt, spielt dort zusammen.
#
#   docker compose -f betrieb/docker-compose.yml up --build
#
# Danach: API über http://localhost, Postfach über http://localhost:8025

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    # Bewusst **keine** Portfreigabe: Auf die Datenbank kommt nur, wer im
    # Compose-Netz ist. Der Entwicklungs-Postgres aus api/docker-compose.yml
    # hört weiterhin auf 127.0.0.1:5432 — die beiden stören sich nicht.
    volumes:
      - betrieb-postgres:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}']
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      # Aus dem Wurzelverzeichnis, weil die geteilten Parser-Module unter
      # src/ liegen und nicht unter api/.
      context: ..
      dockerfile: api/Dockerfile
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      SMTP_HOST: mailpit
      SMTP_PORT: '1025'
      MAIL_ABSENDER: ${MAIL_ABSENDER}
      APP_BASIS_URL: ${APP_BASIS_URL}
      API_BASIS_URL: ${API_BASIS_URL}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    # Keine Portfreigabe: Erreichbar ist die API ausschließlich über Caddy.
    # Genau so steht sie später auch auf dem Server.
    #
    # `KALENDER_URL` steht hier bewusst **nicht**: `termine.ts` wählt mit
    # `process.env.KALENDER_URL ?? CALENDAR_ICS_URL`, und `??` greift nur bei
    # `undefined` — ein leer durchgereichter Wert wäre eine leere Adresse und
    # der Kalenderabruf scheiterte. Wer einen anderen Kalender will, trägt
    # die Zeile hier ein; sonst gilt der echte Vereinskalender.

  caddy:
    build: ./caddy
    ports:
      - '127.0.0.1:80:80'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-daten:/data
    depends_on:
      - api

  mailpit:
    # Fängt alle Mails ab und zeigt sie im Browser. **Nur lokal** — auf dem
    # Server steht hier nichts, dort verschickt ein echter Anbieter.
    image: axllent/mailpit
    ports:
      - '127.0.0.1:8025:8025'

volumes:
  betrieb-postgres:
  caddy-daten:
```

- [ ] **Schritt 4: `betrieb/.env.beispiel` schreiben**

```bash
# Vorlage. Kopieren nach betrieb/.env und ausfüllen:
#
#     cp betrieb/.env.beispiel betrieb/.env
#
# betrieb/.env ist von der Versionierung ausgeschlossen und gehört dort
# auch hin — das Repository ist öffentlich.

# Lokal genügt irgendetwas; auf dem Server ein langes, zufälliges Passwort.
POSTGRES_USER=mtbie
POSTGRES_PASSWORD=bitte-aendern
POSTGRES_DB=mtbie

# Absenderadresse der Anmelde- und Bestätigungsmails.
MAIL_ABSENDER=noreply@mtb-bielefeld.de

# Wohin der Magic Link zeigt. Lokal die App im Entwicklungsmodus, auf dem
# Server die veröffentlichte App.
APP_BASIS_URL=mtbie://anmeldung

# Wohin der Gäste-Storno-Link zeigt — muss vom Browser erreichbar sein.
API_BASIS_URL=http://localhost
```

- [ ] **Schritt 5: `.gitignore` ergänzen**

```
# Zugangsdaten des Betriebsaufbaus — das Repository ist öffentlich.
betrieb/.env
```

- [ ] **Schritt 6: `betrieb/LIESMICH.md` schreiben**

Kurz, für jemanden, der das in einem Jahr zum ersten Mal startet: was der Aufbau ist, wie man ihn startet, wo das Postfach liegt, und der ausdrückliche Hinweis, was gegenüber einem echten Server fehlt (die Liste aus dem Kopf dieses Plans).

- [ ] **Schritt 7: Starten und prüfen**

```bash
cp betrieb/.env.beispiel betrieb/.env
docker compose -f betrieb/docker-compose.yml up --build -d
docker compose -f betrieb/docker-compose.yml ps
curl -s http://localhost/gesundheit
```

Erwartet: alle vier Dienste laufen, `{"zustand":"bereit"}`.

**Wenn der Aufbau nicht startet:** Sieh in die Protokolle (`docker compose -f betrieb/docker-compose.yml logs api`), behebe die Ursache und schreib in den Bericht, was es war — das sind genau die Fehler, die dieser Plan finden soll.

- [ ] **Schritt 8: Commit**

```bash
git add betrieb/ .gitignore
git commit -m "Betriebsaufbau mit Caddy, Mailpit und Postgres"
```

---

## Aufgabe 3: Echter Mailversand über SMTP

Der `NichtEingerichteterMailer` bekommt einen Nachfolger — und Mailpit fängt ihn auf.

**Dateien:**
- Ändern: `api/src/mailer.ts` — `SmtpMailer`
- Ändern: `api/src/server.ts` — Mailer nach Umgebung wählen
- Ändern: `api/package.json` — `nodemailer`
- Anlegen: `api/tests/mailer-smtp.test.ts`

**Schnittstellen:**
- Liefert: `class SmtpMailer implements Mailer` mit `constructor(deps: { host: string; port: number; absender: string; benutzer?: string; passwort?: string })`
- Liefert: `waehleMailer(): Mailer` — `SmtpMailer`, wenn `SMTP_HOST` gesetzt ist, sonst `NichtEingerichteterMailer`

- [ ] **Schritt 1: `nodemailer` installieren**

```bash
cd api && npm install nodemailer && npm install --save-dev @types/nodemailer
```

`api/` hat ein eigenes `package.json` und ist von den Expo-Vorgaben nicht betroffen — hier ist `npm install` richtig, nicht `expo install`.

- [ ] **Schritt 2: Den fehlschlagenden Test schreiben**

`api/tests/mailer-smtp.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { NichtEingerichteterMailer, SmtpMailer, waehleMailer } from '../src/mailer.ts';

describe('waehleMailer', () => {
  it('nimmt SMTP, wenn ein Server eingetragen ist', () => {
    const mailer = waehleMailer({
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      MAIL_ABSENDER: 'noreply@example.org',
    });
    expect(mailer).toBeInstanceOf(SmtpMailer);
  });

  it('scheitert laut, wenn kein Server eingetragen ist', () => {
    const mailer = waehleMailer({});
    expect(mailer).toBeInstanceOf(NichtEingerichteterMailer);
  });

  it('scheitert laut, wenn der Server steht, aber der Absender fehlt', () => {
    // Halb eingerichtet ist schlimmer als gar nicht: Der Versand würde erst
    // beim ersten Anmeldeversuch scheitern, nicht beim Start.
    expect(() => waehleMailer({ SMTP_HOST: 'mailpit' })).toThrow(/Absender/);
  });
});
```

- [ ] **Schritt 3: Fehlschlag bestätigen, dann `mailer.ts` erweitern**

Ans Ende von `api/src/mailer.ts`:

```ts
import nodemailer from 'nodemailer';

/**
 * Verschickt über einen SMTP-Server.
 *
 * Kein eigener Mailserver — der Kommentar oben gilt weiter. Dies ist der
 * Anschluss an einen fremden: lokal an Mailpit, das alles abfängt und im
 * Browser zeigt; auf dem Server an den Anbieter, den der Verein wählt.
 */
export class SmtpMailer implements Mailer {
  readonly #transport: nodemailer.Transporter;
  readonly #absender: string;

  constructor({
    host,
    port,
    absender,
    benutzer,
    passwort,
  }: {
    host: string;
    port: number;
    absender: string;
    benutzer?: string;
    passwort?: string;
  }) {
    this.#absender = absender;
    this.#transport = nodemailer.createTransport({
      host,
      port,
      // Mailpit spricht kein TLS; ein echter Anbieter auf Port 587 schon.
      secure: port === 465,
      auth: benutzer && passwort ? { user: benutzer, pass: passwort } : undefined,
    });
  }

  async sende(an: string, betreff: string, text: string): Promise<void> {
    await this.#transport.sendMail({ from: this.#absender, to: an, subject: betreff, text });
  }
}

/**
 * Wählt den Mailer nach der Umgebung.
 *
 * Ohne `SMTP_HOST` bleibt es beim lauten Platzhalter — eine Umgebung ohne
 * Mailversand soll das merken, sobald jemand sich anzumelden versucht.
 * **Halb** eingerichtet scheitert dagegen sofort beim Start: Ein Server, der
 * anläuft und erst später merkt, dass ihm der Absender fehlt, verschiebt
 * den Fehler auf den ersten echten Nutzer.
 */
export function waehleMailer(umgebung: NodeJS.ProcessEnv = process.env): Mailer {
  const host = umgebung.SMTP_HOST;
  if (!host) return new NichtEingerichteterMailer();

  const absender = umgebung.MAIL_ABSENDER;
  if (!absender) {
    throw new Error(
      'SMTP_HOST ist gesetzt, MAIL_ABSENDER fehlt — ohne Absenderadresse ' +
        'nimmt kein Mailserver eine Nachricht an.',
    );
  }

  return new SmtpMailer({
    host,
    port: Number(umgebung.SMTP_PORT ?? 587),
    absender,
    benutzer: umgebung.SMTP_BENUTZER,
    passwort: umgebung.SMTP_PASSWORT,
  });
}
```

- [ ] **Schritt 4: `server.ts` umstellen**

```ts
import { NichtEingerichteterMailer, waehleMailer } from './mailer.ts';

const mailer = waehleMailer();
const app = baueApp({ pool, mailer });
```

Die Startmeldung aus Aufgabe 1 greift jetzt sinnvoll.

- [ ] **Schritt 5: Im Betriebsaufbau prüfen**

```bash
docker compose -f betrieb/docker-compose.yml up --build -d
docker compose -f betrieb/docker-compose.yml logs api | tail -5
```

Erwartet: „Mailversand: eingerichtet."

Dann eine Anmeldung anfordern und die Mail in Mailpit ansehen:

```bash
# Einladungscode erzeugen — im laufenden Container
docker compose -f betrieb/docker-compose.yml exec api npm run einladung:erzeugen -- test@example.org

# Mit dem ausgegebenen Code anmelden
curl -s -X POST http://localhost/anmeldung/anfordern \
  -H 'content-type: application/json' \
  -d '{"email":"test@example.org","einladungscode":"<CODE>"}'
```

Dann `http://localhost:8025` im Browser öffnen: Die Mail muss da sein, mit einem Link, der auf `APP_BASIS_URL` zeigt.

**Im Bericht festhalten:** Ob der Link stimmt, und ob der Text lesbar ankommt (Umlaute!).

- [ ] **Schritt 6: Alles prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/
git commit -m "Mailversand über SMTP, lokal von Mailpit gefangen"
```

---

## Aufgabe 4: `trustProxy` und die Ratenbegrenzung im Zusammenspiel

Der eigentliche Grund für diesen Plan: Zum ersten Mal steht ein echter Proxy davor.

**Dateien:**
- Ändern: `api/src/app.ts` — `trustProxy`
- Anlegen: `betrieb/pruefe-begrenzung.sh`
- Ändern: `api/caddy/anmeldung.Caddyfile` — Verweis auf den geprüften Aufbau

**Schnittstellen:**
- Ändert: `baueApp` setzt `trustProxy` abhängig von der Umgebung.

- [ ] **Schritt 1: Das Problem sichtbar machen, bevor du es behebst**

Bei laufendem Aufbau:

```bash
for i in $(seq 1 25); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost/anmeldung/anfordern \
    -H 'content-type: application/json' -d '{"email":"a@example.org"}'
done; echo
```

Erwartet **jetzt**: Nach etwa zehn Anfragen 429 von Caddy. Halte fest, ab welcher Anfrage.

Dann dasselbe gegen die API direkt — im Compose-Netz, an Caddy vorbei:

```bash
docker compose -f betrieb/docker-compose.yml exec caddy sh -c \
  'for i in $(seq 1 25); do wget -qO- --server-response --post-data="{\"email\":\"b@example.org\"}" \
   --header="content-type: application/json" http://api:3000/anmeldung/anfordern 2>&1 | grep "HTTP/"; done'
```

**Halte im Bericht fest, was du siehst.** Die Erwartung: Die API zählt alle Anfragen auf denselben Eimer, weil sie für jede Anfrage die Adresse von Caddy sieht — genau das Problem, das `trustProxy` löst.

- [ ] **Schritt 2: `trustProxy` einrichten**

In `api/src/app.ts`, bei den Fastify-Einstellungen:

```ts
/**
 * Hinter Caddy steht in `anfrage.ip` sonst immer die Adresse des Proxys —
 * ein einziger Eimer für den ganzen Verein, und die Begrenzung je IP wäre
 * wertlos (`ipbegrenzung.ts`).
 *
 * Bewusst nicht `true`, sondern die Adresse des Proxys: `true` würde jedem
 * geglaubt, der ein `X-Forwarded-For` mitschickt — dann setzt sich ein
 * Angreifer für jede Anfrage eine neue Adresse und die Begrenzung ist
 * wieder wertlos. `VERTRAUTER_PROXY` kommt aus der Umgebung; ohne den Wert
 * bleibt es bei `false`, was für die Entwicklung ohne Proxy richtig ist.
 */
const vertrauterProxy = process.env.VERTRAUTER_PROXY;
```

Und in der Fastify-Erzeugung: `trustProxy: vertrauterProxy ?? false`.

In `betrieb/docker-compose.yml` beim Dienst `api` ergänzen — die Adresse des Compose-Netzes:

```yaml
      VERTRAUTER_PROXY: ${VERTRAUTER_PROXY:-172.16.0.0/12}
```

Und in `.env.beispiel` mit Erklärung aufnehmen.

- [ ] **Schritt 3: Belegen, dass es jetzt greift**

`betrieb/pruefe-begrenzung.sh` — ein Skript, das den Aufbau prüft und **sagt, was es erwartet**, damit ein späterer Leser den Sinn versteht:

```bash
#!/usr/bin/env bash
# Prüft die beiden Ratenbegrenzungs-Schichten gegen den laufenden Aufbau.
#
#     docker compose -f betrieb/docker-compose.yml up -d
#     betrieb/pruefe-begrenzung.sh
#
# Was hier geprüft wird, war bis zu diesem Plan reine Annahme: dass Caddys
# Pfad- und Methodenmuster greifen, dass die Belegungsabfrage ungezählt
# bleibt, und dass die API hinter dem Proxy die echte Adresse sieht.
set -euo pipefail

BASIS=${BASIS:-http://localhost}

echo "--- Anmeldung: erwartet 429 nach etwa 10 Anfragen ---"
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASIS/anmeldung/anfordern" \
    -H 'content-type: application/json' -d '{"email":"grenze@example.org"}')
  printf '%s ' "$code"
done
echo

echo "--- Belegung lesen: erwartet durchgehend 404 (Termin gibt es nicht), NIE 429 ---"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/termine/gibtsnicht~0")
  printf '%s ' "$code"
done
echo

echo "--- Gesundheit: erwartet durchgehend 200, ungebremst ---"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/gesundheit")
  printf '%s ' "$code"
done
echo
```

Ausführbar machen (`chmod +x`), laufen lassen, **die tatsächliche Ausgabe in den Bericht**.

**Erwartung, die belegt werden muss:** Die Belegungsabfrage darf in dreißig Anfragen kein einziges 429 zeigen — sonst greift die Ausnahme aus `NUR_SCHREIBEND_GEZAEHLT` nicht, und eine App, die eine Terminliste öffnet, würde im Alltag ausgesperrt.

- [ ] **Schritt 4: Die Vorlage mit dem Geprüften abgleichen**

In `api/caddy/anmeldung.Caddyfile` den Satz „Angewandt wird das in Plan 4 (Inbetriebnahme). Bis dahin ist es eine Vorlage, kein laufender Schutz." ersetzen durch einen Verweis auf `betrieb/Caddyfile` und den Hinweis, dass die Zonen dort gegen einen laufenden Caddy geprüft wurden. **Weichen die beiden Dateien inhaltlich ab, ist die geprüfte die Wahrheit** — zieh die Vorlage nach.

- [ ] **Schritt 5: Alles prüfen und committen**

```bash
cd api && npm test && npm run typecheck
git add api/ betrieb/
git commit -m "trustProxy und die Ratenbegrenzung gegen laufenden Caddy geprüft"
```

---

## Aufgabe 5: Der Ablauf von Anfang bis Ende

Einmal alles, wie es ein Mitglied erlebt — und ein Skript, das es nachvollziehbar macht.

**Dateien:**
- Anlegen: `betrieb/pruefe-ablauf.sh`
- Ändern: `betrieb/LIESMICH.md` — der geprüfte Ablauf als Anleitung

- [ ] **Schritt 1: `betrieb/pruefe-ablauf.sh` schreiben**

Ein Skript, das den vollständigen Weg geht und an jeder Stelle prüft, statt nur Befehle abzufeuern: Einladungscode erzeugen → Anmeldung anfordern → Magic Link **aus Mailpits API holen** (`http://localhost:8025/api/v1/messages`) → einlösen → mit dem Zugangs-Token `GET /konto` → Belegung eines echten Termins abfragen → anmelden → abmelden.

Jeder Schritt gibt aus, was er erwartet und was er bekommen hat; das Skript endet mit einer Zusammenfassung und einem von Null verschiedenen Rückgabewert, wenn etwas nicht stimmte.

**Der Terminschlüssel** muss aus dem echten Kalender kommen — hol ihn über einen kleinen Aufruf gegen die API oder lies ihn aus den Protokollen. Schreib ins Skript, wie du an ihn kommst, statt einen zu erfinden.

- [ ] **Schritt 2: Laufen lassen — und die Fehler beheben, die dabei auftauchen**

Das ist der eigentliche Zweck dieser Aufgabe. Erwartbare Stolpersteine:

- Der Magic Link in der Mail zeigt auf `APP_BASIS_URL` — passt das Format zu dem, was `extrahiereMagicToken` erwarten wird (Plan 3)?
- Kommen Umlaute in Betreff und Text richtig an?
- Antwortet `GET /termine/:schluessel` mit dem echten Kalender, oder scheitert der Abruf im Container am Netz?

**Jeden Fund im Bericht festhalten und beheben.** Wenn ein Fund den Code betrifft und nicht die Konfiguration, gehört er in einen eigenen Commit mit eigener Begründung.

- [ ] **Schritt 3: `betrieb/LIESMICH.md` vervollständigen**

Der geprüfte Ablauf wird zur Anleitung: Wie startet man, wie legt man einen Einladungscode an, wo sieht man die Mail, wie meldet man sich an. Jemand, der das Projekt übernimmt, soll damit in zehn Minuten einen laufenden Aufbau haben.

- [ ] **Schritt 4: Commit**

```bash
git add betrieb/
git commit -m "Der Anmeldeablauf, von Anfang bis Ende geprüft"
```

---

## Nach diesem Plan

Der vollständige Betriebsaufbau läuft lokal. Die Caddy-Konfiguration, `trustProxy`, die beiden Ratenbegrenzungs-Schichten und der Mailversand sind zum ersten Mal gegen etwas Laufendes geprüft statt gegen eine Annahme. Plan 3 (die App) kann gegen einen echten Server entwickelt werden.

**Was für den echten Server bleibt (Plan 4b):**

- Domain und DNS, echtes Zertifikat von Let's Encrypt (in der Caddyfile eine Zeile)
- Ein Mailanbieter mit Sitz in der EU statt Mailpit — samt SPF, DKIM und DMARC, ohne die die Zustellbarkeit leidet
- SSH nur mit Schlüssel, Firewall auf 22/80/443, automatische Sicherheitsupdates
- Backups mit `restic`, **einmal im Quartal testweise zurückgespielt** — ein nie geprüftes Backup ist kein Backup
- Die rechtlichen Punkte aus der Spec: Verzeichnis von Verarbeitungstätigkeiten, Auftragsverarbeitungsvertrag, neue Datenschutzerklärung, Einwilligungstext für Gäste
- Die Frage, die noch niemand beantwortet hat: **Wer betreibt das auf Dauer?**
