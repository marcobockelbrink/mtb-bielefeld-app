---
name: betterstack-waechter
description: Better Stack überwacht den Prüfserver seit 22.08.2026; zwei gleich aussehende API-Token, nur einer öffnet die Uptime-API
metadata:
  type: project
---

Seit dem 22.08.2026 überwacht Better Stack beide Server:

    Monitor 4845221   app-dev …/gesundheit   Statuscode, erwartet genau 200
    Monitor 4845229   app     …/gesundheit   Statuscode, erwartet genau 200
    Monitor 4845238   app-dev …/gesundheit   Inhalt, Wort `"datenbank":"ok"`

Alle gleich getaktet: alle 5 Minuten, Region EU, 15 s Zeitschranke, 60 s
Bestätigung, keine Umleitungen, Mail ans Team.

## Warum der Inhaltsmonitor nicht überflüssig ist

Statuscode und Inhalt sagen per Konstruktion dasselbe: `statusFuer()`
liefert 200 genau dann, wenn `status === 'ok'`, und das ist genau dann der
Fall, wenn `datenbank === 'ok'`. Im Normalbetrieb ist der zweite Monitor
also redundant.

Er fängt den Fall, den `gesundheit.ts` selbst fürchtet und mit
`Cache-Control: no-store` abwehrt: **eine 200, die nicht vom Server
stammt** — Zwischenspeicher, Proxy, Fehlerseite eines künftigen CDN. Der
Statuscode-Monitor sieht die nicht.

Nachgemessen am 22.08.2026 mit einem Wegwerf-Monitor auf ein Unsinnswort:
Fehlt das Wort, geht der Monitor auf `down` — der Statuscode allein
(hier 200) rettet ihn nicht.

**Fußangel:** `"datenbank":"ok"` trifft nur, solange Fastify das JSON
kompakt ausgibt. Bei eingerückter Ausgabe stünde dort `"datenbank": "ok"`
mit Leerzeichen, und der Monitor meldete einen Ausfall, den es nicht gibt.

`*.bockelbrink.net` bleibt bewusst unüberwacht (Entscheidung vom
22.08.2026): Die Namen bedienen nur alten App-Code, siehe
[[alte-adressen-nie-abschalten]].

Dazu die öffentliche Statusseite **https://mtb-bielefeld.betteruptime.com**
(ID 260262). Darauf steht **nur** der Vereinsserver, unter dem neutralen
Namen „MTB Bielefeld App". Beim Anlegen hängt Better Stack ungefragt
**alle** vorhandenen Monitore an die Seite — der Prüfserver stand dadurch
unter seinem internen Namen öffentlich da und musste einzeln wieder
entfernt werden. Nach jedem neuen Monitor also nachsehen.

Absperren geht im aktuellen Tarif nicht: `hide_from_search_engines` und
`password_enabled` antworten mit `403 Please upgrade your account`.

Genau 200 und nicht „2xx": Der Endpunkt antwortet bei toter Datenbank mit
503 (`api/src/gesundheit.ts`) — das ist der Fall, den der Wächter fangen
soll. Fünf Minuten sind nicht beliebig gewählt: `betrieb/Caddyfile`
begrenzt `/gesundheit` auf 60 Anfragen je Minute und rechnet ausdrücklich
mit diesem Takt.

## Die Falle: zwei Token, die gleich aussehen

Better Stack führt unter **https://betterstack.com/settings/api-tokens/0**
Telemetry- und Uptime-Token untereinander auf derselben Seite. Beide sind
24 Zeichen alphanumerisch und äußerlich nicht zu unterscheiden. Nur der
Uptime-Token öffnet `uptime.betterstack.com/api/v2/` — mit dem
Telemetry-Token kommt dort `401 Invalid Team API token`, während er auf
`telemetry.betterstack.com/api/v1/sources` fröhlich 200 liefert.

Wer den falschen erwischt, hat also einen Token, der **nachweislich
funktioniert**, nur nicht für Monitore. Zum Unterscheiden:

    curl -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" \
      https://uptime.betterstack.com/api/v2/monitors
