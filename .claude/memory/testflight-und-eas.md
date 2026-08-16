---
name: testflight-und-eas
description: "Bezahltes Apple-Konto (Team 755278A9P4), EAS-Projekt und der TestFlight-Weg des dev-Builds — Stand 12.08.2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-16T10:23:00.762Z
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

**Release 0.8.5, 13.08.2026:** gebaut und eingereicht (Fotoalben, Mitgliederverwaltung, echter Mailweg). `ascAppId 6800879450` steht im Submit-Profil — ein Release ist jetzt ein Befehl: `npx eas-cli build --platform ios --profile dev-testflight --non-interactive --auto-submit`.

**13.08.2026 abends:** 0.8.8 gebaut und eingereicht (Löschen in der Verwaltung, Guide-Vererbung, CodeQL-Härtungen). Screenshots für App Store Connect erzeugt `VORSCHAU_ASC=1 node tools/serve-und-schiessen.mjs` → docs/appstore-screenshots (1290×2796, unversioniert).

**0.8.8 ist in TestFlight angekommen** (13.08. abends, von Marco bestätigt) — der Stand auf den Geräten entspricht damit dem Repository.

**0.8.9, 13.08. spät:** Gerätetest-Funde behoben — GuideKarte auch für Verwaltung (Entwürfe waren sonst unveröffentlichbar, Kind-Anmeldung schlug deshalb fehl), Ort öffnet die Karten-App, native Datumswähler (neues `src/ui/DatumsFeld.tsx`). Auf dem Server hängt ggf. noch der Entwurf „Griechenland Strand" — veröffentlichen kann ihn Marco per App ab 0.8.9 oder per SQL-Einzeiler.

**Security-Seite leer seit 13.08. spät:** CodeQL 0 (Pfadprüfung des Vorschau-Servers in analysierbare Form gebracht — erst normalisieren, dann prüfen, dann denselben Wert benutzen), Dependabot 0 (beide image-size-Alerts als tolerable_risk geschlossen, Begründung am Alert, Wiedervorlage 01.11.2026 im Audit-Skript). 0.8.9 zu Apple hochgeladen.

**Stand 16.08.2026: 0.11.2** (Build `7bf78ce9`, eingereicht). Was in
welcher Fassung steckt, steht in der Historie — hier nur die aktuelle
Nummer, damit die nächste Anhebung nicht geraten wird. Angehoben wird an
**drei** Stellen: `package.json`, `api/package.json`, `app.config.js`.

**Der Ablauf eines Release, in dieser Reihenfolge:**

1. `npm test`, `npm run typecheck`, `npx expo install --check`
2. Wenn die API mitgeht: `node --experimental-strip-types -e "import('./api/src/app.ts')"` —
   fängt die Syntax ab, die vitest durchwinkt und den Container umbringt
3. Version in den drei Dateien, committen, `git push`
4. **Server zuerst**, App danach: eine App, die einen Endpunkt erwartet,
   den es noch nicht gibt, sieht aus wie ein App-Fehler
5. `npx eas-cli build --platform ios --profile dev-testflight --non-interactive --auto-submit`

Schritt 5 dauerte am 16.08. keine zehn Minuten bis „bei Apple".
