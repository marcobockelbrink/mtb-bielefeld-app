# Bauen mit Xcode Cloud

Zweiter Bauweg neben EAS, eingerichtet am 16.08.2026. Der Anlass war
schlicht: **EAS-Builds sind kontingentiert**, im August waren es vierzehn,
allein an einem Tag vier. Xcode Cloud ist im Apple-Entwicklerprogramm
enthalten, das der Verein ohnehin bezahlt — 25 Rechenstunden im Monat, bei
grob einer Viertelstunde je Bau also weit mehr als hier gebraucht wird.

**EAS bleibt bestehen.** Die beiden Wege schließen sich nicht aus, und einen
funktionierenden Bauweg wirft man nicht weg, bevor der neue etwas bewiesen
hat.

## Was im Repository dafür steht

Genau eine Datei: `ci_scripts/ci_post_clone.sh`. Xcode Cloud führt sie nach
dem Klonen aus; sie muss so heißen und ausführbar sein (`chmod +x`, und das
Bit muss in Git stehen — `git ls-files -s` zeigt `100755`).

Sie tut vier Dinge:

1. **Node und CocoaPods nachinstallieren.** Die Abbilder bringen Homebrew
   mit, aber weder das eine noch das andere.
2. **Abbrechen, wenn `EXPO_PUBLIC_APP_UMGEBUNG` fehlt.** Dazu unten mehr —
   das ist die wichtigste Zeile.
3. `npm ci` und `npx expo prebuild --platform ios --no-install --clean`,
   also `ios/` aus `app.config.js` erzeugen. Der Ordner ist bewusst nicht
   versioniert (CLAUDE.md, Falle 6): Eine eingecheckte Kopie liefe
   unweigerlich auseinander.
4. `pod install`. **Xcode Cloud löst von selbst nur Swift Packages auf**,
   CocoaPods nicht. Ohne diesen Schritt findet `xcodebuild` das Workspace,
   aber keinen Pod, und scheitert mit Meldungen über fehlende Header, die
   auf alles zeigen außer auf die Ursache.

## Was von Hand einzurichten ist

Das geht nur in Xcode oder App Store Connect, nicht aus dem Repository
heraus.

1. In Xcode das **Workspace** öffnen — `ios/MTBBIdev.xcworkspace`, nicht
   die `.xcodeproj`; ohne die Pods fehlt die Hälfte. Dann
   **Integrate ▸ Create Workflow…**

   **Nicht unter `Product`.** Seit Xcode 14 hat Xcode Cloud ein eigenes
   Menü namens `Integrate`. Ältere Anleitungen im Netz — und die erste
   Fassung dieser hier — nennen den alten Ort; genau darüber ist Marco am
   16.08.2026 gestolpert. Taucht `Integrate` gar nicht auf, ist kein
   Projekt geöffnet: Das Menü erscheint erst mit einem offenen Workspace.

   Außerdem nötig: in Xcode unter **Settings ▸ Accounts** mit der Apple-ID
   angemeldet, und im Team die Rolle *Account Holder*, *Admin* oder
   *App Manager*. Bei einem Einzelkonto trifft das von selbst zu.

   `ios/` entsteht erst durch `npx expo prebuild --platform ios` gefolgt
   von `cd ios && pod install` — also dasselbe, was das CI-Skript tut. Auf
   einem frischen Klon ist der Ordner nicht da.
2. Als Quelle das GitHub-Repository wählen und Apple den Zugriff geben.
3. **Environment ▸ Environment Variables:** `EXPO_PUBLIC_APP_UMGEBUNG`
   auf `dev` setzen. Für einen Vereinsbau später ein **zweiter Workflow**
   mit `prod` — nicht denselben umstellen, sonst baut irgendwann jemand
   versehentlich prod aus einem dev-Branch.
4. **Post-Actions ▸ TestFlight (Internal Testing).** Damit entfällt das
   getrennte Hochladen; Xcode Cloud reicht den Bau selbst weiter.
5. Start Conditions nach Geschmack. **Nicht** auf „bei jedem Push"
   stellen — das ist genau die Verschwendung, die wir loswerden wollten.
   Manuell starten oder an einen Tag-Push hängen.

## Zwei Fallen, die nirgends auffallen

### Die Umgebungsvariable steht bei Apple, nicht im Quelltext

`app.config.js` lässt jeden unbekannten Wert absichtlich als `dev` gelten.
Auf einem Rechner ist das die harmlose Richtung: Ein versehentlicher
dev-Bau fällt sofort auf, weil die App „MTB BI (dev)" heißt.

**In der CI stimmt diese Begründung nicht.** Dort sieht niemand den Namen
unterm Icon, und das Bündel geht direkt zu TestFlight. Eine vergessene
Variable ergäbe eine App, die außen wie die richtige aussieht und innen mit
dem Prüfserver spricht.

Deshalb bricht `ci_post_clone.sh` ohne die Variable ab, statt eine Vorgabe
zu nehmen. Der erste Bau nach dem Einrichten **muss** scheitern, solange
Schritt 3 oben nicht gemacht ist — das ist kein Fehler, sondern der Zweck.

Die unangenehme Seite davon: Diese Einstellung liegt bei Apple und ist im
Repository nicht zu sehen. Wer prüfen will, was ein Workflow baut, muss in
App Store Connect nachsehen.

### Der Schemaname hängt am App-Namen

`expo prebuild` leitet den Projektnamen aus `expo.name` ab. Aus
„MTB BI (dev)" wird `MTBBIdev`, aus „MTB Bielefeld" `MTBBielefeld`. Der
Workflow merkt sich Workspace-Pfad und Schema — **ändert jemand den
Anzeigenamen der App, bricht der Workflow**, und die Meldung nennt nur ein
nicht gefundenes Schema.

Der lokale Ordner `ios/` kann davon abweichen, wenn er älter ist: Hier lag
bis zuletzt `MTBBielefelddev.xcworkspace` aus der Zeit vor der Umbenennung.
Was wirklich gebaut wird, steht am Ende des Skript-Protokolls (`ls -d
ios/*.xcworkspace`) — dort ablesen, nicht im lokalen Ordner.

## Wenn es nicht anläuft

**„Kein Projekt gefunden" beim Anlegen des Workflows.** Xcode Cloud sucht
beim Einrichten im geklonten Stand nach einem Projekt, und `ios/` entsteht
erst durch das Skript. Wenn Apple sich querstellt: einmalig `ios/` in einen
Zweig committen, den Workflow darauf anlegen und den Zweig danach wieder
verwerfen — die Konfiguration bleibt.

**Der Bau läuft, aber die App zeigt auf den falschen Server.** Dann fehlte
die Variable, und irgendjemand hat den Abbruch aus dem Skript genommen.
Prüfen lässt es sich von außen: `npm run rauchprobe` gegen die installierte
Fassung, oder schlicht der Name unterm Icon.

## Der Vergleich

| | EAS Build | Xcode Cloud |
| --- | --- | --- |
| Kosten | eigenes Kontingent, knapp | im Entwicklerprogramm enthalten |
| Signierung | EAS verwaltet Zertifikate | Apple, automatisch |
| Umgebung | in `eas.json`, im Repository sichtbar | bei Apple, im Repository unsichtbar |
| `ios/` | erzeugt es selbst | erzeugt `ci_post_clone.sh` |
| TestFlight | `--auto-submit` | Post-Action |

Der einzige echte Nachteil steht in der dritten Zeile.
