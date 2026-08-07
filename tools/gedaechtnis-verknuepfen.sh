#!/usr/bin/env bash
#
# Verknüpft Claudes Gedächtnis mit dem Repository.
#
# Claude Code sucht seine Notizen unter
#   ~/.claude/projects/<Pfad-mit-Bindestrichen>/memory/
# also außerhalb des Projekts und damit auf genau einem Rechner. Dieses
# Skript legt dort eine Verknüpfung auf `.claude/memory/` im Repository an.
# Danach gibt es die Notizen nur einmal: Was Claude schreibt, landet im
# Arbeitsverzeichnis und lässt sich einchecken.
#
# Einmal nach dem Klonen auf einem neuen Rechner ausführen:
#   ./tools/gedaechtnis-verknuepfen.sh
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUELLE="$REPO/.claude/memory"

# So bildet Claude Code den Ordnernamen: der absolute Pfad, jeder Schrägstrich
# und jeder Punkt durch einen Bindestrich ersetzt.
KENNUNG="$(printf '%s' "$REPO" | tr '/.' '--')"
ZIEL="$HOME/.claude/projects/$KENNUNG/memory"

if [ ! -d "$QUELLE" ]; then
    echo "Fehlt: $QUELLE — im falschen Verzeichnis?" >&2
    exit 1
fi

if [ -L "$ZIEL" ] && [ "$(readlink "$ZIEL")" = "$QUELLE" ]; then
    echo "Steht schon: $ZIEL -> $QUELLE"
    exit 0
fi

mkdir -p "$(dirname "$ZIEL")"

# Ein bereits vorhandener echter Ordner wird beiseitegelegt, nicht gelöscht.
# Dort können Notizen liegen, die noch nirgends sonst stehen.
if [ -e "$ZIEL" ] || [ -L "$ZIEL" ]; then
    BEISEITE="$ZIEL.vorher-$(date +%Y%m%d-%H%M%S)"
    mv "$ZIEL" "$BEISEITE"
    echo "Vorhandenes beiseitegelegt: $BEISEITE"
    echo "  Bitte durchsehen — was dort steht, fehlt sonst."
fi

ln -s "$QUELLE" "$ZIEL"
echo "Verknüpft: $ZIEL -> $QUELLE"
echo
echo "Probe: Claude Code starten und nach dem Serverstand fragen. Kennt er"
echo "die offenen Punkte, stimmt der Pfad; sonst passt die Kennung nicht"
echo "und die Dateien lassen sich unter .claude/memory/ von Hand lesen."
