---
name: releases-sparsam-bauen
description: Nicht pro Änderungsschwung ein TestFlight-Release bauen — EAS-Builds sind kontingentiert und knapp
metadata: 
  node_type: memory
  type: feedback
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-16T19:20:13.806Z
---

Marco am 16.08.2026: „lass uns nicht jedes mal ein release erstellen :)
hab nicht mehr so viele freie builds bei expo."

An dem Tag waren es **vier** Builds (0.11.1 bis 0.11.4), im August
insgesamt **14**. Entstanden ist das aus einem Muster, das ich mir selbst
angewöhnt hatte: Schwung fertig → Version anheben → bauen → einreichen,
jedes Mal.

**Ab jetzt:** bauen nur, wenn Marco es sagt oder es einen benannten Grund
gibt (etwas ist auf dem Gerät zu prüfen, ein Test mit Mitgliedern steht
an). Sonst sammeln: committen, pushen, und die Fassung im Repository
reifen lassen. Mehrere Befunde in **einem** Build sind auch für den Test
besser — wer vier Fassungen an einem Tag installiert, weiß am Ende nicht
mehr, welche was geändert hat.

**Why:** Das Kontingent ist Marcos, nicht meins, und es ist bezahlt oder
begrenzt. Ein Build ist außerdem nicht gratis in Zeit: Bauen, Apple-
Verarbeitung und Installieren kosten ihn jedes Mal Aufmerksamkeit.

## Nachtrag 18.08.2026: Pushen ist nicht mehr umsonst

Die Regel oben griff ins Leere, sobald Xcode Cloud dazukam. Dessen
Workflow startete **bei jedem Push auf `main`** — an einem Nachmittag
fünf Läufe, von denen ich keinen angestoßen hatte. „Nicht bauen" heißt
seither nicht mehr „`eas build` nicht aufrufen".

Marco hat es daraufhin selbst zur Regel erhoben: *„Wir sollten uns
angewöhnen nur noch Releases auf Wunsch zu erstellen."*

Dazu kam an dem Tag ein zweiter Grund, der nichts mit dem Kontingent zu
tun hat: Die Aktion „TestFlight-externe Tests" wartet auf Apples Beta App
Review. Läufe stehen dadurch **stunden- bis tagelang** auf „läuft" und
stapeln sich, während der Bau selbst längst fertig ist.

**How to apply:**

- Nach einem fertigen Schwung committen und pushen, dann **fragen**, ob
  gebaut werden soll — nicht bauen und hinterher berichten.
- Die Startbedingung des Workflows gehört auf **manuell**. Solange sie auf
  „bei jedem Push" steht, ist jeder Push ein Release, ob gewollt oder
  nicht. Das ist eine Einstellung bei Apple, die Marco setzen muss — bis
  dahin ist jeder Push begründungspflichtig.
- Mehrere Punkte in **einen** Build bündeln. Wer vier Fassungen an einem
  Tag installiert, weiß am Ende nicht mehr, welche was geändert hat.

Verwandt: [[testflight-und-eas]]
