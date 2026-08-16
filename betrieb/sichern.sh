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
# **Ebenfalls gesichert, seit dem 16.08.2026: die Bilder** aus dem Volume
# `betrieb-fotos`. Bis dahin lief der Timer alle zwei Stunden und sicherte
# brav die Datenbank samt der Verweise auf Bilddateien — die Dateien selbst
# blieben liegen. Eine Rücksicherung hätte eine vollständige Datenbank
# ergeben, in der jedes Foto ins Leere zeigt. Aufgefallen ist es nur, weil
# jemand danach gefragt hat; das Volume war zu dem Zeitpunkt noch leer.
#
# Die Bilder laufen in **eigenem Takt** (`SICHERUNG_BILDER_STUNDEN`,
# voreingestellt 24) und mit **eigener Aufbewahrung**. Der Grund ist Masse:
# Der Dump ist ein paar hundert Kilobyte, das Bildarchiv wächst mit jedem
# Vereinsjahr in die Gigabyte. Alle zwei Stunden ein volles Archiv wäre
# derselbe Inhalt zwölfmal am Tag.
#
# **Volle Archive, keine Zuwächse** — und das ist eine bewusste Entscheidung
# gegen die sparsamere Bauweise: Ein Zuwachs-Archiv ist nur zusammen mit
# allen vorherigen etwas wert. Fällt eines aus (Fehlschlag, Aufräumfrist,
# ein übersehener Tag), fehlen die Bilder dieses Zeitraums für immer, und
# man merkt es erst beim Zurückspielen. Ein volles Archiv braucht zum
# Zurückspielen genau **eine** Datei. Bilder sind unersetzlich; Platz auf
# der Storage Box ist es nicht.
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
# Eigene Aufbewahrung für die Bildarchive: Sie sind um Größenordnungen
# dicker als ein Dump, und wie viel Platz die Storage Box hat, weiß nur der
# Verein. Ohne Angabe dieselbe Frist wie für die Datenbank.
BILDER_TAGE=${SICHERUNG_BILDER_TAGE:-$TAGE}
# Wie oft ein volles Bildarchiv entsteht. 0 schaltet die Bildsicherung ab —
# ausdrücklich vorgesehen für den Fall, dass der Verein die Bilder anders
# sichert; stillschweigend weglassen soll man sie nicht können.
BILDER_STUNDEN=${SICHERUNG_BILDER_STUNDEN:-24}
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

# Hochladen **und** nachsehen, ob es wirklich ankam — als Funktion, weil es
# das Bildarchiv genauso braucht wie den Dump.
#
# Die Gegenprobe ist nicht Zierde: Ein `put` ohne Fehler heißt noch nicht,
# dass die Datei vollständig ankam. Und `$5 ~ /^[0-9]+$/` ebenso wenig:
# Manche SFTP-Dienste spiegeln den Befehl zurück („sftp> ls -l mtbie-….age").
# Diese Zeile endet ebenfalls auf den Dateinamen, hat dort aber keine Größe —
# ohne die Prüfung stünden zwei Werte in der Ausgabe, und der Vergleich
# scheiterte bei einer Sicherung, die tatsächlich vollständig angekommen ist.
# Genau so gesehen mit Hetzners Storage Box am 16.08.2026.
lade_hoch() {
  local pfad=$1 name=$2 groesse fern
  groesse=$(stat -c %s "$pfad" 2>/dev/null || stat -f %z "$pfad")

  "${SFTP[@]}" "$BENUTZER_HOST" <<EOF || return 1
cd $FERNPFAD
put $pfad
bye
EOF

  fern=$("${SFTP[@]}" "$BENUTZER_HOST" <<EOF 2>/dev/null | awk -v n="$name" '$NF == n && $5 ~ /^[0-9]+$/ {print $5; exit}'
cd $FERNPFAD
ls -l $name
bye
EOF
)
  if [ "$fern" != "$groesse" ]; then
    melde "Auf dem Ziel liegen ${fern:-0} Bytes, lokal waren es $groesse."
    return 1
  fi
  melde "Hochgeladen: $name ($groesse Bytes)."
}

lade_hoch "$TMP/$NAME" "$NAME" \
  || scheitere "Hochladen von $NAME nach $SICHERUNG_ZIEL gescheitert. Schlüssel? Pfad? Wirtsschlüssel bekannt?"

# --- 3. Die Bilder ---------------------------------------------------------
#
# Eigener Takt, eigene Aufbewahrung, volle Archive — die Begründung steht im
# Kopf dieser Datei.
#
# Ob heute schon eines fällig ist, wird **am Ziel** abgelesen und nicht in
# einer Merkdatei auf dem Server festgehalten. Eine Merkdatei ginge beim
# Neuaufsetzen der Maschine verloren, und dann stünde dort „noch nie
# gesichert", während auf der Box dreißig Archive liegen. Das Ziel weiß es
# ohnehin besser als wir.
fern_liste() {
  "${SFTP[@]}" "$BENUTZER_HOST" <<EOF 2>/dev/null
cd $FERNPFAD
ls -1
bye
EOF
}

BILDER_MUSTER='mtbie-bilder-[0-9]{8}T[0-9]{6}Z\.tar\.gz\.age'
LISTE=$(fern_liste)

if [ "$BILDER_STUNDEN" -le 0 ]; then
  melde "Bildsicherung ist abgeschaltet (SICHERUNG_BILDER_STUNDEN=0)."
else
  LETZTES=$(grep -oE "$BILDER_MUSTER" <<<"$LISTE" | sort | tail -1)
  FAELLIG_AB=$(date -u -d "-$BILDER_STUNDEN hours" +%Y%m%dT%H%M%SZ 2>/dev/null \
    || date -u -v-"${BILDER_STUNDEN}"H +%Y%m%dT%H%M%SZ)
  LETZTER_STEMPEL=${LETZTES#mtbie-bilder-}; LETZTER_STEMPEL=${LETZTER_STEMPEL%%.tar.gz.age}

  if [ -n "$LETZTES" ] && [[ "$LETZTER_STEMPEL" > "$FAELLIG_AB" ]]; then
    melde "Bildarchiv noch aktuell ($LETZTES) — übersprungen."
  else
    BILD_NAME="mtbie-bilder-$STEMPEL.tar.gz.age"

    # Erst zählen, dann packen. Ein leeres Volume ist der Normalfall, solange
    # niemand Bilder hochgeladen hat — dafür jeden Tag ein Archiv aus nichts
    # anzulegen, verstopfte die Ablage mit Attrappen und ließe eine echte
    # Lücke später nicht mehr auffallen.
    ANZ_BILDER=$("${COMPOSE[@]}" exec -T api sh -c 'find /fotos -type f | wc -l' 2>/dev/null | tr -d '[:space:]')

    if [ -z "$ANZ_BILDER" ]; then
      scheitere "Die Bildablage ließ sich nicht lesen. Läuft der api-Container?"
    elif [ "$ANZ_BILDER" -eq 0 ]; then
      melde "Keine Bilder vorhanden — kein Archiv angelegt."
    else
      melde "Bildarchiv $BILD_NAME beginnt ($ANZ_BILDER Dateien)."
      # Wie beim Dump: durch die Pipe, der Klartext berührt die Platte nicht.
      # `tar` liegt im Alpine-Abbild als busybox bei.
      if ! "${COMPOSE[@]}" exec -T api tar -cf - -C /fotos . \
           | gzip -9 \
           | age -r "$SICHERUNG_EMPFAENGER" -o "$TMP/$BILD_NAME"; then
        scheitere "Das Bildarchiv ließ sich nicht anlegen (tar, gzip oder age)."
      fi

      BILD_GROESSE=$(stat -c %s "$TMP/$BILD_NAME" 2>/dev/null || stat -f %z "$TMP/$BILD_NAME")
      [ "$BILD_GROESSE" -gt 500 ] \
        || scheitere "Das Bildarchiv ist nur $BILD_GROESSE Bytes groß — das kann nicht stimmen."

      lade_hoch "$TMP/$BILD_NAME" "$BILD_NAME" \
        || scheitere "Hochladen des Bildarchivs gescheitert."

      # Platz sofort wieder freigeben: Das Archiv kann viele Gigabyte wiegen,
      # und `trap` räumt erst am Ende auf — dazwischen läuft noch das
      # Aufräumen am Ziel.
      rm -f "$TMP/$BILD_NAME"
      LISTE=$(fern_liste)
    fi
  fi
fi

# --- 4. Alte Sicherungen wegräumen ---------------------------------------
# Rollierend: Was älter als die jeweilige Frist ist, fliegt. Verglichen wird
# über den Zeitstempel im Namen, nicht über das Änderungsdatum auf dem Server
# — das setzt mancher SFTP-Dienst beim Hochladen neu.
#
# Zwei Arten mit **getrennten** Fristen, und die Trennung ist wichtig: Beide
# Namen fangen mit `mtbie-` an, ein gemeinsamer Ausdruck über beide würde die
# Bildarchive nach der Datenbankfrist wegwerfen. Deshalb je ein eigenes
# Muster, und das der Datenbank verlangt ausdrücklich `.sql.gz.age`.
raeume_auf() {
  local muster=$1 endung=$2 tage=$3 beschriftung=$4
  local grenze alt anzahl=0 geloescht=0 stempel

  grenze=$(date -u -d "-$tage days" +%Y%m%dT%H%M%SZ 2>/dev/null \
    || date -u -v-"${tage}"d +%Y%m%dT%H%M%SZ)
  alt=$(grep -oE "$muster" <<<"$LISTE" | sort -u)

  while read -r datei; do
    [ -n "$datei" ] || continue
    anzahl=$((anzahl + 1))
    stempel=${datei##*-}; stempel=${stempel%%"$endung"}
    if [[ "$stempel" < "$grenze" ]]; then
      if "${SFTP[@]}" "$BENUTZER_HOST" <<EOF >/dev/null 2>&1
cd $FERNPFAD
rm $datei
bye
EOF
      then geloescht=$((geloescht + 1)); fi
    fi
  done <<< "$alt"

  melde "Bestand $beschriftung: $anzahl, davon $geloescht älter als $tage Tage entfernt."
}

raeume_auf 'mtbie-[0-9]{8}T[0-9]{6}Z\.sql\.gz\.age' '.sql.gz.age' "$TAGE" 'Datenbank'
raeume_auf "$BILDER_MUSTER" '.tar.gz.age' "$BILDER_TAGE" 'Bilder'

melde "Fertig."
