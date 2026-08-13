# Mitgliederverwaltung in der App

Einladen, Rollen zuteilen, Jugend-Zugehörigkeit pflegen — bisher nur per
CLI über SSH, also nur durch Marco. Der Verein braucht das ohne Terminal.

## Entschieden

- **Kein Web-UI.** Eine dritte Oberfläche mit eigener Anmeldung und eigenem
  Angriffsprofil, für zwei, drei Berechtigte — die App hat Anmeldung,
  Rollen und die Muster (Foto-Sichtung) schon. Bereich „Verwaltung" in den
  Einstellungen, sichtbar nur mit Rolle `verwaltung`; die API prüft ohnehin.
- **Die Einladung verschickt die Mail selbst** — SMTP steht seit dem
  12.08.2026. Adresse eintippen genügt; kein Code-Weiterreichen mehr. Steht
  `TESTFLIGHT_LINK` in der `.env`, nimmt die Mail ihn mit auf.
- **Jugend wird ein Feld am Mitglied** (`mitglied.jugend`). Die bisherige
  Herleitung „hat schon mal ein Kind angemeldet" bleibt als ODER bestehen —
  `gehoertZurJugend` war absichtlich die eine Stelle dafür, nur sie ändert
  sich.
- **Die letzte Verwaltungsrolle ist unentziehbar.** Sonst sperrt sich der
  Verein selbst aus; der Rückweg wäre wieder das CLI.
- Die CLI-Werkzeuge bleiben als Rückweg bestehen.

## Endpunkte (alle nur `verwaltung`, 403 für andere Angemeldete)

```
GET    /verwaltung/mitglieder          Liste samt offener Einladungen
POST   /verwaltung/einladungen         { email } → legt an, verschickt Mail
PATCH  /verwaltung/mitglieder/:id      { rolle? , jugend? }
```

`/verwaltung` kommt zusätzlich in `IP_GESCHUETZTE_PFAD_PRAEFIXE`.

## Aufgaben

- [ ] 1: Migration 014 (`mitglied.jugend`), `verwaltung.ts` mit Tests
- [ ] 2: Endpunkte samt Rechte-Tests (401/403, letzte Verwaltung)
- [ ] 3: App: Bereich in den Einstellungen — Liste, Einladen, Rolle/Jugend
