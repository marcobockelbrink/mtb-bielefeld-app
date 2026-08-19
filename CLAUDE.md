# Hinweise für die Arbeit an diesem Projekt

Kurzfassung der Eigenheiten, die man diesem Projekt nicht ansieht. Wer sie nicht
kennt, baut mit grüner CI etwas kaputt.

## Vor jedem Commit

```bash
npm test            # 284 Tests, unter einer Sekunde
npm run typecheck
npx expo install --check
```

Vor größeren Änderungen zusätzlich:

```bash
npm run vorschau    # baut die Web-Fassung, rendert sie, meldet Render-Fehler
```

## Die sechs Fallen

### 1. Expo gibt Paketversionen vor — auch TypeScript

`node_modules/expo/bundledNativeModules.json` legt Versionen fest, teils exakt
(React auf `19.2.3`). Wer eines dieser Pakete anhebt, bekommt **grüne Tests, eine
zufriedene Typprüfung und ein fehlerfreies Bündel** — kaputt geht es erst auf
einem echten Telefon.

Deshalb: neue Versionen ausschließlich über `npx expo install`, nie von Hand und
nie per Dependabot. `.github/dependabot.yml` nimmt diese Pakete aus,
`npx expo install --check` wacht in der CI darüber.

Nachgeprüft: Mit TypeScript 7 statt 6 laufen Typprüfung, alle Tests und das
Bündeln durch — `expo install --check` meldet die Abweichung trotzdem.

### 2. Tests und Bündeln beweisen nicht, dass die App etwas anzeigt

`expo export` beweist nur, dass sich der Code bündeln lässt. Ob die Oberfläche
etwas Sinnvolles darstellt, prüft `npm run vorschau`.

Konkreter Fall: `Link asChild` ersetzt das äußere Element, wobei dessen Stil
verlorengeht. Die Terminkarten standen dadurch ohne Hintergrund und Rahmen da,
Uhrzeit und Titel untereinander. 149 Tests, Typprüfung und beide Plattform-Bündel
waren dabei durchgehend grün.

**Merksatz:** Gestaltung gehört auf eine innere Ansicht, nicht auf das
`Pressable` innerhalb eines `Link asChild`.

### 3. Im Browser braucht es den Vermittler

Weder der Google-Kalender noch mtb-bielefeld.de senden
`Access-Control-Allow-Origin`. Ein Browser verweigert deshalb den direkten
Zugriff. Für die Web-Fassung:

```bash
npm run proxy    # Terminal 1
npm start        # Terminal 2, dann "w"
```

Ohne den Vermittler bleiben Termine und Beiträge leer. **Auf iOS und Android
gibt es diese Beschränkung nicht** — dort lädt die App immer direkt, auch in der
veröffentlichten Fassung.

### 4. Zeit wird in Ortszeit gerechnet, nicht in UTC

Serientermine werden in Bielefelder Ortszeit ausgerechnet und erst danach in
echte Zeitpunkte umgewandelt (`src/data/ical/`). Nur so bleibt das
MittwochsRudel über die Zeitumstellung hinweg um 18:00 Uhr, statt auf 17:00 zu
wandern. Wer hier mit Millisekunden rechnet, bricht es.

### 5. Die Vereinsfarbe steht an genau einer Stelle

`src/brand.ts`. Dort ist auch begründet, warum es `#25749E` ist und nicht einer
der drei anderen Kandidaten. Nach einer Änderung:

```bash
python3 tools/logo-assets.py   # Symbole und Startbild ziehen nach
```

Farbwerte nicht anderswo hinschreiben — `tools/logo-assets.py` liest sie aus
`src/brand.ts`.

### 6. Ohne Angabe ist es ein dev-Bau

Seit dem 7. August 2026 gibt es zwei Server: den Prüfserver
`app-dev.mtb-bielefeld.de` und den Vereinsserver. Welchen die App anspricht,
entscheidet **eine Variable beim Bauen**:

```bash
npm start            # örtlicher Aufbau
npm run start:dev    # gegen den Prüfserver
npm run vorbereiten:prod   # erzeugt ios/ und android/ für den Verein
```

**Der prod-Weg hat zwei Schritte, und die Variable gehört in beide:**
`npm` setzt eine vorangestellte Variable nur für den einen Befehl.

```bash
npm run vorbereiten:prod
EXPO_PUBLIC_APP_UMGEBUNG=prod npx expo run:ios --configuration Release
```

Fehlt sie im zweiten, heißt die App außen „MTB Bielefeld", hat
`app.mtb-bielefeld.de` angemeldet — und spricht innen mit dem Prüfserver.

**Zwei Dinge schreibt `expo prebuild` still um**, und beide sind schon
mehrfach zurückgenommen und wieder erschienen:

- `npm run ios` und `npm run android` werden zu `expo run:*` (nativer Bau
  statt Expo Go). Das ist inzwischen **richtig** — Bündelkennung, Schema
  und Entitlements stecken im nativen Projekt, ein Metro-Neustart reicht
  dafür nicht. Nicht zurückdrehen.
- `tsconfig.json` verliert `.expo/types/**/*.ts` aus `include`. Das ist
  **falsch** und gehört zurückgesetzt: `.expo` ist ein Punkt-Verzeichnis,
  in das `**/*.ts` nicht hineingreift, und die erzeugten Routentypen
  fielen sonst aus der Prüfung — bei grüner Typprüfung.

Wer eine Fassung für den Verein baut und `EXPO_PUBLIC_APP_UMGEBUNG=prod`
vergisst, bekommt eine App, die auf den Prüfserver zeigt: **grüne Tests,
zufriedene Typprüfung, fehlerfreies Bündel** — und Mitglieder, deren
Anmeldungen in einer Datenbank landen, die niemand ansieht. Die
Voreinstellung ist absichtlich die harmlose Richtung; der Umkehrschluss
wäre eine App, die ungefragt echte Mitgliederdaten anfasst.

Auffallen würde es immerhin am Namen: Die dev-Fassung heißt „MTB Bielefeld
(dev)", trägt die Bündelkennung `de.mtbbielefeld.app.dev` und liegt als
eigenes Symbol neben der echten.

Zwei Stellen müssen dabei dieselbe Domain nennen — `src/config.ts` für die
App und `app.config.js` für das Betriebssystem. Laufen sie auseinander,
öffnet ein geteilter Link den Browser statt der App, und **nur** die
Rauchprobe merkt es.

Das Präfix `EXPO_PUBLIC_` ist keine Zier: Expo ersetzt beim Bündeln
ausschließlich Variablen mit diesem Präfix. Ein `APP_UMGEBUNG` ohne
Präfix wäre in der App `undefined` — sie fiele stumm auf dev zurück,
während die Bündelkennung „prod" sagt.

## Aufbau

| Bereich | Ort |
| --- | --- |
| Bildschirme | `app/` (expo-router: Dateiname = Adresse) |
| Darstellung | `src/ui/`, `src/theme.ts`, `src/features/*/[Komponente].tsx` |
| Datenbeschaffung | `src/data/` — `repository.ts` ist der Umstiegspunkt für ein Backend |
| Auswertung | `src/data/ical/`, `src/data/web/`, `src/data/parse/` |
| Erinnerungen | `src/notifications/` — Logik getrennt von der System-Anbindung |
| Vereinstexte | `src/content/club.ts` (von Hand gepflegt) |
| Umgebung (dev/prod) | `app.config.js` fürs Betriebssystem, `src/config.ts` für die App |

Wiederkehrendes Muster: **Rechenlogik ohne React Native, damit sie ohne Gerät
prüfbar bleibt.** Die Anbindung ans Betriebssystem steht jeweils in einer
eigenen Datei (`notifications/scheduler.ts` gegenüber `notifications/index.ts`,
`backgroundRefresh.ts` gegenüber `backgroundTask.ts`).

## Gleichzeitig arbeiten

Läuft mehr als eine Sitzung am Projekt: **immer `git pull --rebase`, niemals
`git push --force`.** Ein Force-Push löscht die Arbeit der anderen Sitzung
unwiederbringlich.

Sinnvolle Aufteilung, wenn zwei parallel arbeiten:

- Oberfläche: `app/**`, `src/ui/**`, `src/theme.ts`, `src/features/**`
- Daten und Werkzeuge: `src/data/**`, `src/notifications/**`, `tools/**`,
  `.github/**`, `tests/**`

Gemeinsam ist dann nur `src/brand.ts`.

## Claudes Notizen liegen im Repository

Unter `.claude/memory/` — was in den Gesprächen an Entscheidungen und
Stolperstellen angefallen ist, mit `MEMORY.md` als Inhaltsverzeichnis. Dort
steht Wissen, das sich weder aus dem Quelltext noch aus der Historie ergibt:
warum Instagram vertagt ist, was dem Server noch fehlt, welcher Schlüssel wo
liegt.

Normalerweise legt Claude Code das unter `~/.claude/projects/…/memory/` ab,
also außerhalb des Projekts und auf genau einem Rechner. Deshalb steht dort
eine Verknüpfung hierher. **Auf einem neuen Rechner einmal nach dem Klonen:**

```bash
./tools/gedaechtnis-verknuepfen.sh
```

Ohne das schreibt Claude in einen leeren Ordner daneben und fängt bei null an —
die Dateien hier bleiben trotzdem lesbar.

**Was der Klon nicht mitbringt** und von Hand mitmuss: `~/.ssh/mtb-verein`
(Zugang zum Server), `~/.ssh/mtb-sicherung.age-key` (ohne ihn ist **jede**
Sicherung wertlos) und die zugehörigen `~/.ssh/config`-Einträge. Absichtlich —
das Repository ist öffentlich.

## Sprache

Code, Kommentare und Commit-Nachrichten auf Deutsch — der Verein soll das Projekt
lesen und weiterführen können. Fachbegriffe, für die es keine gute Entsprechung
gibt (Trail, Guide, Feed), bleiben stehen.
