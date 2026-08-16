---
name: foto-upload-defekt
description: "Foto- und Avatar-Upload scheitert auf dem Gerät vor dem Senden; Ursache am 16.08.2026 noch offen, Netzweg beweisbar in Ordnung"
metadata: 
  node_type: memory
  type: project
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-16T17:11:28.679Z
---

Gemeldet am 16.08.2026: „Server nicht erreichbar, keine Verbindung" —
bei Albumbildern **wie** beim Profilbild.

## Was nachgemessen ist (nicht vermutet)

- Auf dem Prüfserver kam in einer Woche **kein einziger** Upload an,
  während jede andere Anfrage derselben App ankam (`POST /jugendtraining`,
  `POST /jugendtraining/…/kinder`, `PUT …/guide`, `PATCH /verwaltung/…`,
  sogar `DELETE /avatar/…`).
- Ein Multipart-POST von Hand kommt durch:
  `curl -X POST https://api-dev.bockelbrink.net/fotoalbum/<id>/fotos -F "datei=@bild.jpg"`
  → **401**, ordentlich beantwortet. Caddy, `rate_limit` (60/min für
  `/fotoalbum*`) und `request_body max_size 25MB` sind damit unschuldig.
- `ExpoImageManipulator.framework` **liegt im gebauten Paket** (im .ipa
  nachgesehen), `NSPhotoLibraryUsageDescription` steht im Info.plist,
  ATS erlaubt HTTPS.
- `ios/` ist nicht versioniert, EAS macht also ein frisches `prebuild` —
  kein fehlender Pod.

**Schluss:** Die Anfrage verlässt das Telefon nie. Der Fehler passiert
vor dem Senden, also in `ImagePicker` → `ImageManipulator` → FormData.

## Warum es so lange unauffindbar war

`beschreibeJugendFehler` beantwortete **jeden** Fehler, der kein
`ApiFehler` war, mit „Der Verein ist gerade nicht erreichbar." Damit
zeigte die App aufs Netz, während der Fehler auf dem Gerät lag.

Seit 0.11.3+ (Commit 610e3c5): Auffangzweig sagt „Da ist etwas
schiefgegangen.", und `src/features/fotos/uploadFehler.ts` unterscheidet
**vorbereiten** (Gerät) von **senden** (Netz) und gibt den technischen
Text des Geräts mit.

## Was fehlt

Der Wortlaut der echten Ausnahme vom Gerät. **Von diesem Rechner aus
nicht reproduzierbar** — der lokale Simulator-Bau scheitert am
`resource fork … detritus`-Signaturfehler, siehe
[[testflight-und-eas]]. Nächster Schritt: Marco lädt ein Bild hoch und
liest die neue Meldung vor.

**Why:** Ohne diese Messungen fängt jede Untersuchung wieder beim Netz
an — dort ist nachweislich nichts. Und die Erfahrung dahinter gilt über
diesen Fehler hinaus: Ein Auffangbecken, das jeden unbekannten Fehler in
eine konkrete Behauptung übersetzt, macht aus einem lösbaren Problem ein
unauffindbares.

**How to apply:** Zuerst nach der Meldung fragen, die jetzt erscheint.
Steht dort „Das Bild ließ sich auf dem Gerät nicht vorbereiten: …", ist
es die Bildverarbeitung; steht dort „…nicht senden: …", ist es fetch.
Verwandt: [[mtb-server-offene-punkte]], [[lokal-gruen-ist-nicht-ci-gruen]]
