---
name: handoffs-gegen-den-code-pruefen
description: "Die Design-Handoffs enthalten regelmäßig Annahmen, die der Code nicht hergibt — vor dem Umsetzen jede Prämisse nachschlagen"
metadata:
  type: project
---

Die Ordner `design_handoff_*` und `handoff_*` sind gut und detailliert —
aber sie beschreiben stellenweise eine App, die es so nicht gibt. Beim
Abarbeiten von Runde 10 und 11 (15./16.08.2026) trug **jede fünfte
Anweisung** eine Prämisse, die der Code widerlegt:

| Befund | Behauptet | Tatsächlich |
| --- | --- | --- |
| A3 | Passwortregeln erscheinen zu spät | Die App kennt **kein Passwort** — Anmeldung per Magic Link |
| B2 | Die Anmeldefrist verschwindet lautlos | Termine haben **keine Frist** |
| B3 | Rückfrage bei voller Tour mit Warteliste | Es gibt **keine Warteliste** |
| 11c | Die Zahl der gefragten Guides sei vorab bekannt | Kein Endpunkt liefert sie vor dem Anlegen |
| 11a | `altersTag()` ordne U-Gruppen zu | Sie liefert das Alter; **U-Gruppen gibt es im Projekt nirgends** |

## Was daraus folgt

**Vor dem Umsetzen jede Prämisse nachschlagen** — ein `grep` nach dem
genannten Begriff kostet Sekunden. Trägt sie nicht, ist die *Absicht*
hinter dem Befund trotzdem meist richtig; es braucht nur eine andere
Umsetzung. Zwei Beispiele, die sich bewährt haben:

- Statt der unbekannten Guide-Zahl steht unter dem Zähler, **was die Zahl
  bedeutet** („So viele müssen zusagen, damit es stattfindet") — das war
  die eigentliche Beschwerde.
- Statt einer erfundenen U-Gruppe steht das **Alter** da. Eine erfundene
  Einteilung stünde später im Widerspruch zu der, die der Verein wirklich
  benutzt.

**Nichts erfinden, um einen Befund abzuhaken.** Eine Anmeldefrist zu
bauen, damit B2 erledigt ist, wäre neue Funktionalität unter dem
Deckmantel einer Fehlerbehebung — und Marco hat sie nie bestellt.

**Why:** Wer die Handoffs für bare Münze nimmt, baut entweder Unsinn oder
meldet Dinge als erledigt, die nie ein Problem waren. Wer sie deshalb
pauschal misstraut, verliert gute Befunde — C1 (Upload-Warteschlange) und
E1 (Entwurf) waren beide echte Blocker.

**How to apply:** Beim Lesen eines Handoffs jede Datei-, Funktions- und
Feldnennung einmal nachschlagen. Was nicht trägt, im Commit **benennen**
statt still zu übergehen — Marco liest die Nachrichten, und er soll
wissen, was er nicht bekommen hat. Verwandt:
[[lokal-gruen-ist-nicht-ci-gruen]]
