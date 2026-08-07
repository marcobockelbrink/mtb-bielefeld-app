---
name: age-schluessel-fuer-sicherungen
description: Der private age-Schlüssel für die Server-Sicherungen liegt nur lokal in ~/.ssh und steht bewusst nirgends im Repository
metadata: 
  node_type: memory
  type: project
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-04T22:26:58.905Z
---

Die Sicherungen des Vereinsservers (`betrieb/sichern.sh`) werden gegen einen
**öffentlichen** age-Schlüssel verschlüsselt. Der zugehörige **private**
Schlüssel liegt seit dem 05.08.2026 ausschließlich unter
`~/.ssh/mtb-sicherung.age-key` auf Marcos Mac.

Öffentlicher Teil (steht in `betrieb/.env` auf dem Server, darf herumliegen):
`age1qe0ey3gvezyglhkp554dx95jgnydajm9lu2jnwerkxjku0p5re6qkqj2m5`

**Why:** Ein Schlüsselpaar statt einer Passphrase gewählt, damit auf dem
Server nichts liegt, womit sich eine Sicherung öffnen ließe — wer die
Maschine übernimmt, bekommt die Mitgliedsadressen aus den Sicherungen nicht
obendrauf. Der Preis ist, dass ein verlorener privater Schlüssel jede
Sicherung wertlos macht. Das Repository ist öffentlich, dort kann er nicht
stehen; also steht nirgends im Projekt, wo er ist.

**How to apply:** Bei Fragen zu Rücksicherung, Serverumzug oder Laptopwechsel
zuerst darauf hinweisen, dass dieser Schlüssel mitmuss und **noch nicht** in
der Passwortverwaltung des Vereins liegt — Stand 05.08.2026 war das eine
offene Aufgabe. Ohne ihn läuft `betrieb/ruecksicherung.sh` ins Leere.
Verwandt: [[mtb-server-offene-punkte]]
