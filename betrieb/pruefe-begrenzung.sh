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
# **Braucht eine frische Minute.** Die Kontingente laufen über ein Fenster
# von einer Minute; ein zweiter Lauf unmittelbar nach dem ersten zeigt in
# der Anmelde-Zeile von der ersten Anfrage an 429, weil der Eimer noch voll
# ist. Das ist kein Fehlschlag, nur ein zu früher Lauf — eine Minute warten.
set -euo pipefail

BASIS=${BASIS:-http://localhost}

echo "--- Anmeldung: erwartet 429 nach etwa 10 Anfragen ---"
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASIS/anmeldung/anfordern" \
    -H 'content-type: application/json' -d '{"email":"grenze@example.org"}')
  printf '%s ' "$code"
done
echo

# Diese eine Erwartung wird hart geprüft statt nur gedruckt: Zeigt sich hier
# ein 429, greift die Ausnahme aus `NUR_SCHREIBEND_GEZAEHLT` nicht, und eine
# App, die eine Terminliste öffnet, sperrt sich im Alltag selbst aus. Ein
# Skript, das das durchgehen lässt und trotzdem mit 0 endet, wäre genau der
# stille Fehlschlag, den es aufdecken soll.
echo "--- Belegung lesen: erwartet durchgehend 404 (Termin gibt es nicht), NIE 429 ---"
gebremst=0
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/termine/gibtsnicht~0")
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

echo "--- Gesundheit: erwartet durchgehend 200, ungebremst ---"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASIS/gesundheit")
  printf '%s ' "$code"
done
echo
