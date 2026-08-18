---
name: foto-upload-defekt
description: "Der Foto- und Avatar-Upload war eine Woche kaputt — gelöst am 18.08.2026; hier steht, was die Untersuchung gekostet hat"
metadata:
  type: project
---

**Gelöst am 18.08.2026 in Fassung 0.11.8.** Die Ursache und der Weg, der
trägt, stehen in [[expo-fetch-kennt-kein-uri-formdata]] — kurz: Expos
eigenes `fetch` kennt das `{uri, name, type}`-Idiom nicht mehr, der
Multipart-Körper scheiterte schon beim Bauen.

Dieser Eintrag bleibt für das, was die Untersuchung gelehrt hat.

## Die Meldung war der Fehler

`beschreibeJugendFehler` beantwortete **jeden** Fehler, der kein
`ApiFehler` war, mit „Der Verein ist gerade nicht erreichbar." Und der
`catch` um `fetch` setzte `ohneNetz: true` für jeden geworfenen Fehler,
ohne zu prüfen, ob überhaupt kein Netz da war. Die App zeigte „Kein Netz"
auf einem Telefon mit vollem 5G — und niemand kam darauf, woanders als im
Netz zu suchen.

**Ein Auffangbecken, das jeden unbekannten Fehler in eine konkrete
Behauptung übersetzt, macht aus einem lösbaren Problem ein
unauffindbares.** Das ist die teuerste Lehre der Woche.

Seither: `ApiFehler.ursprung` hebt den Originaltext auf, `useVerbunden()`
misst den Netzzustand wirklich (mit `NetInfo.fetch()`, nicht nur dem
Listener — der meldet sich erst bei einer *Änderung*), und der
Verbindungshinweis erscheint nur bei **gemessener** Offline-Lage.

## Was das Ausschließen gebracht hat

Nichts davon war die Ursache, aber alles davon ist jetzt geprüft und muss
nie wieder untersucht werden: Netzweg (Multipart-POST von Hand kommt
durch), Caddy, `rate_limit`, `request_body max_size`, das native
Bildmodul im gebauten Paket, `NSPhotoLibraryUsageDescription`, ATS, und
die Adresse aus `saveAsync` (eine saubere
`file:///…/Caches/ImageManipulator/<uuid>.jpeg`).

## Zwei eigene Fehler dabei

- **Eine Endlosschleife**: `stapelHochladen` rief am Ende `laden()`, und
  `laden()` stieß die Schlange wieder an. Bei jedem Fehlschlag drehte das
  im Sekundentakt, und das Kreuz zum Abwählen war nicht zu treffen.
- **Ein wirkungsloser erster Fix**: Die ehrliche Meldung hing an
  `verbunden === true`, und der Wert blieb `null`, weil NetInfo sich nur
  bei Änderungen meldet. Marco sah zweimal dieselbe falsche Meldung,
  obwohl „behoben" im Commit stand.

## Noch aufzuräumen

`POST /diagnose` (API) und `src/data/diagnose.ts` waren eine Behelfsbrücke,
damit das Gerät den Fehlertext selbst meldet. **Sie gehören wieder raus**,
sobald Marco den funktionierenden Upload bestätigt hat.

**Why:** Damit die nächste Untersuchung nicht bei null anfängt — und damit
die Lehre über die Fehlermeldungen nicht mit dem Fehler verschwindet.

**How to apply:** Bei einem neuen Upload-Problem zuerst
[[expo-fetch-kennt-kein-uri-formdata]] lesen. Und generell: Auffangbecken
dürfen sagen „ich weiß es nicht", aber nichts behaupten, was sie nicht
gemessen haben.
