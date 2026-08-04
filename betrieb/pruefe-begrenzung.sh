#!/usr/bin/env bash
# Prüft die beiden Ratenbegrenzungs-Schichten gegen den laufenden Aufbau.
#
#     docker compose -f betrieb/docker-compose.yml up -d
#     betrieb/pruefe-begrenzung.sh
#
# Was hier geprüft wird, war bis zu diesem Plan reine Annahme: dass Caddys
# Pfad- und Methodenmuster greifen, dass die Belegungsabfrage ungezählt
# bleibt, und dass die API hinter dem Proxy die echte Adresse sieht.
set -euo pipefail

BASIS=${BASIS:-http://localhost}

echo "--- Anmeldung: erwartet 429 nach etwa 10 Anfragen ---"
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASIS/anmeldung/anfordern" \
    -H 'content-type: application/json' -d '{"email":"grenze@example.org"}')
  printf '%s ' "$code"
done
echo

echo "--- Belegung lesen: erwartet durchgehend 404 (Termin gibt es nicht), NIE 429 ---"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/termine/gibtsnicht~0")
  printf '%s ' "$code"
done
echo

echo "--- Gesundheit: erwartet durchgehend 200, ungebremst ---"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/gesundheit")
  printf '%s ' "$code"
done
echo
