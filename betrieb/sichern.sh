#!/usr/bin/env bash
# Sichert die Datenbank verschlüsselt auf einen SFTP-Server.
#
#     betrieb/sichern.sh
#
# Läuft im Betrieb über einen systemd-Timer alle zwei Stunden
# (`betrieb/systemd/`), lässt sich aber jederzeit von Hand aufrufen.
#
# ## Warum ein Schlüsselpaar und keine Passphrase
#
# Verschlüsselt wird mit `age` gegen einen **öffentlichen** Schlüssel. Auf dem
# Server liegt deshalb nichts, womit sich eine Sicherung entschlüsseln ließe —
# nur der Empfänger. Wer diesen Server übernimmt, bekommt die Adressen der
# Mitglieder aus den Sicherungen also **nicht** obendrauf. Eine Passphrase
# hätte genau das getan: Sie müsste hier liegen, um zu verschlüsseln.
#
# Der **private** Schlüssel gehört nicht auf diese Maschine. Er liegt beim
# Verein (Passwortverwaltung, Tresor) und wird nur zum Zurückspielen gebraucht
# — siehe `betrieb/ruecksicherung.sh`.
#
# **Ohne ihn ist jede Sicherung wertlos.** Das ist der Preis dieser Bauweise,
# und er ist bewusst gewählt: Ein verlorener Schlüssel ist ein verlorenes
# Backup, aber ein gestohlener Server ist kein Datenleck.
#
# ## Was gesichert wird — und was nicht
#
# **Gesichert:** der vollständige Postgres-Dump. Das ist alles, was sich nicht
# wiederherstellen lässt — Mitglieder, Einladungen, Sitzungen, Anmeldungen.
#
# **Nicht gesichert:** `betrieb/.env`. Dort stehen Zugangsdaten; sie gehören
# nicht in dieselbe Ablage wie die Daten, die sie schützen. Wer den Server neu
# aufsetzt, legt die `.env` aus `.env.beispiel` neu an — die Werte kommen aus
# der Passwortverwaltung des Vereins, nicht aus einem Backup.
#
# **Auch nicht gesichert:** die Container-Volumes von Caddy (Zertifikate holt
# es sich neu) und die Images (werden gebaut).
set -uo pipefail

WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$WURZEL/betrieb/docker-compose.yml")
UMGEBUNG="$WURZEL/betrieb/.env"

# Alle Meldungen auch nach syslog, damit `journalctl -u mtb-sicherung` sie
# zeigt — ein Fehlschlag um drei Uhr nachts soll auffindbar sein.
melde() { echo "$*"; command -v logger >/dev/null && logger -t mtb-sicherung "$*"; }
scheitere() {
  melde "FEHLGESCHLAGEN: $*"
  exit 1
}

[ -r "$UMGEBUNG" ] || scheitere "$UMGEBUNG nicht lesbar."
# shellcheck disable=SC1090
set -a; . "$UMGEBUNG"; set +a

: "${POSTGRES_USER:?POSTGRES_USER fehlt in betrieb/.env}"
: "${POSTGRES_DB:?POSTGRES_DB fehlt in betrieb/.env}"
: "${SICHERUNG_EMPFAENGER:?SICHERUNG_EMPFAENGER fehlt in betrieb/.env — der öffentliche age-Schlüssel}"
: "${SICHERUNG_ZIEL:?SICHERUNG_ZIEL fehlt in betrieb/.env — z. B. benutzer@host:/pfad}"
: "${SICHERUNG_SCHLUESSEL:?SICHERUNG_SCHLUESSEL fehlt in betrieb/.env — SSH-Schlüssel für den SFTP-Zugang}"
TAGE=${SICHERUNG_TAGE:-31}
# Hetzners Storage Box hört auf **23**, nicht auf 22 — Port 22 nimmt dort
# zwar Verbindungen an, weist einen Schlüssel aber ab („Connection closed").
# Deshalb ein eigener Wert mit dem üblichen Standard, statt den Port in
# SICHERUNG_ZIEL zu quetschen: `benutzer@host:port:/pfad` wäre nicht mehr
# zu lesen, und der Doppelpunkt trennt dort schon den Pfad ab.
PORT=${SICHERUNG_PORT:-22}

command -v age >/dev/null || scheitere "age ist nicht installiert (apt install age)."
command -v sftp >/dev/null || scheitere "sftp ist nicht installiert (apt install openssh-client)."

BENUTZER_HOST=${SICHERUNG_ZIEL%%:*}
FERNPFAD=${SICHERUNG_ZIEL#*:}
[ "$BENUTZER_HOST" != "$SICHERUNG_ZIEL" ] || scheitere "SICHERUNG_ZIEL braucht die Form benutzer@host:/pfad"

# Zeitstempel in UTC und sortierbar: Die Namen müssen sich vergleichen lassen,
# ohne sie zu zerlegen, und dürfen bei der Zeitumstellung nicht rückwärts
# springen — sonst überschreibt die Sicherung um 2:30 die von 2:30.
STEMPEL=$(date -u +%Y%m%dT%H%M%SZ)
NAME="mtbie-$STEMPEL.sql.gz.age"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

melde "Sicherung $NAME beginnt."

# --- 1. Dump, gepackt und verschlüsselt in einem Durchlauf ----------------
# `pg_dump` schreibt nach stdout, alles läuft durch die Kette — der Klartext
# landet zu keinem Zeitpunkt auf der Platte.
if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
     | gzip -9 \
     | age -r "$SICHERUNG_EMPFAENGER" -o "$TMP/$NAME"; then
  scheitere "pg_dump, gzip oder age sind gescheitert. Läuft der Aufbau?"
fi

GROESSE=$(stat -c %s "$TMP/$NAME" 2>/dev/null || stat -f %z "$TMP/$NAME")
# Eine leere oder winzige Datei ist kein Backup, sondern ein stiller
# Fehlschlag mit Dateinamen. Der age-Kopf allein ist schon gut 200 Bytes.
[ "$GROESSE" -gt 500 ] || scheitere "Die Sicherung ist nur $GROESSE Bytes groß — das kann kein Dump sein."

# --- 2. Hochladen ---------------------------------------------------------
SFTP=(sftp -q -P "$PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -i "$SICHERUNG_SCHLUESSEL")
if ! "${SFTP[@]}" "$BENUTZER_HOST" <<EOF
cd $FERNPFAD
put $TMP/$NAME
bye
EOF
then
  scheitere "Hochladen nach $SICHERUNG_ZIEL gescheitert. Schlüssel? Pfad? Wirtsschlüssel bekannt?"
fi

# --- 3. Gegenprobe: liegt sie wirklich dort? ------------------------------
# Ein `put` ohne Fehler heißt noch nicht, dass die Datei vollständig ankam.
FERN_GROESSE=$("${SFTP[@]}" "$BENUTZER_HOST" <<EOF 2>/dev/null | awk -v n="$NAME" '$NF == n {print $5}'
cd $FERNPFAD
ls -l $NAME
bye
EOF
)
[ "$FERN_GROESSE" = "$GROESSE" ] || scheitere "Auf dem Ziel liegen $FERN_GROESSE Bytes, lokal waren es $GROESSE."

melde "Hochgeladen: $NAME ($GROESSE Bytes)."

# --- 4. Alte Sicherungen wegräumen ---------------------------------------
# Rollierend: Was älter als $TAGE Tage ist, fliegt. Verglichen wird über den
# Zeitstempel im Namen, nicht über das Änderungsdatum auf dem Server — das
# setzt mancher SFTP-Dienst beim Hochladen neu.
GRENZE=$(date -u -d "-$TAGE days" +%Y%m%dT%H%M%SZ 2>/dev/null || date -u -v-"${TAGE}"d +%Y%m%dT%H%M%SZ)
ALT=$("${SFTP[@]}" "$BENUTZER_HOST" <<EOF 2>/dev/null | grep -oE 'mtbie-[0-9]{8}T[0-9]{6}Z\.sql\.gz\.age' | sort -u
cd $FERNPFAD
ls -1
bye
EOF
)

ANZAHL=0
GELOESCHT=0
while read -r datei; do
  [ -n "$datei" ] || continue
  ANZAHL=$((ANZAHL + 1))
  stempel=${datei#mtbie-}; stempel=${stempel%%.sql.gz.age}
  if [[ "$stempel" < "$GRENZE" ]]; then
    if "${SFTP[@]}" "$BENUTZER_HOST" <<EOF >/dev/null 2>&1
cd $FERNPFAD
rm $datei
bye
EOF
    then GELOESCHT=$((GELOESCHT + 1)); fi
  fi
done <<< "$ALT"

melde "Bestand: $ANZAHL Sicherungen, davon $GELOESCHT als älter als $TAGE Tage entfernt."
melde "Fertig."
