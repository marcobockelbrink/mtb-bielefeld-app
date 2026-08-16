# Handoff — Runde 11: Eingaben (Familie + Training)

Zwei aus der Beta gemeldete Stellen. Beide sind reine App-Änderungen: **keine
Migration, kein API-Endpunkt, kein neues Paket.**

| # | Stelle | Meldung | Vorschlag |
| --- | --- | --- | --- |
| 1 | Familie: Mitglied hinzufügen | „Tastatur geht über die Eingabe, man sieht nichts" | `01-familie-tastatur.md` |
| 2 | Neues Training anlegen | „Eingaben sind so lala" | `02-training-eingabe.md` |

## Entschieden

Marco hat **11a** gewählt: Das Familien-Formular wird eine **eigene Seite**
(`01`, Teil B). Teil A (`src/ui/Blatt.tsx`) wird trotzdem gebaut — er behebt
denselben Fehler in den beiden anderen Blättern (Fotos, Themenfilter).
Beim Training gilt die Empfehlung **11c** (Chips + Zähler); 11d ist in `02`
nur als verworfene Alternative dokumentiert.

## Reihenfolge

1. **`01`, Teil A (`src/ui/Blatt.tsx`)** — der Fehler, ein Eingriff in eine
   Datei, wirkt sofort in allen Blättern. Das ist der Teil, der in die nächste
   Beta muss.
2. **`01`, Teil B (11a)** — Familien-Formular auf eigener Route.
3. **`02` (11c)** — Trainings-Formular. Kein Fehler, sondern Bedienung; kann in
   einem eigenen Durchgang laufen.

## Entwurfsbild

`Eingaben-Vorschlag.dc.html` im Paket zeigt alle vier Bildschirme im Maßstab
390 × 844 — verbindlich sind **11a** (zwei Telefone links) und **11c**. Im
Browser öffnen, `support.js` liegt daneben.

## Was gilt, unverändert

- Mindest-Tippziel **44 pt**, in neuen Fußleisten **50 pt** für die Hauptaktion.
- Farben, Abstände und Schnitte ausschließlich aus `src/theme.ts` — keine neuen
  Werte, keine Emoji, Symbole aus `@expo/vector-icons` (Ionicons).
- Zu einer gesetzten `fontFamily` **kein** `fontWeight` (Android).
- Deutsche Bezeichner im Code, wie im Rest des Projekts.

## Akzeptanz (auf einem echten Telefon, nicht nur im Simulator)

1. Einstellungen → Meine Familie → Familienmitglied hinzufügen → „Erwachsener" →
   ins E-Mail-Feld tippen: **Feld und Absende-Knopf bleiben sichtbar.**
2. Dasselbe mit „Kind" und offener Tastatur: Formular ist durchscrollbar, ein
   Antippen des Schalters „Kann Bilder hochladen" wirkt beim **ersten** Tippen
   (nicht erst nach dem Schließen der Tastatur).
3. Jugend → Training anlegen: Ein Training für morgen 17:30 am zuletzt
   genutzten Treffpunkt entsteht **ohne einmal die Tastatur** zu öffnen.
4. Beides mit Systemschriftgröße „groß" gegenprüfen.
