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

**How to apply:** Nach einem fertigen Schwung committen und pushen, dann
**fragen**, ob ein Release soll — nicht bauen und hinterher berichten.
Vor dem Bau prüfen, ob sich mehrere offene Punkte bündeln lassen.
Verwandt: [[testflight-und-eas]]
