# Betriebsaufbau, lokal

Vier Container, eine Datei: Postgres, die API, Caddy als Proxy davor und
Mailpit als Postfach daneben. Dieselbe `docker-compose.yml` trägt später den
echten Server — hier laufen nur lokale Adressen und ein Mailfänger statt
eines echten Anbieters. Was hier zusammenspielt, spielt dort zusammen.

## Starten

```bash
cp betrieb/.env.beispiel betrieb/.env
docker compose -f betrieb/docker-compose.yml up --build
```

Der erste Bau von Caddy dauert einige Minuten — `xcaddy` baut das
Ratenbegrenzungs-Modul aus dem Quelltext und braucht dafür Netz. Das ist
normal, kein Fehler.

Danach:

- API über `http://localhost` (durch Caddy)
- Postfach über `http://localhost:8025` — jede Mail, die die App
  verschickt, landet hier statt bei einem echten Empfänger.

Beenden mit `Strg+C` oder, im Hintergrund gestartet
(`up --build -d`), mit `docker compose -f betrieb/docker-compose.yml down`.

## In zehn Minuten anmelden — der Weg von Hand

So sieht der Ablauf aus, den ein Mitglied erlebt. Wer ihn einmal von Hand
geht, versteht hinterher, was `pruefe-ablauf.sh` weiter unten automatisch
tut.

**1. Einladungscode erzeugen.** Ohne Code kommt niemand neu herein — das ist
der Zaun um den Vereinsbereich. Der Code gilt einmal und ist an die Adresse
gebunden, für die er ausgestellt wurde:

```bash
docker compose -f betrieb/docker-compose.yml exec api \
  npm run einladung:erzeugen -- vorname.nachname@example.org
```

Die Ausgabe nennt Adresse und Code. Wer schon Mitglied ist, braucht keinen —
für den zweiten und jeden weiteren Login genügt die Adresse allein.

**2. Anmeldung anfordern.** Ein Passwort gibt es nicht; stattdessen kommt
ein Link per Mail:

```bash
curl -X POST http://localhost/anmeldung/anfordern \
  -H 'content-type: application/json' \
  -d '{"email":"vorname.nachname@example.org","einladungscode":"<Code aus Schritt 1>"}'
```

Die Antwort lautet immer gleich — „Wenn die Angaben stimmen, ist eine Mail
unterwegs." Das ist kein Versehen: Eine Antwort, die zwischen bekannt und
unbekannt unterscheidet, verriete jedem Fragenden, wer im Verein ist.

**3. Die Mail ansehen.** `http://localhost:8025` im Browser öffnen — Mailpit
fängt jede Mail ab, nichts geht nach draußen. Darin steht ein Link der Form
`mtbie:///anmeldung/<Token>`. Die drei Schrägstriche sind Absicht; warum,
steht in `betrieb/.env.beispiel` bei `APP_BASIS_URL`.

**4. Den Link einlösen.** Auf dem Telefon täte das die App; hier von Hand:

```bash
curl -X POST http://localhost/anmeldung/einloesen \
  -H 'content-type: application/json' -d '{"token":"<Token aus der Mail>"}'
```

Zurück kommen zwei Token: `zugang` gilt fünfzehn Minuten und geht bei jeder
Anfrage mit, `erneuerung` gilt sechzig Tage und holt neuen Zugang.

**5. Damit arbeiten.** Der Zugangs-Token gehört in den `Authorization`-Kopf:

```bash
curl http://localhost/konto -H "Authorization: Bearer <zugang>"
```

## Alles auf einmal prüfen

```bash
betrieb/pruefe-ablauf.sh      # der ganze Weg oben, jeder Schritt hart geprüft
betrieb/pruefe-begrenzung.sh  # die beiden Ratenbegrenzungs-Schichten
npm run rauchprobe            # die Module der App gegen diese laufende API
```

Die ersten beiden prüfen die API von außen, mit `curl`. Die **Rauchprobe**
prüft etwas anderes: Sie lädt dieselben Module, die auf dem Telefon laufen
(`src/data/api.ts`, `src/konto/magicLink.ts`), und lässt sie gegen diesen
Aufbau arbeiten. Damit fällt auf, was `npm test` nicht sehen kann — dort
stellt die Suite `fetch` selbst, und eine Attrappe antwortet immer so, wie
der Schreibende es erwartet hat.

`pruefe-ablauf.sh` geht denselben Weg bis zur Tourenanmeldung durch — samt
einem echten Termin aus dem Vereinskalender — und endet mit einem Wert
ungleich Null, sobald ein Schritt nicht liefert, was er soll.

Beide brauchen eine **frische Minute**: Die Ratenbegrenzung lässt zehn
Anfragen je Minute auf die Anmeldewege zu. Zwei Läufe kurz hintereinander
enden im 429 — das ist die Bremse von vorhin, kein kaputter Ablauf. Die
Skripte sagen das auch selbst, wenn es passiert.

## Was das prüft

- Caddys Pfad- und Methoden-Muster gegen echte Anfragen
- die zwei Ratenbegrenzungs-Zonen aus `api/caddy/anmeldung.Caddyfile`, hier
  zum ersten Mal wörtlich angewandt statt nur als Vorlage
- `trustProxy`: dass die API hinter Caddy die Adresse des Anfragenden sieht
  und nicht die des Proxys — sonst zählte die Begrenzung alle auf einen Eimer
- Migrationen beim Start eines frischen Datenbank-Volumes
- Mailversand über SMTP, samt Umlauten in Betreff und Text
- den vollständigen Anmeldeablauf vom Einladungscode bis zur Tourenanmeldung
- dass die API aus dem Container heraus den echten Vereinskalender liest

## Was gegenüber einem echten Server fehlt

Dieser Aufbau ist Konfiguration und Zusammenspiel — kein Ersatz für den
Betrieb selbst. Ungeprüft bleiben:

- echtes TLS-Zertifikat und DNS (hier `:80` ohne Domain, siehe Kommentar in
  `betrieb/Caddyfile`)
- Zustellbarkeit bei echten Mailanbietern (Mailpit fängt alles lokal ab)
- Verhalten unter Last
- SSH-Härtung, Firewall, automatische Sicherheitsupdates
- Rücksicherung aus einem entfernten Backup

Das kommt in Plan 4b (echte Inbetriebnahme) und braucht Entscheidungen des
Vereins.

## Die Entwicklungsdatenbank bleibt unberührt

`api/docker-compose.yml` startet ein eigenes Postgres auf
`127.0.0.1:5432` für `npm test`. Dieser Aufbau hier bekommt ein eigenes
Volume (`betrieb-postgres`) und gibt seinen Postgres-Port nicht nach außen
frei — beide laufen nebeneinander, ohne sich in die Quere zu kommen.
