# Handoff 12/13 — Profilbild sichtbar, alles korrigierbar

Vier Aufgaben aus zwei Beta-Meldungen: „Das Profilbild kommt an, ich sehe es
aber nicht am Namen" und „Trainings kann man nicht mehr ändern, wenn man sich
vertippt hat". Beim Durchgehen kamen zwei weitere Stellen dazu, an denen
selbst Angelegtes nicht korrigierbar ist.

Der Entwurf liegt daneben: `Entwurf-12-13.dc.html` (im Browser öffnen).
Abschnitte sind mit `12a`, `12b`, `13a`, `13b` beschriftet — dieselben
Kennungen wie hier.

## Reihenfolge

1. **`01-profilbild.md` (12a)** — reiner Fehler, drei Zeilen. Zuerst, weil es
   sofort sichtbar ist und nichts anderes berührt.
2. **`03-familienprofil.md` (13a)** — die Seite, die es nie gab. Server ist
   fertig; rein App-Arbeit.
3. **`02-training-bearbeiten.md` (12b)** — das größte Stück. `PATCH
   /jugendtraining/:id` existiert bereits; neu ist die Oberfläche und die
   Info-Mail an angemeldete Familien.
4. **`04-anmeldung-aendern.md` (13b)** — die einzige wirklich fehlende Route.

Jede Aufgabe ist für sich lieferbar. Nichts davon hängt an einer anderen.

## Was in diesem Projekt gilt

- Deutsche Namen für alles, was der Verein liest oder was im Code steht —
  wie überall sonst im Repo.
- Die Rolle aus `useKonto()` ist **Anzeigehilfe**, keine Absicherung. Jede
  neue Route prüft selbst (`rolle.ts`).
- Berechtigungen gehören in die `WHERE`-Bedingung der Anweisung, nicht in
  eine Prüfung davor — wie in `meldeKindAb`.
- Keine neuen Farben, keine neuen Abstände: `theme.ts`, `components.tsx`.
- Eingabeformen, die App und Server teilen, stehen in
  `src/domain/apiVertrag.ts` — nicht doppelt.

## Akzeptanzkriterien über alle vier

- Nach einem Bild-Upload zeigt die Kopfleiste **ohne Neustart** das neue Bild.
- Ein Guide kann Zeit, Ort, Hinweis, Plätze und Guides eines veröffentlichten
  Trainings ändern; die angemeldeten Familien bekommen eine Mail mit alt → neu.
- Ein abgesagtes Training bietet kein „Bearbeiten" an.
- Ein Elternteil kann Name und Sichtbarkeit einer bestehenden Anmeldung
  ändern, **ohne** den Platz zu verlieren.
- Name und Geburtsjahr eines selbst angelegten Kindes sind änderbar.
- Kein Konto kann fremde Profile oder fremde Anmeldungen ändern — mit Test.
- `npm test` und `npm --prefix api test` grün; Typprüfung ohne neue Fehler.
