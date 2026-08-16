---
name: repo-liegt-in-projekte
description: "Das Repository liegt seit 16.08.2026 in ~/Projekte/mtb, nicht mehr in ~/Documents — iCloud synchronisierte dort mit"
metadata:
  type: project
---

**`~/Projekte/mtb`**, seit dem 16.08.2026. Vorher `~/Documents/mtb`.

## Warum

`~/Documents` ist auf diesem Mac iCloud-synchronisiert („Schreibtisch &
Dokumente"; nachprüfbar daran, dass
`~/Library/Mobile Documents/com~apple~CloudDocs/Documents` existiert).
Damit lief ein Synchronisierungsdienst über ein Git-Verzeichnis und über
`node_modules` — zehntausende Dateien, die nach jedem `npm ci` neu
hochgeladen wurden.

Zwei Störungen, die dazu passen:

- **Der lokale iOS-Bau scheitert** an
  `ExpoModulesJSI.framework: resource fork, Finder information, or
  similar detritus not allowed`. Am Framework hängen `com.apple.FinderInfo`
  und `com.apple.fileprovider.fpfs#P` — Letzteres setzt ein
  File-Provider-Dienst. `xattr -cr` hilft nicht: Das Framework entsteht bei
  jedem Bau neu und trägt die Attribute sofort wieder.
- **Kaputte Git-Referenzen** `refs/heads/main 2` und
  `refs/remotes/origin/main 2`, die jedes `git pull` mit „bad object"
  abbrachen — siehe [[git-refs-duplikate-macos]]. Dateien mit angehängter
  „ 2" sind die Signatur eines Synchronisierungskonflikts.

**Bewiesen ist der Zusammenhang nicht.** Eine Gegenprobe mit je einer
frischen Datei in `~/Documents` und in `~/` zeigte an beiden Orten *keine*
Attribute; das Attribut trifft offenbar nur Dateien, die der Dienst
angefasst hat. Ob der lokale Bau nach dem Umzug durchläuft, ist **noch
nicht nachgemessen**.

## Was der Umzug nach sich zog

- Die Gedächtnis-Verknüpfung heißt jetzt
  `~/.claude/projects/-Users-marco-Projekte-mtb/memory` und zeigt auf
  `.claude/memory` im Repository. Die alte, tote Verknüpfung unter
  `-Users-marco-Documents-mtb` ist entfernt; das Verzeichnis dort hält nur
  noch Sitzungsprotokolle.
- Sonst nichts: keine fest verdrahteten Pfade im Repository, `origin` und
  der SSH-Zugang unverändert, 424 Tests und die Typprüfung am neuen Ort
  grün.
- Verschoben mit `mv` auf demselben Dateisystem — ein Umbenennen in
  Sekundenbruchteilen, `node_modules` wurde nicht kopiert.

**Why:** Ein Pfad, der in keiner Datei steht, aber in jeder Anweisung
gebraucht wird. Und die Vorgeschichte erklärt zwei Fehlerbilder, die sonst
wieder von vorn untersucht würden.

**How to apply:** Alle Pfadangaben in Anweisungen an Marco auf
`~/Projekte/mtb` beziehen. Taucht der Signaturfehler beim lokalen Bau
erneut auf, ist er **nicht** mehr mit iCloud erklärbar — dann neu suchen.
Verwandt: [[git-refs-duplikate-macos]], [[testflight-und-eas]]
