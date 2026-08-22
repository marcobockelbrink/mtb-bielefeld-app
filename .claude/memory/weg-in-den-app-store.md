---
name: weg-in-den-app-store
description: Was zwischen dem laufenden Vereinsstand und einer Fassung im App Store noch fehlt — Stand 22.08.2026
metadata:
  node_type: memory
  type: project
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-22T00:00:00.000Z
---

Der Vereinsstand läuft seit dem 22.08.2026 unter `app.mtb-bielefeld.de`
([[mtb-server-offene-punkte]]). **Die App zeigt aber noch nirgends
dorthin**, und das ist keine Kleinigkeit, die man nebenbei umlegt.

## Warum keine bestehende Fassung dorthin zeigt

`waehleApiAdresse` (`src/config.ts`) entscheidet allein an
`EXPO_PUBLIC_APP_UMGEBUNG`, und **nur das genaue Wort `'prod'`** führt zum
Vereinsserver. Alle TestFlight-Fassungen bis 0.12.4 sind dev-Bauten mit der
Bündelkennung `de.mtbbielefeld.app.dev`.

Ein prod-Bau ist deshalb eine **andere App** im Sinne von Apple: eigene
Bündelkennung (`de.mtbbielefeld.app`), eigener Eintrag in App Store
Connect, eigene TestFlight-Gruppen, eigenes Icon-Set im selben Repo. Nicht
ein Schalter am bestehenden Bau.

## Was dafür zu tun ist

1. **App-Eintrag in App Store Connect** für `de.mtbbielefeld.app`. Es gibt
   dort bisher nur `de.mtbbielefeld.app.dev` (Apple-ID 6800879450).
2. **Zweiter Xcode-Cloud-Workflow**, der mit
   `EXPO_PUBLIC_APP_UMGEBUNG=prod` baut. Der bestehende Workflow „Default"
   setzt `dev`; `ci_scripts/ci_post_clone.sh` bricht ohne die Variable ab,
   das ist Absicht. Zielgruppe des Archivs auf `APP_STORE_ELIGIBLE` stellen
   — siehe [[asc-api-grenzen]], das war beim dev-Workflow die Falle.
3. **`STORE_KENNUNG`** in `src/features/version/VersionsSperre.tsx` steht
   auf `null`, solange es keine Apple-ID gibt. Der Sperrbildschirm führt
   dann auf die Suche statt auf die App. Sobald die Nummer existiert,
   gehört sie dorthin.
4. **`VEREIN_MINDEST_APP_VERSION`** bleibt leer, bis wirklich einmal etwas
   bricht. Die beiden Stände brauchen **eigene** Werte: Was auf dem
   Prüfstand seit gestern läuft, ist im Store womöglich noch nicht da.
5. **Pflichtangaben im Store**: Datenschutzerklärung (URL), Angaben zur
   Datennutzung, Screenshots. Die Screenshot-Maße kann
   `VORSCHAU_ASC=1 npm run vorschau` erzeugen.

## Was am Vereinsstand noch niemand getan hat

Dort ist **kein einziges Mitglied angelegt**. Der erste Eintrag ist eine
bewusste Entscheidung: Der Stand verschickt über denselben echten
Mailserver wie der Prüfstand, ohne Mailpit davor. Wer dort einlädt, lädt
wirklich ein.

Die erste Verwaltung entsteht wie damals beim Prüfstand — über einen
Einladungscode von Hand in der Datenbank, danach läuft alles über die
Verwaltungsansicht der App.

**Why:** Der Weg sieht nach „Schalter umlegen" aus und ist keiner. Ohne
diese Notiz wird beim nächsten Anlauf angenommen, der bestehende Workflow
könne beides.

**How to apply:** Erst wenn der Verein sagt, dass es so weit ist. Verwandt:
[[mtb-server-offene-punkte]], [[asc-api-grenzen]],
[[releases-sparsam-bauen]]
