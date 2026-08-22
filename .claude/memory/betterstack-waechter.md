---
name: betterstack-waechter
description: Better Stack überwacht den Prüfserver seit 22.08.2026; zwei gleich aussehende API-Token, nur einer öffnet die Uptime-API
metadata:
  type: project
---

Seit dem 22.08.2026 überwacht Better Stack beide Server:

    Monitor 4845221   https://app-dev.mtb-bielefeld.de/gesundheit
    Monitor 4845229   https://app.mtb-bielefeld.de/gesundheit

Beide gleich eingestellt: erwartet genau 200, alle 5 Minuten, Region EU,
15 s Zeitschranke, 60 s Bestätigung, keine Umleitungen, Mail ans Team.

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
