---
name: alte-adressen-nie-abschalten
description: Eine ausgelieferte App trägt ihre Serveradresse fest eingebaut — ein abgeschalteter Domainname macht sie tot, nicht langsam
metadata:
  node_type: memory
  type: project
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-20T00:00:00.000Z
---

Am 19.08.2026 hießen die Adressen um: `api-dev.bockelbrink.net` wurde
`app-dev.mtb-bielefeld.de`, `api.bockelbrink.net` wurde
`app.mtb-bielefeld.de`. Am selben Tag war `api.bockelbrink.net` **tot** —
DNS zeigte auf die Maschine, Caddy bediente den Namen nicht, kein
Zertifikat. Von außen nicht zu unterscheiden von „Server kaputt", und
keine App-Aktualisierung hätte geholfen.

Eine App trägt ihre Serveradresse **fest eingebaut** in sich
(`src/config.ts`, `waehleApiAdresse`). Wer nicht aktualisiert, spricht bis
in alle Zukunft den Namen an, der beim Bauen seiner Fassung galt.

## Die Liste ist eine Einbahnstraße

`API_DOMAIN_ZUSATZ` in `betrieb/.env` nimmt **mehrere Namen, durch
Leerzeichen getrennt**. Dass Caddy das kann, ist nicht offensichtlich —
die naheliegende Annahme („der Wert einer Variablen ist ein Token") wäre
falsch gewesen; mit `caddy adapt` gegen eine Wegwerfdatei nachgewiesen.

    API_DOMAIN_ZUSATZ=api-dev.bockelbrink.net api.bockelbrink.net

Namen kommen dazu, wenn sich die Adresse ändert. Entfernt wird einer erst,
wenn keine Fassung mehr lebt, die ihn kennt. Kosten: eine Zeile und eine
Zertifikatserneuerung alle sechzig Tage.

## Die App muss sie auch anmelden

`app.config.js` führt je Umgebung ein Feld `frueher`. Ein **Teilen-Link
trägt die Adresse der sendenden Fassung** — ohne die alten Namen in
`associatedDomains` öffnete ein Link aus 0.12.0 in 0.12.1 den Browser
statt der App. Im Verein laufen immer mehrere Fassungen nebeneinander.

Bei `prod` steht `frueher: []`, und das muss so bleiben: Die alten Namen
zeigen auf den Prüfstand. Ein `bockelbrink`-Name dort fütterte die
Vereinsfassung mit Prüfdaten — und niemand merkte es, weil es
funktioniert. Ein Test hält beide Richtungen fest.

## Geprüft wird das mit einem Skript

`betrieb/pruefe-adressen.sh` holt die Namen aus `app.config.js` — **keine
zweite Liste**, die auseinanderliefe — und prüft je Name Erreichbarkeit
und identische Universal-Links-Datei. Läuft gegen den Server, nicht gegen
den örtlichen Aufbau.

    betrieb/pruefe-adressen.sh              # dev
    UMGEBUNG=prod betrieb/pruefe-adressen.sh

**Why:** Der Fehler ist lautlos und trifft genau die Leute, die man nicht
erreicht — die mit der alten Fassung.

**How to apply:** Vor jeder Adressänderung den alten Namen in
`API_DOMAIN_ZUSATZ` **und** in `frueher` eintragen, danach
`pruefe-adressen.sh` laufen lassen. Verwandt:
[[mtb-server-offene-punkte]], [[releases-sparsam-bauen]]
