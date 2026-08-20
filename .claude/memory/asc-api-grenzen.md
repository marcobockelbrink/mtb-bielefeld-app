---
name: asc-api-grenzen
description: Was die App-Store-Connect-API bei Xcode Cloud kann und was nicht — Abbrechen geht nicht, Sortieren muss man verlangen
metadata:
  node_type: memory
  type: reference
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-20T00:00:00.000Z
---

`tools/xcode-cloud.mjs` (`laeufe`, `protokoll`, `starte`), Schlüssel unter
`~/.appstoreconnect/private_keys/AuthKey_5BJWNT453P.p8`:

    export ASC_KEY_ID=5BJWNT453P
    export ASC_ISSUER_ID=58f694f8-79b1-419e-b3e2-03b63cadad90

## Drei Grenzen, jede einmal Zeit gekostet

**Abbrechen geht nicht.** `DELETE /ciBuildRuns/{id}` antwortet:

    The resource 'ciBuildRuns' does not allow 'DELETE'.
    Allowed operations are: CREATE, GET_INSTANCE

Hängende Läufe muss Marco in App Store Connect wegklicken. Nicht wieder
versuchen, nicht mit PATCH probieren.

**Sortieren muss man verlangen.** Ohne `sort=-number` liefert
`/ciProducts/{id}/buildRuns` die **ältesten** Läufe zuerst. Eine Seite zu
holen und danach absteigend zu sortieren ordnet nur diese Seite — am
19.08.2026 zeigte die Liste dadurch #9 bis #20 und ließ sechs hängende
Läufe als drei erscheinen. Ich habe die falsche Zahl weitergegeben.
`limit` geht bis 200.

**Externe Verteilung sperrt den Start.** Hängt am Workflow die Aktion
„TestFlight External Testing", antwortet `POST /ciBuildRuns` mit 403:

    The user is not authorized to trigger workflows with an external deployment.

Über die Oberfläche startet Marco ihn trotzdem — es ist eine Grenze des
API-Schlüssels (Rolle *Developer*), nicht des Workflows. Nach dem Löschen
der Aktion lief der Start beim ersten Versuch.

## Zwei Fallen bei der Signatur

`dsaEncoding: 'ieee-p1363'` ist Pflicht; ohne die Angabe erzeugt Node eine
DER-Signatur, und Apple antwortet mit einem irreführenden 401. Und die
**Issuer ID** ist eine UUID — die Zeichenfolge im Dateinamen des
Schlüssels ist die *Key ID*, nicht der Aussteller.

**Why:** Alle drei Grenzen sehen aus wie ein Fehler auf unserer Seite und
sind keiner.

**How to apply:** Läufe mit `node tools/xcode-cloud.mjs laeufe` ansehen,
Protokolle mit `protokoll <id>`, anstoßen mit `starte`. Verwandt:
[[testflight-und-eas]], [[releases-sparsam-bauen]]
