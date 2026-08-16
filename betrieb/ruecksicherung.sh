#!/usr/bin/env bash
# Spielt eine Sicherung zurück — Datenbank **oder** Bildarchiv.
#
#     betrieb/ruecksicherung.sh mtbie-20260805T060000Z.sql.gz.age ~/mtb-sicherung.age-key
#     betrieb/ruecksicherung.sh mtbie-bilder-20260805T060000Z.tar.gz.age ~/mtb-sicherung.age-key
#
# Welche der beiden Arten gemeint ist, entscheidet die **Endung**, nicht ein
# Schalter: `.sql.gz.age` ist die Datenbank, `.tar.gz.age` sind die Bilder.
# Ein Schalter, den man im Ernstfall falsch setzt, wäre die schlechtere
# Bedienung — und im Ernstfall ist niemand ausgeruht.
#
# **Beides gehört zusammen.** Die Datenbank hält die Verweise, das Archiv die
# Dateien. Wer nur den Dump zurückspielt, bekommt eine vollständige
# Mitgliederverwaltung mit lauter Bildern, die es nicht mehr gibt. Die beiden
# Sicherungen entstehen in verschiedenem Takt (Datenbank alle zwei Stunden,
# Bilder täglich) — man nimmt also **das Bildarchiv, das dem Dump am
# nächsten liegt**, und rechnet damit, dass die letzten Stunden Bilder fehlen.
#
# **Braucht den privaten age-Schlüssel.** Der liegt nicht auf dem Server,
# sondern beim Verein (siehe Kopf von `sichern.sh`). Ohne ihn ist keine
# Sicherung zu öffnen — auch nicht von jemandem, der den Server übernimmt.
#
# ## Wo das ausgeführt wird
#
# **Nicht auf dem laufenden Server**, außer im echten Ernstfall: Das Skript
# überschreibt die Datenbank. Zum Üben — und geübt gehört es, siehe unten —
# nimmt man einen frischen lokalen Aufbau.
#
# ## Warum es dieses Skript gibt
#
# Ein nie zurückgespieltes Backup ist kein Backup, sondern eine Vermutung.
# Erst der Durchlauf zeigt, ob der Dump vollständig ist, ob der Schlüssel
# noch passt, ob jemand ihn überhaupt findet. Diese drei Dinge scheitern
# still, und zwar genau bis zu dem Tag, an dem sie gebraucht werden.
#
# **Einmal im Quartal üben.** In den Vereinskalender eintragen, sonst
# passiert es nicht. Das Datum der letzten Probe gehört in
# `betrieb/SERVER.md`.
set -uo pipefail

DATEI=${1:-}
SCHLUESSEL=${2:-}
if [ -z "$DATEI" ] || [ -z "$SCHLUESSEL" ]; then
  echo "Aufruf: $0 <sicherung.sql.gz.age> <privater-age-schluessel>" >&2
  exit 1
fi

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$WURZEL/betrieb/docker-compose.yml")
UMGEBUNG="$WURZEL/betrieb/.env"

scheitere() { echo "FEHLGESCHLAGEN: $*" >&2; exit 1; }

[ -r "$DATEI" ]       || scheitere "$DATEI nicht lesbar."
[ -r "$SCHLUESSEL" ]  || scheitere "$SCHLUESSEL nicht lesbar."
[ -r "$UMGEBUNG" ]    || scheitere "$UMGEBUNG nicht lesbar."
command -v age >/dev/null || scheitere "age ist nicht installiert."

# shellcheck disable=SC1090
set -a; . "$UMGEBUNG"; set +a
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"

# --- Bildarchiv ------------------------------------------------------------
#
# Steht vor dem Datenbankteil und endet mit `exit`: Die beiden Wege haben
# nichts gemeinsam außer dem Entschlüsseln, und ineinandergeschobene
# Verzweigungen über ein ganzes Skript liest im Ernstfall niemand.
case "$DATEI" in
*.tar.gz.age)
  echo "Das entpackt das Bildarchiv in das Volume der Bildablage (/fotos)."
  echo "Vorhandene Dateien mit gleichem Namen werden überschrieben."
  read -r -p "Zum Bestätigen 'zurückspielen' tippen: " antwort
  [ "$antwort" = "zurückspielen" ] || { echo "Abgebrochen."; exit 1; }

  echo "--- Entschlüsseln und entpacken ---"
  # Kein `--delete`-Verhalten: Entpackt wird **über** den Bestand. Ein
  # Archiv, das den Ordner vorher leert, verlöre bei einer Teilrücksicherung
  # genau die Bilder, die noch da waren.
  if ! age -d -i "$SCHLUESSEL" "$DATEI" | gunzip \
       | "${COMPOSE[@]}" exec -T api tar -xf - -C /fotos; then
    scheitere "Entpacken gescheitert. Passt der Schlüssel zur Datei? Läuft der api-Container?"
  fi

  echo "--- Was jetzt in der Ablage liegt ---"
  "${COMPOSE[@]}" exec -T api sh -c 'echo "$(find /fotos -type f | wc -l) Dateien, $(du -sh /fotos | cut -f1)"'
  echo
  echo "Zurückgespielt. **Dazu gehört der passende Datenbank-Dump** — ohne ihn"
  echo "kennt die App keines dieser Bilder."
  exit 0
  ;;
esac

echo "Das überschreibt die Datenbank '$POSTGRES_DB' im Aufbau unter $WURZEL/betrieb."
echo "Vorhandene Daten gehen dabei verloren."
read -r -p "Zum Bestätigen 'zurückspielen' tippen: " antwort
[ "$antwort" = "zurückspielen" ] || { echo "Abgebrochen."; exit 1; }

echo "--- Entschlüsseln und einspielen ---"
# Der Klartext läuft durch die Pipe und landet nirgends auf der Platte.
if ! age -d -i "$SCHLUESSEL" "$DATEI" | gunzip \
     | "${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 >/dev/null; then
  scheitere "Einspielen gescheitert. Passt der Schlüssel zur Datei? Läuft Postgres?"
fi

echo "--- Was jetzt drin steht ---"
"${COMPOSE[@]}" exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
SELECT 'mitglied' AS tabelle, count(*) FROM mitglied
UNION ALL SELECT 'einladung', count(*) FROM einladung
UNION ALL SELECT 'sitzung', count(*) FROM sitzung
UNION ALL SELECT 'tourenanmeldung', count(*) FROM tourenanmeldung;"

echo
echo "Zurückgespielt. **Jetzt die eigentliche Probe:** betrieb/pruefe-ablauf.sh"
echo "Erst wenn der gegen diesen Stand durchläuft, ist die Sicherung bewiesen."
echo
echo "Und danach das Bildarchiv, sonst zeigen die Verweise ins Leere:"
echo "  $0 mtbie-bilder-<stempel>.tar.gz.age $SCHLUESSEL"
