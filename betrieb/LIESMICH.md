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

## Was das prüft

- Caddys Pfad- und Methoden-Muster gegen echte Anfragen
- die zwei Ratenbegrenzungs-Zonen aus `api/caddy/anmeldung.Caddyfile`, hier
  zum ersten Mal wörtlich angewandt statt nur als Vorlage
- Migrationen beim Start eines frischen Datenbank-Volumes
- (sobald Aufgabe 3 den echten SMTP-Versand einrichtet:) Mailversand über
  Mailpit und der vollständige Anmeldeablauf vom Formular bis zum
  eingelösten Link

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
