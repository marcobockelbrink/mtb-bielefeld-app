---
name: ios-geraetebau-push-berechtigung
description: "Bau aufs iPhone scheitert am kostenlosen Apple-Team, solange aps-environment in den Entitlements steht"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-02T17:51:20.465Z
---

`npx expo run:ios --device` bricht mit einem kostenlosen Apple Personal Team ab:

    Personal development teams do not support the Push Notifications capability.

Abhilfe für den Testbau: in `ios/MTBBielefeld/MTBBielefeld.entitlements` den
Schlüssel `aps-environment` entfernen, dann mit `xcodebuild ...
-allowProvisioningUpdates -allowProvisioningDeviceRegistration
DEVELOPMENT_TEAM=DH3N3RBQX3` bauen. Expo reicht `-allowProvisioningUpdates`
nicht durch, ohne das Flag entsteht kein Profil.

**Why:** Das `expo-notifications`-Plugin setzt `aps-environment` automatisch,
obwohl die App **nirgends Remote-Push benutzt** — Erinnerungen entstehen lokal
auf dem Gerät (siehe HINWEISE.md). Die Berechtigung ist also schlicht
überflüssig, blockiert aber jeden Bau ohne bezahlten Entwicklerzugang und führt
im App Store zu Rückfragen.

**How to apply:** Die Änderung an `ios/` ist Wegwerf-Material — das Verzeichnis
steht in `.gitignore` und wird bei jedem `prebuild` neu erzeugt, die
Berechtigung ist danach wieder da. Dauerhaft gehört ein kleines Config-Plugin
ins Projekt, das `aps-environment` nach `expo-notifications` wieder entfernt.
Das ist noch nicht gebaut.
