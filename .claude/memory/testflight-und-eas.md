---
name: testflight-und-eas
description: "Bezahltes Apple-Konto (Team 755278A9P4), EAS-Projekt und der TestFlight-Weg des dev-Builds — Stand 12.08.2026"
metadata:
  type: project
---

Seit dem 11.08.2026 gibt es ein **bezahltes Apple-Entwicklerkonto**, Team
`755278A9P4`. Die AASA-Datei auf dem Prüfserver nennt es seit dem
12.08.2026 (`AASA_APP_ID` in `betrieb/.env`, von außen nachgemessen).

**EAS Build** ist eingerichtet: Projekt `7db10909-1416-435b-9dec-c6ab28113289`
unter dem Expo-Konto `marco.bockelbrink`, ID in `app.config.js` unter
`extra.eas`. Zwei Profile in `eas.json`: `dev-testflight` (backt
`EXPO_PUBLIC_API_URL=api-dev` ein — Falle 6) und `prod` (wartet auf den
Vereinsserver). In App Store Connect existiert die App
`de.mtbbielefeld.app.dev` („MTB Bielefeld (dev)", SKU
`mtb-bielefeld-app-dev`); der erste Build wurde am 12.08.2026 gebaut und
eingereicht.

**Drei Handgriffe, die Zeit gekostet haben:**
- `eas.json` erlaubt keine erfundenen Felder — Kommentare gehören in
  CLAUDE.md, nicht ins JSON.
- Interaktive EAS-Befehle (`login`, erste Apple-Anmeldung bei `build`/
  `submit`) laufen **nicht** im `!`-Fenster der Sitzung (kein lesbares
  stdin) — dafür das normale Terminal nehmen.
- Der lokale Simulator-Bau scheitert auf dem Intel-Mac an
  `resource fork … detritus` beim Signieren von ExpoModulesJSI —
  ungelöst; EAS umgeht das komplett.

**Why:** Der Gerätenachweis der Universal Links und jede Verteilung an
Mitglieder laufen ab jetzt über diesen Weg.

**How to apply:** Neuer Build: `npx eas-cli build --platform ios --profile
dev-testflight`, dann `… submit … --latest`. Verwandt:
[[ios-geraetebau-push-berechtigung]], [[mtb-server-offene-punkte]]

**12.08.2026, echtes iPhone:** Build über TestFlight installiert, der geteilte Link öffnet die App. Der Gerätenachweis der Universal Links ist erbracht — mit Team 755278A9P4 und der AASA vom Prüfserver.
