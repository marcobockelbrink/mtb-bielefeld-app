#!/bin/sh
# Xcode Cloud, Schritt 1: aus dem geklonten Repository ein baubares
# iOS-Projekt machen.
#
# Xcode Cloud führt dieses Skript nach dem Klonen und **vor** dem Auflösen
# der Abhängigkeiten aus. Es muss `ci_scripts/ci_post_clone.sh` heißen und
# ausführbar sein — beides prüft niemand, es passiert dann einfach nichts.
#
# ## Warum es dieses Skript überhaupt braucht
#
# `ios/` ist in diesem Projekt **nicht versioniert** (`.gitignore`), und das
# soll so bleiben: Der Ordner wird aus `app.config.js` erzeugt, und eine
# eingecheckte Kopie liefe unweigerlich auseinander — `expo prebuild`
# schreibt beim Erzeugen still zwei Dinge um (siehe CLAUDE.md, Falle 6).
# Also erzeugt die CI ihn bei jedem Lauf neu, aus derselben Quelle wie EAS.
#
# `sh` und nicht `bash`: Xcode Cloud startet die Skripte mit `/bin/sh`.
# `set -e` ist hier die halbe Miete — ohne es liefe ein gescheitertes
# `npm ci` durch, und der Fehler stünde erst viel später beim Übersetzen.

set -e

echo "--- Node und CocoaPods besorgen ---"
# Die Xcode-Cloud-Abbilder bringen Homebrew mit, aber kein Node. `--quiet`,
# weil Homebrew sonst mehrere hundert Zeilen Fortschritt ins Protokoll
# schreibt und der eigentliche Fehler darin untergeht.
#
# **CocoaPods gehört ausdrücklich dazu.** Xcode Cloud löst von selbst nur
# Swift Packages auf — CocoaPods nicht. Für ein Expo-Projekt heißt das:
# ohne `pod install` weiter unten findet `xcodebuild` das Workspace zwar,
# aber keinen einzigen Pod, und scheitert mit einer Meldung über fehlende
# Header, die auf alles zeigt außer auf die Ursache.
brew install --quiet node cocoapods

cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "--- Umgebung prüfen ---"
# **Hier steht die wichtigste Zeile dieses Skripts.**
#
# `app.config.js` lässt jeden unbekannten Wert absichtlich als `dev` gelten:
# Auf einem Rechner ist das die harmlose Richtung, und ein versehentlicher
# dev-Bau fällt sofort auf, weil die App „MTB BI (dev)" heißt.
#
# In der CI stimmt diese Begründung **nicht**. Hier sieht niemand den Namen
# unterm Icon; das fertige Bündel geht direkt zu TestFlight. Eine vergessene
# Variable ergäbe eine App, die außen wie die richtige aussieht und innen mit
# dem falschen Server spricht — genau der Fall aus CLAUDE.md, Falle 6, nur
# ohne den Menschen, der ihn bemerkt.
#
# Deshalb hier kein Vorgabewert, sondern ein Abbruch. Die Variable gehört in
# die Workflow-Umgebung in App Store Connect, einmal je Workflow.
if [ -z "$EXPO_PUBLIC_APP_UMGEBUNG" ]; then
  echo "FEHLER: EXPO_PUBLIC_APP_UMGEBUNG ist nicht gesetzt." >&2
  echo "" >&2
  echo "In App Store Connect am Workflow eintragen: 'dev' oder 'prod'." >&2
  echo "Ohne die Angabe würde eine App entstehen, die außen richtig heißt" >&2
  echo "und innen mit dem Prüfserver spricht. Siehe CLAUDE.md, Falle 6." >&2
  exit 1
fi
echo "Umgebung: $EXPO_PUBLIC_APP_UMGEBUNG"

echo "--- Abhängigkeiten ---"
# `npm ci` und nicht `npm install`: Gebaut wird genau das, was in
# `package-lock.json` steht. Alles andere hieße, dass zwei Läufe desselben
# Commits verschiedene Apps ergeben können.
npm ci

echo "--- ios/ erzeugen ---"
# `--no-install`, weil `prebuild` sonst zusätzlich den Paketmanager
# anwirft und das gerade festgezurrte `node_modules` neu auflöst. Die Pods
# kommen gleich darunter, getrennt und sichtbar.
#
# `--clean`: Auf einem frisch geklonten Arbeitsverzeichnis ist ohnehin kein
# `ios/` da — die Angabe kostet nichts und schützt davor, dass ein
# zwischengespeichertes Verzeichnis überlebt und stillschweigend eine alte
# Bündelkennung mitbringt.
npx expo prebuild --platform ios --no-install --clean

echo "--- Pods ---"
cd ios
pod install
cd ..

echo "--- Fertig ---"
# Der Name hängt an `expo.name` in `app.config.js` und ändert sich mit ihm:
# aus „MTB BI (dev)" wird `MTBBIdev`. Deshalb hier ausgeben statt
# behaupten — wer das Schema im Workflow einträgt, liest es hier ab.
ls -d ios/*.xcworkspace
