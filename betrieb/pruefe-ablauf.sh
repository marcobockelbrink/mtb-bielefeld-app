#!/usr/bin/env bash
# Geht den vollständigen Anmeldeablauf, wie ihn ein Mitglied erlebt — einmal
# ganz, nicht in Einzelteilen wie pruefe-begrenzung.sh:
#
#   Einladungscode erzeugen -> Anmeldung anfordern -> Magic Link aus Mailpit
#   holen -> einlösen -> mit dem Zugangs-Token GET /konto -> Belegung eines
#   echten Termins abfragen -> anmelden -> abmelden.
#
# Jeder Schritt prüft, was er erwartet, statt nur Befehle abzufeuern und auf
# das Beste zu hoffen. Anders als pruefe-begrenzung.sh (das eine erwartete
# 429 lediglich zeigt) endet dieses Skript bei jeder Abweichung sofort mit
# einem von Null verschiedenen Wert — ein Ablauf, der irgendwo klemmt, soll
# laut auffallen, nicht als „im Großen und Ganzen grün" durchgehen.
#
# Voraussetzung: Der Betriebsaufbau läuft.
#   docker compose -f betrieb/docker-compose.yml up -d
#
# Aufruf:
#   betrieb/pruefe-ablauf.sh
#
# BASIS und MAILPIT lassen sich überschreiben, falls die Ports einmal anders
# liegen; die Vorgaben passen zum lokalen Aufbau aus docker-compose.yml.
#
# --- Ratenbegrenzung ---
# /anmeldung/*, /sitzung*, /konto* und /gast/* teilen sich in Caddy eine
# Zone: 10 Anfragen je Minute und IP (betrieb/Caddyfile, Zone "anmeldung"),
# in der API selbst noch einmal 20 (siehe api/src/app.ts). Dieser Ablauf
# braucht davon nur drei (anfordern, einlösen, /konto) — im Normalfall bleibt
# reichlich Luft. Lief aber kurz vorher pruefe-begrenzung.sh (das die Zone
# absichtlich bis zur 429 ausreizt) oder dieses Skript selbst schon einmal in
# derselben Minute, ist das Kontingent noch nicht wieder aufgefüllt. Ein 429
# an dieser Stelle ist dann **kein Fehler im Ablauf**, sondern eine noch
# volle Bremse von vorhin — das Skript erkennt das, erklärt es und bricht
# trotzdem mit einem Fehlercode ab: Für DIESEN Lauf ist der Ablauf nicht
# durchgespielt, und stillschweigend als „passt schon" durchzugehen wäre
# genau der stille Fehlschlag, den dieses Skript aufdecken soll. Abhilfe:
# eine Minute warten, dann erneut versuchen.
# Bewusst **ohne** `-e`: Ein `grep`, das nichts findet, oder ein `curl`, der
# keine Verbindung bekommt, sollen zu der eigenen, verständlichen Meldung
# unten führen (bei einer Pipe wie `grep … | sed …` entscheidet unter
# `pipefail` der jeweils rechte Fehlschlag mit, was den Abbruch an einer
# Stelle ohne eigene Prüfung auslösen könnte) — nicht zu einem stillen
# Abbruch mitten in einer Pipe, bevor die eigentliche Prüfung überhaupt an
# der Reihe war. Jeder Schritt prüft deshalb sein Ergebnis selbst und ruft
# bei einer Abweichung `exit 1` ausdrücklich auf; nichts verlässt sich auf
# `set -e`, um Fehler zu bemerken.
set -uo pipefail

BASIS=${BASIS:-http://localhost}
MAILPIT=${MAILPIT:-http://localhost:8025}
SKRIPT_ORT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DATEI="$SKRIPT_ORT/docker-compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_DATEI")

if ! command -v python3 >/dev/null 2>&1; then
  echo "FEHLGESCHLAGEN: python3 wird zum Auswerten der JSON-Antworten gebraucht, ist aber nicht installiert." >&2
  exit 1
fi

SCHRITT=""
schritt() {
  SCHRITT="$1"
  echo
  echo "=== $1 ==="
}

# Liest ein Feld aus einer JSON-Antwort. $1: JSON-Text, $2: Python-Ausdruck
# auf `d` (z. B. "d['zugang']").
#
# **Jeder Aufruf braucht `|| exit 1`.** Das `exit 1` unten beendet nur die
# Subshell, die `$( … )` aufmacht — nicht das Skript. Ohne das angehängte
# `|| exit 1` liefe der Ablauf mit einer leeren Variablen weiter, und der
# folgende Zahlenvergleich (`[ "" -ne 3 ]`) meldet unter bash einen Syntax-
# fehler, der als „Bedingung nicht erfüllt" durchgeht: Das Skript endete mit
# 0, obwohl die Antwort unbrauchbar war — genau der stille Fehlschlag, den
# dieses Skript aufdecken soll. Der Rückgabewert der Ersetzung ist der der
# Subshell, deshalb greift `|| exit 1` zuverlässig.
feld() {
  local text="$1" ausdruck="$2" wert
  wert=$(printf '%s' "$text" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    wert = $ausdruck
except Exception as fehler:
    print('LESEFEHLER:' + str(fehler))
    sys.exit(0)
print('LEER' if wert is None else wert)
")
  if [ -z "$wert" ] || [ "$wert" = "LEER" ] || [[ "$wert" == LESEFEHLER:* ]]; then
    echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Feld „${ausdruck}“ fehlt oder ist leer in: $text" >&2
    exit 1
  fi
  printf '%s' "$wert"
}

# Prüft eine erwartete HTTP-Statuszeile hart. $1: erwartet, $2: bekommen,
# $3: Antwortkörper (nur für die Fehlermeldung).
erwarte_status() {
  local erwartet="$1" bekommen="$2" koerper="$3"
  if [ "$bekommen" = "$erwartet" ]; then
    echo "Status $bekommen — passt."
    return 0
  fi
  if [ "$bekommen" = "000" ]; then
    echo "FEHLGESCHLAGEN bei „${SCHRITT}“: keine Verbindung zu $BASIS bekommen." >&2
    echo "Läuft der Aufbau? docker compose -f betrieb/docker-compose.yml ps" >&2
    exit 1
  fi
  if [ "$bekommen" = "429" ]; then
    echo "FEHLGESCHLAGEN bei „${SCHRITT}“: 429 (zu viele Anfragen) statt $erwartet." >&2
    echo "Das ist vermutlich keine kaputte Anmeldung, sondern eine noch volle" >&2
    echo "Ratenbegrenzung von einem Lauf in derselben Minute — siehe Kopf dieses" >&2
    echo "Skripts. Eine Minute warten und erneut versuchen." >&2
    exit 1
  fi
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: erwartet Status $erwartet, bekommen $bekommen." >&2
  echo "Antwortkörper: $koerper" >&2
  exit 1
}

echo "Ablauf gegen $BASIS, Postfach unter $MAILPIT."

# --- Schritt 0: Vorprüfung ------------------------------------------------
schritt "Vorprüfung: Läuft der Aufbau?"
GESUNDHEIT=$(curl -s -o /tmp/mtbie-gesundheit.$$ -w '%{http_code}' "$BASIS/gesundheit" 2>/dev/null)
KOERPER=$(cat /tmp/mtbie-gesundheit.$$ 2>/dev/null); rm -f /tmp/mtbie-gesundheit.$$
erwarte_status 200 "$GESUNDHEIT" "$KOERPER"

# --- Schritt 1: Einladungscode erzeugen -----------------------------------
schritt "Einladungscode erzeugen"
EMAIL="ablauf-probe-$(date +%s)-$$@example.org"
echo "Testadresse: $EMAIL"
AUSGABE_DATEI=$(mktemp)
if ! "${COMPOSE[@]}" exec -T api npm run einladung:erzeugen -- "$EMAIL" >"$AUSGABE_DATEI" 2>&1; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Der Aufruf im Container ist fehlgeschlagen." >&2
  cat "$AUSGABE_DATEI" >&2
  rm -f "$AUSGABE_DATEI"
  exit 1
fi
CODE=$(grep -E "^${EMAIL}: " "$AUSGABE_DATEI" | sed -E "s/^${EMAIL}: //")
rm -f "$AUSGABE_DATEI"
if [ -z "$CODE" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Kein Code in der Ausgabe des CLI-Werkzeugs gefunden." >&2
  exit 1
fi
echo "Einladungscode erzeugt: $CODE"

# --- Schritt 2: Anmeldung anfordern ---------------------------------------
schritt "Anmeldung anfordern (POST /anmeldung/anfordern)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' -X POST "$BASIS/anmeldung/anfordern" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"einladungscode\":\"$CODE\"}" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 202 "$STATUS" "$KOERPER"
echo "Erwartet war ein Hinweis ohne Auskunft, ob die Adresse stimmt — bekommen: $KOERPER"

# --- Schritt 3: Magic Link aus Mailpit holen ------------------------------
schritt "Magic Link aus Mailpit holen"
# Der Versand läuft im Hintergrund (siehe fordereMagicLinkAn) — die Mail
# kann also ein, zwei Umläufe brauchen, bis Mailpit sie zeigt. Statt einer
# blinden Wartezeit: kurz nachfragen, bis sie da ist oder es zu lange dauert.
NACHRICHT_ID=""
for versuch in $(seq 1 10); do
  SUCHE=$(curl -s "$MAILPIT/api/v1/search?query=to%3A$EMAIL" 2>/dev/null || echo '{}')
  TREFFER=$(printf '%s' "$SUCHE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
nachrichten = d.get('messages', [])
print(nachrichten[0]['ID'] if nachrichten else '')
" 2>/dev/null)
  if [ -n "$TREFFER" ]; then
    NACHRICHT_ID="$TREFFER"
    break
  fi
  sleep 1
done
if [ -z "$NACHRICHT_ID" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Nach 10 Sekunden keine Mail an $EMAIL in Mailpit gefunden." >&2
  echo "Läuft Mailpit? Ist SMTP_HOST=mailpit in betrieb/docker-compose.yml gesetzt?" >&2
  exit 1
fi
echo "Mail gefunden: $NACHRICHT_ID"

NACHRICHT=$(curl -s "$MAILPIT/api/v1/message/$NACHRICHT_ID")
BETREFF=$(feld "$NACHRICHT" "d['Subject']") || exit 1
TEXT=$(feld "$NACHRICHT" "d['Text']") || exit 1
echo "Betreff: $BETREFF"

# Stolperstein aus Plan 3: Kommen Umlaute in Betreff und Text richtig an,
# oder verstümmelt die Übertragung sie (Mojibake wie „GrÃ¼ÃŸe")?
if ! printf '%s' "$TEXT" | grep -q 'Grüße'; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Umlaute im Mailtext kommen nicht richtig an." >&2
  echo "Text: $TEXT" >&2
  exit 1
fi
echo "Umlaute kommen richtig an (,Grüße' im Text gefunden)."

# Stolperstein aus Plan 3: Zeigt der Link auf ein Format, das
# extrahiereMagicToken (App, src/konto/magicLink.ts) versteht? Dessen Muster
# ist genau das hier nachgebildete: /anmeldung/<Token aus Buchstaben, Ziffern,
# _ und ->. Trifft es nicht — etwa weil APP_BASIS_URL den Pfad doppelt
# einträgt (mtbie://anmeldung/anmeldung/<token>, der Fund aus Aufgabe 3/5) —
# bleibt TOKEN hier leer, und das Skript bricht ab statt mit einem
# nutzlosen Token weiterzumachen.
TOKEN=$(printf '%s' "$TEXT" | grep -oE '/anmeldung/[A-Za-z0-9_-]+' | tail -n1 | sed -E 's#^/anmeldung/##')
if [ -z "$TOKEN" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Kein Token im erwarteten Format /anmeldung/<Token> im Link gefunden." >&2
  echo "Text: $TEXT" >&2
  exit 1
fi
echo "Token aus dem Link gelesen (Format passt zu extrahiereMagicToken): ${TOKEN:0:8}…"

# --- Schritt 4: Magic Link einlösen ---------------------------------------
schritt "Magic Link einlösen (POST /anmeldung/einloesen)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' -X POST "$BASIS/anmeldung/einloesen" \
  -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 200 "$STATUS" "$KOERPER"
ZUGANG=$(feld "$KOERPER" "d['zugang']") || exit 1
echo "Zugangs-Token bekommen: ${ZUGANG:0:8}…"

# --- Schritt 5: /konto abfragen -------------------------------------------
schritt "Konto abfragen (GET /konto)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' "$BASIS/konto" \
  -H "Authorization: Bearer $ZUGANG" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 200 "$STATUS" "$KOERPER"
KONTO_EMAIL=$(feld "$KOERPER" "d['email']") || exit 1
if [ "$(printf '%s' "$KONTO_EMAIL" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: /konto nennt $KONTO_EMAIL, erwartet war $EMAIL." >&2
  exit 1
fi
echo "Konto gehört zur richtigen Adresse: $KONTO_EMAIL"

# --- Schritt 6: Terminschlüssel aus dem echten Kalender ermitteln --------
schritt "Einen echten, noch anmeldbaren Termin finden"
# Es gibt keinen Endpunkt, der Termine auflistet — GET /termine/:schluessel
# will den Schlüssel schon kennen. Statt einen zu erfinden, wird hier
# derselbe Weg gegangen wie die API selbst: erzeugeStandardTerminDienst()
# liest den echten Vereinskalender (api/src/termine.ts) und berechnet mit
# terminSchluessel() genau die Schlüssel, die auch /termine/:schluessel
# erwartet. Das läuft im Container, damit auch das dort geprüft ist, was
# Plan 3 als Stolperstein nennt: Kommt die API im Container überhaupt ans
# Netz, um den Kalender zu lesen?
TERMIN_SKRIPT=$(mktemp)
cat >"$TERMIN_SKRIPT" <<'JS'
import { erzeugeStandardTerminDienst, terminSchluessel } from './src/termine.ts';
const dienst = erzeugeStandardTerminDienst({ error: console.error, info: console.info });
const termine = await dienst.holeTermine();
const jetzt = Date.now();
const kandidaten = termine.filter((t) => !t.cancelled && t.start.getTime() > jetzt).slice(0, 8);
for (const t of kandidaten) {
  console.log([terminSchluessel(t), t.title].join('\t'));
}
JS
KANDIDATEN_DATEI=$(mktemp)
if ! "${COMPOSE[@]}" exec -T api node --experimental-strip-types --input-type=module - <"$TERMIN_SKRIPT" >"$KANDIDATEN_DATEI" 2>"$KANDIDATEN_DATEI.err"; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Der Kalender ließ sich im Container nicht lesen." >&2
  echo "Kommt die API im Container ans Netz? Ausgabe:" >&2
  cat "$KANDIDATEN_DATEI.err" >&2
  rm -f "$TERMIN_SKRIPT" "$KANDIDATEN_DATEI" "$KANDIDATEN_DATEI.err"
  exit 1
fi
rm -f "$TERMIN_SKRIPT" "$KANDIDATEN_DATEI.err"
if [ ! -s "$KANDIDATEN_DATEI" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Der echte Kalender hat keinen einzigen anstehenden, nicht abgesagten Termin." >&2
  rm -f "$KANDIDATEN_DATEI"
  exit 1
fi
echo "Anstehende Termine im echten Kalender:"
cat "$KANDIDATEN_DATEI"

# Unter den Kandidaten den ersten nehmen, der laut GET /termine/:schluessel
# tatsächlich noch Platz hat (oder unbegrenzt viele) — sonst würde „anmelden"
# unten an „voll" scheitern, ohne dass das etwas über den Ablauf aussagt.
SCHLUESSEL=""
TITEL=""
while IFS=$'\t' read -r kandidat kandidat_titel; do
  if [ -z "$kandidat" ]; then
    continue
  fi
  BELEGUNG=$(curl -s "$BASIS/termine/$kandidat" 2>/dev/null)
  # Kein `feld`-Aufruf für „abgesagt": Hier ist eine unbrauchbare Antwort
  # kein Abbruchgrund, sondern nur ein Kandidat weniger — die Prüfung unten
  # verwirft ihn dann von selbst.
  PASST=$(printf '%s' "$BELEGUNG" | python3 -c "
import sys, json
d = json.load(sys.stdin)
frei = d.get('frei')
print('1' if (not d.get('abgesagt') and (frei is None or frei > 0)) else '0')
")
  if [ "$PASST" = "1" ]; then
    SCHLUESSEL="$kandidat"
    TITEL="$kandidat_titel"
    break
  fi
done <"$KANDIDATEN_DATEI"
rm -f "$KANDIDATEN_DATEI"

if [ -z "$SCHLUESSEL" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Keiner der anstehenden Termine hat noch freie Plätze." >&2
  exit 1
fi
echo "Gewählter Termin: „${TITEL}“ ($SCHLUESSEL)"

# --- Schritt 7: Belegung abfragen (vorher) --------------------------------
schritt "Belegung abfragen (GET /termine/:schluessel)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' "$BASIS/termine/$SCHLUESSEL" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 200 "$STATUS" "$KOERPER"
BELEGT_VORHER=$(feld "$KOERPER" "d['belegt']") || exit 1
echo "Belegung vor der Anmeldung: $BELEGT_VORHER"

# --- Schritt 8: Anmelden ---------------------------------------------------
schritt "Zum Termin anmelden (POST /termine/:schluessel)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' -X POST "$BASIS/termine/$SCHLUESSEL" \
  -H "Authorization: Bearer $ZUGANG" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 201 "$STATUS" "$KOERPER"
BELEGT_NACHHER=$(feld "$KOERPER" "d['belegt']") || exit 1
if [ "$BELEGT_NACHHER" -ne "$((BELEGT_VORHER + 1))" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Belegung stieg nicht um eins (vorher $BELEGT_VORHER, jetzt $BELEGT_NACHHER)." >&2
  exit 1
fi
echo "Angemeldet — Belegung stieg von $BELEGT_VORHER auf $BELEGT_NACHHER."

# --- Schritt 9: Abmelden ---------------------------------------------------
schritt "Vom Termin abmelden (DELETE /termine/:schluessel/ich)"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' -X DELETE "$BASIS/termine/$SCHLUESSEL/ich" \
  -H "Authorization: Bearer $ZUGANG" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 204 "$STATUS" "$KOERPER"
echo "Abgemeldet."

# --- Schritt 10: Belegung erneut abfragen (Gegenprobe) ---------------------
schritt "Gegenprobe: Belegung nach dem Abmelden"
ANTWORT_DATEI=$(mktemp)
STATUS=$(curl -s -o "$ANTWORT_DATEI" -w '%{http_code}' "$BASIS/termine/$SCHLUESSEL" 2>/dev/null)
KOERPER=$(cat "$ANTWORT_DATEI"); rm -f "$ANTWORT_DATEI"
erwarte_status 200 "$STATUS" "$KOERPER"
BELEGT_FINAL=$(feld "$KOERPER" "d['belegt']") || exit 1
if [ "$BELEGT_FINAL" -ne "$BELEGT_VORHER" ]; then
  echo "FEHLGESCHLAGEN bei „${SCHRITT}“: Belegung ist nach dem Abmelden $BELEGT_FINAL, erwartet war wieder $BELEGT_VORHER." >&2
  exit 1
fi
echo "Belegung ist wieder beim Ausgangswert: $BELEGT_FINAL."

# --- Zusammenfassung --------------------------------------------------------
echo
echo "=== Zusammenfassung ==="
echo "Alle Schritte durchlaufen: Einladungscode -> Anmeldung anfordern ->"
echo "Magic Link aus Mailpit -> einlösen -> /konto -> Termin „${TITEL}“ ->"
echo "anmelden -> abmelden. Testkonto $EMAIL bleibt in der lokalen"
echo "Datenbank stehen — das ist ein Entwicklungsaufbau, kein Problem."
exit 0
