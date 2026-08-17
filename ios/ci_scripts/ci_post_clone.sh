#!/bin/sh
# Weiche zum eigentlichen Skript in der Wurzel.
#
# ## Warum diese Datei existiert
#
# Xcode Cloud sucht `ci_scripts` **neben dem Xcode-Projekt**. Unseres liegt
# in `ios/`, also sucht es dort — und nicht in der Wurzel, wo die
# Anleitungen es hinlegen lassen. Nachgemessen am 17.08.2026: Vier Läufe
# scheiterten mit
#
#     xcodebuild: error: '/Volumes/workspace/repository/ios/MTBBIdev.xcworkspace' does not exist.
#
# und **ohne jedes `ci_post_clone`-Protokoll** — das Skript in der Wurzel
# wurde nie aufgerufen, obwohl es ausführbar im gebauten Stand lag.
#
# Der Inhalt bleibt in `ci_scripts/ci_post_clone.sh`: Dort ist er lesbar,
# ohne dass man wissen muss, dass `ios/` erzeugt wird. Hier steht nur der
# Zeiger darauf.
#
# ## Die Eigenheit dabei
#
# `ios/` wird von `expo prebuild` erzeugt und ist bis auf dieses
# Verzeichnis nicht versioniert (`.gitignore`: `/ios/*` mit einer Ausnahme).
# Deshalb ruft das Skript in der Wurzel `prebuild` **ohne** `--clean` auf —
# sonst löschte es das Verzeichnis, aus dem es gerade gestartet wurde.

set -e
exec "$CI_PRIMARY_REPOSITORY_PATH/ci_scripts/ci_post_clone.sh"
