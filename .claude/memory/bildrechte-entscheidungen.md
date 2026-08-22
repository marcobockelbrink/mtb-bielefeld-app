---
name: bildrechte-entscheidungen
description: Die drei offenen Fragen aus Handoff 15 (Bildrechte) sind am 21.08.2026 entschieden — plus der Befund, dass das Formular-PDF ein Scan ist
metadata:
  node_type: memory
  type: project
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-22T00:00:00.000Z
---

Handoff 15 („Bildrechte: Einwilligung als Datensatz am Kind") setzte drei
Dinge voraus, die es im Code so nicht gibt. Marco hat am 21.08.2026 alle
drei Empfehlungen übernommen. **Noch nichts davon ist gebaut.**

## 1. Die Anmeldung wird mit dem Kindprofil verknüpft

Eine Trainingsanmeldung speichert heute **Freitext** — `vorname`,
`nachname` und das Elternkonto (`jugendtraining_kind`, Migration 012).
`mitglied_id` dort ist das **Eltern**konto, nicht das Kind. Ein
Familienprofil füllt das Formular nur vor: `ausProfil()` in
`src/features/jugend/KindAnmelden.tsx` zerlegt den Namen in zwei Felder
und wirft die Profilkennung weg.

Ohne diese Kennung gibt es keinen Weg von der Teilnehmerliste zur
Einwilligung — Sicht 3 des Handoffs (Guides sehen „keine Fotos") hat
nichts, worauf sie sich stützen könnte.

**Entschieden:** neue Spalte `kind_mitglied_id` auf `jugendtraining_kind`,
**nullbar**. Anmeldungen ohne Profil (Nachbarskind, Gastkind) bleiben
möglich und tragen dauerhaft „keine Fotos" — nach der Regel „Fehlt = Nein"
richtig, denn für dieses Kind hat wirklich niemand eingewilligt.

**Beim Bauen nicht vergessen:** Alle **heute schon bestehenden**
Anmeldungen haben keine Verknüpfung. Nach der Umstellung tragen sie alle
das rote Etikett, bis die Familie sich neu anmeldet. Bei einem Foto-Thema
die sichere Richtung — sieht in der ersten Woche aber nach einem Fehler
aus, und das sollte vorher gesagt sein.

## 2. „Ab 13" heißt Jahresgrenze

Am Kindprofil steht **`geburtsjahr`**, kein Geburtsdatum
(`api/src/familie.ts`). Die zweite Stimme ab 13 braucht ein Alter.

**Entschieden:** `aktuellesJahr − geburtsjahr >= 13`. Wer im Dezember
geboren ist, zählt damit bis zu elf Monate zu früh — die harmlose
Richtung: Die zweite Stimme ist ein Schutz für das Kind, und ihn früher
einzuholen schadet niemandem. Andersherum wäre ein 13-Jähriger übergangen
worden.

Kein neues Pflichtfeld „Geburtsdatum": Alle bestehenden Profile stünden
sonst auf „offen", bis jemand es nachträgt.

## 3. Die Einwilligung bekommt eine eigene Tabelle

Der Handoff zeigt ein eingebettetes Objekt am Kind und verlangt zugleich,
dass bei einer neuen Textversion „die alte Antwort als Historie erhalten
bleibt". Ein Feld kann das nicht; es wird überschrieben.

**Entschieden:** eigene Tabelle, eine Zeile je Antwort, **nur angehängt,
nie geändert**. Der aktuelle Status ist die jüngste Zeile zur aktuellen
Textversion.

Damit fällt die Textversions-Anhebung von selbst heraus: Neuer Text heißt,
es gibt noch keine Zeile dazu — also „offen", ohne dass irgendwo etwas
gelöscht wird. Und bei einem Widerruf lässt sich nachsehen, wer wann was
gesagt hat.

## Der Volltext (15d) ist ein Scan

`einwilligung-bildrechte.pdf` im Handoff-Ordner enthält **keinen
extrahierbaren Text** — die Seiten sind Bilder (der PDF-Erzeuger meldet
sich als „Google/Skia"). Ein Auslesen der Zeichenketten liefert nur
Farbprofile.

Am 21.08.2026 wurde deshalb `poppler` installiert (`brew install poppler`),
damit sich die Seiten rendern und lesen lassen.

**Der Text wird wörtlich übernommen, nicht umformuliert.** Er ist
rechtlich bindend: Klingt er in der App anders als im Formular, das die
Familien unterschrieben haben, ist die Einwilligung angreifbar. Aus
demselben Grund muss Marco die Übertragung **gegenlesen**, bevor sie
live geht — eine Abschrift aus einem Scan kann Fehler enthalten, und die
fallen sonst niemandem auf.

Textversion beim ersten Einpflegen: `2026-08`.

**Why:** Die drei Fragen kosten sonst beim nächsten Anlauf dieselbe
Untersuchung, und die Antworten sind Vereinsentscheidungen, keine
technischen.

**How to apply:** Reihenfolge aus dem Handoff-README: 17 und 16 sind seit
dem 21.08.2026 fertig und ausgerollt, 15 steht noch komplett aus.
Verwandt: [[handoffs-gegen-den-code-pruefen]],
[[mtb-server-offene-punkte]]
