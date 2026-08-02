# Hinweise für die Arbeit an diesem Projekt

Kurzfassung der Eigenheiten, die man diesem Projekt nicht ansieht. Wer sie nicht
kennt, baut mit grüner CI etwas kaputt.

## Vor jedem Commit

```bash
npm test            # 172 Tests, ~1 Sekunde
npm run typecheck
npx expo install --check
```

Vor größeren Änderungen zusätzlich:

```bash
npm run vorschau    # baut die Web-Fassung, rendert sie, meldet Render-Fehler
```

## Die fünf Fallen

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

## Aufbau

| Bereich | Ort |
| --- | --- |
| Bildschirme | `app/` (expo-router: Dateiname = Adresse) |
| Darstellung | `src/ui/`, `src/theme.ts`, `src/features/*/[Komponente].tsx` |
| Datenbeschaffung | `src/data/` — `repository.ts` ist der Umstiegspunkt für ein Backend |
| Auswertung | `src/data/ical/`, `src/data/web/`, `src/data/parse/` |
| Erinnerungen | `src/notifications/` — Logik getrennt von der System-Anbindung |
| Vereinstexte | `src/content/club.ts` (von Hand gepflegt) |

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

## Sprache

Code, Kommentare und Commit-Nachrichten auf Deutsch — der Verein soll das Projekt
lesen und weiterführen können. Fachbegriffe, für die es keine gute Entsprechung
gibt (Trail, Guide, Feed), bleiben stehen.
