#!/usr/bin/env bash
# Prüft die beiden Ratenbegrenzungs-Schichten gegen den laufenden Aufbau.
#
#     docker compose -f betrieb/docker-compose.yml up -d
#     betrieb/pruefe-begrenzung.sh
#
# Was hier geprüft wird, war bis zu diesem Plan reine Annahme: dass Caddys
# Pfad- und Methodenmuster greifen, dass die Belegungsabfrage ungezählt
# bleibt, und dass die API hinter dem Proxy die echte Adresse sieht.
#
# **Jede Erwartung wird geprüft, nicht nur gedruckt.** Eine frühere Fassung
# druckte die Statuscodes zum Ansehen und endete immer mit 0. Fiele Caddys
# `rate_limit` aus — Modul beim Bau vergessen, Zone falsch geschrieben —,
# stünden dort dreißig mal 202 und das Skript meldete Erfolg. Genau der
# stille Fehlschlag, den es aufdecken soll.
#
# **Braucht eine frische Minute.** Die Kontingente laufen über ein Fenster
# von einer Minute; ein zweiter Lauf unmittelbar nach dem ersten zeigt in
# der Anmelde-Zeile von der ersten Anfrage an 429, weil der Eimer noch voll
# ist. Das ist kein Fehlschlag, nur ein zu früher Lauf — eine Minute warten.
set -euo pipefail

BASIS=${BASIS:-http://localhost}
SKRIPT_ORT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=(docker compose -f "$SKRIPT_ORT/docker-compose.yml")

# Eine Anfrage, deren Statuscode zurückkommt. Ein `000` von curl heißt „keine
# Verbindung" — ohne diese eigene Behandlung bräche `set -e` das Skript an
# dieser Stelle wortlos ab, und wer es aufruft, ohne den Aufbau gestartet zu
# haben, sähe nur einen leeren Abbruch statt der Ursache.
anfrage() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo '000')
  if [ "$code" = '000' ]; then
    echo >&2
    echo "FEHLGESCHLAGEN: keine Verbindung zu $BASIS." >&2
    echo "Läuft der Aufbau? docker compose -f betrieb/docker-compose.yml ps" >&2
    exit 1
  fi
  printf '%s' "$code"
}

# --- 1. Caddys Zone „anmeldung" -------------------------------------------
# Erwartet: die ersten zehn kommen durch, danach bremst Caddy. Beides wird
# geprüft — käme *keine* 429, wäre die Bremse gar nicht da; käme schon die
# erste Anfrage als 429 zurück, liefe das Skript zu früh (siehe Kopf).
echo "--- Anmeldung: erwartet 429 nach etwa 10 Anfragen ---"
erste=""
gebremst=0
for i in $(seq 1 15); do
  code=$(anfrage -X POST "$BASIS/anmeldung/anfordern" \
    -H 'content-type: application/json' -d '{"email":"grenze@example.org"}') || exit 1
  printf '%s ' "$code"
  if [ -z "$erste" ]; then erste="$code"; fi
  if [ "$code" = '429' ]; then gebremst=1; fi
done
echo
if [ "$erste" = '429' ]; then
  echo "FEHLGESCHLAGEN: Schon die erste Anfrage wurde gebremst — das Kontingent" >&2
  echo "ist noch von einem Lauf in derselben Minute belegt. Eine Minute warten." >&2
  exit 1
fi
if [ "$gebremst" = 0 ]; then
  echo "FEHLGESCHLAGEN: In fünfzehn Anfragen keine einzige 429 — Caddys Zone" >&2
  echo "„anmeldung\" greift nicht. Ist das Modul caddy-ratelimit im Bau drin?" >&2
  echo "Ohne diese Schicht steht die Anmeldung ungebremst offen." >&2
  exit 1
fi

# --- 2. Die Belegungsabfrage bleibt ungezählt ------------------------------
# Zeigt sich hier ein 429, greift die Ausnahme aus `NUR_SCHREIBEND_GEZAEHLT`
# nicht, und eine App, die eine Terminliste öffnet, sperrt sich im Alltag
# selbst aus — je Termin eine Anfrage reißt jede sinnvolle Grenze.
echo "--- Belegung lesen: erwartet durchgehend 404 (Termin gibt es nicht), NIE 429 ---"
gebremst=0
for i in $(seq 1 30); do
  code=$(anfrage "$BASIS/termine/gibtsnicht~0") || exit 1
  printf '%s ' "$code"
  # Als `if`, nicht als `[ … ] && …`: Unter `set -e` beendet eine solche
  # UND-Liste als letzter Befehl im Schleifenrumpf das Skript, sobald der
  # Test einmal nicht zutrifft — also beim ersten erwarteten 404.
  if [ "$code" = '429' ]; then gebremst=1; fi
done
echo
if [ "$gebremst" = 1 ]; then
  echo "FEHLGESCHLAGEN: Die Belegungsabfrage wurde gebremst — sie muss ungezählt bleiben." >&2
  exit 1
fi

# --- 3. Die Gesundheitsabfrage bleibt frei ---------------------------------
echo "--- Gesundheit: erwartet durchgehend 200, ungebremst ---"
for i in $(seq 1 30); do
  code=$(anfrage "$BASIS/gesundheit") || exit 1
  printf '%s ' "$code"
  if [ "$code" != '200' ]; then
    echo >&2
    echo "FEHLGESCHLAGEN: /gesundheit antwortete mit $code statt 200." >&2
    exit 1
  fi
done
echo

# --- 4. trustProxy: Sieht die API die echte Adresse? -----------------------
# Der eigentliche Grund für Plan 4a, und bis hierher stand die Messung nur in
# einer Commit-Nachricht. Zwei Anfragen, beide mit einem frei erfundenen
# `X-Forwarded-For`, und danach ein Blick ins Protokoll der API:
#
#   - über Caddy: Caddy **ersetzt** den Kopf durch die echte Adresse
#     (Caddy ≥ 2.7, solange `trusted_proxies` leer bleibt) — die Fälschung
#     darf nicht ankommen.
#   - direkt gegen die API, an Caddy vorbei: Dort kommt sie an, weil die API
#     dem ganzen Bereich `172.16.0.0/12` glaubt (`VERTRAUTER_PROXY`). Das ist
#     kein Fehler, sondern die Bedingung, auf der das Ganze ruht: Die API hat
#     keine Portfreigabe, nur Caddy erreicht sie. Wer diese zweite Zeile
#     einmal grün sieht, versteht, warum ein `trusted_proxies` im Caddyfile
#     die Begrenzung je IP aushebeln würde.
echo "--- trustProxy: erfundenes X-Forwarded-For darf nicht durch Caddy kommen ---"
MARKE="xff-probe-$$"
anfrage "$BASIS/gesundheit?probe=$MARKE" -H 'X-Forwarded-For: 203.0.113.7' >/dev/null || exit 1
sleep 1
if "${COMPOSE[@]}" logs api --since 30s 2>/dev/null | grep -q "probe=$MARKE.*203\.0\.113\.7"; then
  echo "FEHLGESCHLAGEN: Die API hat das erfundene 203.0.113.7 übernommen, obwohl" >&2
  # Einfache Anführungszeichen: In doppelten wären die Rückwärts-Hochkommata
  # eine Kommandoausführung.
  echo 'die Anfrage über Caddy kam. Steht `trusted_proxies` im Caddyfile? Dann ist' >&2
  echo 'die Begrenzung je IP wertlos — siehe `vertrauterProxy` in api/src/app.ts.' >&2
  exit 1
fi
echo "Über Caddy: Fälschung verworfen, die API sieht die echte Adresse."

MARKE_DIREKT="xff-direkt-$$"
"${COMPOSE[@]}" exec -T caddy sh -c \
  "wget -qO- --header='X-Forwarded-For: 203.0.113.7' 'http://api:3000/gesundheit?probe=$MARKE_DIREKT'" \
  >/dev/null 2>&1 || true
sleep 1
if ! "${COMPOSE[@]}" logs api --since 30s 2>/dev/null | grep -q "probe=$MARKE_DIREKT.*203\.0\.113\.7"; then
  echo "FEHLGESCHLAGEN: Die API hat das X-Forwarded-For aus dem Compose-Netz NICHT" >&2
  echo "übernommen. Dann steht VERTRAUTER_PROXY falsch, und hinter Caddy zählt sie" >&2
  echo "alle Anfragen auf einen Eimer — die Begrenzung je IP wäre wirkungslos." >&2
  exit 1
fi
echo "Direkt aus dem Compose-Netz: Kopf übernommen — genau so muss es sein, damit"
echo "die API hinter Caddy die Adresse des Anfragenden sieht und nicht die des Proxys."

echo
echo "Alle Erwartungen erfüllt."
