# 2 — Neues Training: Eingaben

Gemeldet: „Auch die Eingaben bei Trainings sind so lala."

## Befund (`app/jugend/neu.tsx`)

Sechs Angaben, fünf davon in optisch **identischen** Feldern, dazwischen der
iOS-Kompaktwähler:

| Feld | heute | Problem |
| --- | --- | --- |
| Datum | `DatumsFeld` (iOS `display="compact"`) | linksbündiger Systemkasten, kleinstes Ziel der Seite, sieht wie ein Fremdkörper aus |
| Uhrzeit | dito | dieselbe Uhrzeit wird jede Woche neu gestellt |
| Ort | `TextInput` | wird jede Woche gleich getippt, Tippfehler streuen die Treffpunktnamen |
| Hinweis | `TextInput multiline` | `minHeight: 44` — sieht aus wie eine einzeilige Eingabe |
| Plätze | `TextInput number-pad` | Zahlentastatur ohne „Fertig", freie Zahl statt Auswahl |
| Benötigte Guides | `TextInput number-pad` | vorbelegt „2", ohne zu sagen, was daraus folgt |

Dazu: Fehler erscheinen erst **nach** dem Absenden, gesammelt in einem Banner
am Formularende („Datum und Uhrzeit brauchen das Muster TT.MM.JJJJ" — ein Text,
der seit den nativen Wählern nicht mehr passt). Der Entwurf wird bei jeder
Eingabe gesichert, was niemand sieht. Und die Zahl der gefragten Guides
(`gefragteGuides`) erfährt der Guide erst in der Bestätigung.

## 11c — tippen nur, wo es sein muss (gewählt)

Vier verschiedene Eingabearten statt sechs gleicher Felder. Der Regelfall ist
damit **drei Antippen ohne Tastatur**.

1. **Wann** — zwei Chip-Reihen (`Chip` aus `src/ui/components.tsx`, 44 pt):
   - Datum: „Heute", „Morgen", der nächste übliche Wochentag, dann
     „Datum wählen" (öffnet `DatumsFeld`/`DateTimePicker` wie bisher).
   - Uhrzeit: die drei zuletzt genutzten Zeiten, dann „Andere".
   - Vorschläge aus `holeTrainings(api)` (`src/data/jugend.ts`), lokal
     ausgewertet: häufigste Uhrzeit und Wochentag der letzten ~10 Trainings des
     Guides. **Kein neuer Endpunkt.**
   - Die gewählte Kombination gilt weiter in Gerätezeitzone — die Rechnung in
     `anlegen()` bleibt unverändert.
2. **Treffpunkt** — Chips mit den zuletzt genutzten Orten (aus derselben
   Liste, nach Häufigkeit), dazu „Anderer Ort …" für das Textfeld. Nebeneffekt:
   Die Treffpunktnamen bleiben einheitlich.
3. **Plätze / Guides nötig** — Zähler (`−`/`+`, je 46 pt) statt Zahlentastatur,
   nebeneinander in einer Reihe. Bei Plätzen darunter der Umschalter
   „unbegrenzt" (= `null`, wie heute das leere Feld). Unter „Guides nötig" die
   Folge in Worten: „12 Guides werden gefragt" — die Zahl, die heute erst die
   Bestätigung nennt; sie steckt in `gefragteGuides` und ist vorab aus der
   Guide-Liste bekannt.
4. **Hinweis** — bleibt Textfeld, aber `minHeight: 76`, damit es als Fläche für
   mehrere Zeilen lesbar ist. Für Android `textAlignVertical="top"`.
5. **Feste Fußleiste** statt Knopf am Ende des Scrollinhalts:
   links die Zusammenfassung „Do 20.8. · 17:30 · Kalkofen", rechts in
   Kleinschrift „Entwurf gesichert", darunter „Training anlegen" (50 pt).
   Der Entwurf wird bereits gesichert (`schreibEntwurf`) — es fehlt nur die
   Rückmeldung.
6. **Prüfung am Feld, nicht im Banner.** Fehlt Datum, Zeit oder Ort, bleibt der
   Knopf deaktiviert und die betroffene Zeile bekommt ihren Hinweis. Der Text
   „Muster TT.MM.JJJJ" entfällt — es wird nichts mehr getippt. Das Banner
   bleibt für Fehler der API (403, kein Netz) über
   `beschreibeJugendFehler`.

`leseOptionaleAnzahl` (`src/features/jugend/eingabe.ts`) wird von den Zählern
nicht mehr gebraucht, bleibt aber die Prüfung für den Fall „Anderer Wert" und
für `tests/jugendEingabe.test.ts`.

## 11d — Zeilen wie in den Einstellungen (nicht gebaut, zur Nachvollziehbarkeit)

Kompakter, näher an der Systemsprache: Kopfkarte mit dem Ergebnis
(„Do 20.8., 17:30 / Kalkofen · 12 Plätze"), darunter zwei Gruppen aus
antippbaren Zeilen (`Gruppe`/`Zeile` aus `components.tsx`), jede öffnet ihren
Wähler in einem Blatt. Vorteil: Die Seite scrollt nie unter eine Tastatur, und
sie liest sich wie die späteren Terminkarten. Nachteil: mehr Antippen im
Regelfall, weil kein Vorschlag direkt auf der Seite liegt.

Verworfen, weil im Regelfall mehr Antippen nötig ist. Falls 11c in der Beta zu
unruhig wirkt, liegt hier der Rückfallweg.

## Nicht ändern

- Native Wähler bleiben der Ausweg für Ausnahmen — die Chips ersetzen sie
  nicht, sie ersparen sie im Regelfall.
- Entwurf-Speicher (`entwurfSpeicher.ts`, „Weitermachen/Verwerfen"-Karte) bleibt
  wie er ist, inklusive Frist.
- Bestätigungsbildschirm nach dem Anlegen bleibt, samt Guide-Zahl.
- `api/src/jugendtraining.ts`, `012-jugendtraining.sql`: unberührt.

## Regressionstests

- `tests/jugendEingabe.test.ts`, `jugendEntwurf.test.ts`, `jugendFehler.test.ts`
  müssen unverändert grün bleiben.
- Neu: Aus Chip-Auswahl „Morgen" + „17:30" entsteht derselbe `beginntAm` wie
  aus den Wählern (Gerätezeitzone, Sommerzeit-Grenze mitprüfen).
- Neu: Zähler „Plätze" mit „unbegrenzt" ergibt `plaetze: null`, nicht `0`.
- Manuell: Entwurf anfangen, App schließen, wieder öffnen — Chips und Zähler
  müssen aus dem Entwurf zurückkommen (`TrainingsEntwurf` speichert `plaetze`
  und `guidesNoetig` als Text; beim Lesen in Zahlen wandeln).
