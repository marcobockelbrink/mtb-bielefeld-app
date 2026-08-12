# Fotoalben

Fotos von Vereinsveranstaltungen einsammeln, sichten und weiterverwenden —
ohne Google Fotos.

## Warum

Bisher landen die Bilder eines Events in einem geteilten Google-Fotos-Ordner.
Das funktioniert und ist bequem, hat aber zwei Haken, die mit der Zeit größer
werden statt kleiner: Die Bilder liegen bei einem Anbieter, dem der Verein
dafür nichts erlaubt hat, und der Ordner ist ein Link — wer ihn hat, ist
drin, für immer und ohne dass jemand nachhält, wer das ist.

Der Verein hat inzwischen eine eigene App mit Konten, Rollen und einem
Server. Damit ist die Sammelstelle keine große neue Sache mehr, sondern eine
Schicht über dem, was schon steht.

**Nebenbei entsteht etwas, das Google Fotos nie war:** ein nach Terminen
sortiertes Vereinsarchiv. Wer in zwei Jahren das Bild vom MittwochsRudel im
Regen sucht, sucht es über den Termin und nicht in siebzehn Ordnern.

## Was es wird

Ein Album je Veranstaltung. Mitglieder laden hoch, die Verwaltung sichtet,
Freigegebenes wird sichtbar. Der Admin nimmt sich, was er für die Homepage
braucht.

**Fotos werden überall gesammelt**, nicht nur bei der Jugend: Training,
Sommer-Biketour, Rennen, bei denen der Verein antritt. Die Terminarten der
App (Tour, Fahrtechnik, Treff, Ausflug, Werkstatt, Jugend, Racing, Verein)
bekommen alle dieselbe Behandlung.

## Entscheidungen, die schon getroffen sind

| Frage | Entscheidung |
| --- | --- |
| Umfang | alle Terminarten, nicht nur Jugend |
| Album ohne Termin | **muss es geben** — Rennen stehen oft nicht im Vereinskalender |
| Wer legt an | Guide und Verwaltung; bei Terminen entsteht das Album von selbst |
| Wer lädt hoch | jedes angemeldete Mitglied |
| Wer sichtet | Verwaltung |
| Sichtbarkeit nach Freigabe | **ein Feld je Album**, `mitglieder` oder `jugend` |
| Löschen | die Verwaltung kann **jedes** Bild jederzeit löschen |
| Bildrechte | mit den Eltern geklärt; die App verlässt sich nicht darauf |
| Automatisches Löschen | Feld wird mitgebaut, der Job kommt später |

**Zur Sichtbarkeit:** Ob freigegebene Bilder allen Mitgliedern oder nur der
Jugend gezeigt werden, ist eine Vereinsentscheidung und noch nicht gefallen.
Deshalb ist sie eine Auswahl am Album und keine Annahme im Quelltext. Fällt
der Beschluss anders aus als gedacht, ändert sich ein Dropdown, kein Code.

## Bewusst nicht

- **Videos.** Andere Größenordnung, andere Umwandlung. Wenn der Vereinsserver
  steht und Platz hat, gern — vorher nicht.
- **Gesichtserkennung oder automatisches Verpixeln.** Löst kein Problem, das
  der Verein hat, und schafft ein neues: biometrische Daten.
- **Kommentare, Likes, Benachrichtigungen bei neuen Bildern.** Das wäre der
  Anfang einer Social-App. Die will hier niemand.
- **Öffentliche Album-Links.** Genau das Loch, das der Weggang von Google
  Fotos zumacht. Bilder gibt es nur für angemeldete Mitglieder.
- **Bilder über Caddy statisch ausliefern.** Verlockend und falsch: Die
  Sichtbarkeit hängt an Rolle und Album, das kann nur die API entscheiden.
  Ein statischer Pfad wäre ein Link, der wieder für jeden gilt.

## Das Datenmodell

Zwei Tabellen. Die Dateien liegen **nicht** in der Datenbank, sondern auf
einem Docker-Volume; in Postgres steht, was sie bedeuten.

```
fotoalbum            titel, beschreibung, ereignis_am,
                     termin_schluessel (optional), sichtbarkeit,
                     zustand (offen|geschlossen), hochladen_bis, titelbild

foto                 album_id, hochgeladen_von, aufgenommen_am,
                     zustand (neu|freigegeben|abgelehnt), fuer_homepage,
                     pruefsumme, bytes, breite, hoehe, loeschen_ab
```

**Drei Fassungen je Bild**, weil eine nicht reicht:

| Fassung | Wofür | Größe |
| --- | --- | --- |
| `vorschau` | das Raster in der Albumansicht | 400 px lange Kante |
| `anzeige` | Vollbild in der App | 2000 px lange Kante |
| `original` | Download durch die Verwaltung | unverändert |

Ohne die Vorschau lädt ein Album mit 120 Bildern 120 Vollbilder. Ohne das
Original ist die Homepage-Verwendung wertlos.

**`pruefsumme` ist nicht Zierde.** Bei einem Event laden drei Leute dieselben
Bilder aus derselben WhatsApp-Gruppe hoch. Ein `UNIQUE (album_id,
pruefsumme)` macht daraus stillschweigend eines.

## Zwei Fallen, die früh entschieden werden müssen

**HEIC.** iPhones liefern HEIC, und das kann außerhalb von Apple fast nichts
— keine Vereinsseite, kein Windows-Bildbetrachter. Umwandeln muss also
jemand. **Die App macht es, nicht der Server:** `expo-image-manipulator`
liefert JPEG, und damit ist der Server frei von `libheif`, das im
Alpine-Abbild nicht mitkommt. Nebenbei wandert weniger über die Leitung —
bei Uploads aus dem Wald zählt das.

**EXIF strippen dreht Bilder.** Die Ausrichtung steht im EXIF; wer es
entfernt, ohne sie vorher ins Bild zu rechnen, bekommt Hochformat-Aufnahmen,
die auf der Seite liegen. Die Reihenfolge ist deshalb festgelegt:
**Aufnahmezeit auslesen → drehen → verkleinern → Metadaten weg.** In dieser
Reihenfolge, sonst ist entweder das Datum verloren oder das Bild gekippt.

Und der Grund, warum das überhaupt sein muss: Handyfotos tragen
GPS-Koordinaten. Ein Bild vom Jugendtraining verrät sonst auf den Meter, wo
sich regelmäßig Kinder aufhalten.

## Dateien

- **Neu** `api/src/migrationen/013-fotoalben.sql`
- **Neu** `api/src/fotoalbum.ts` — Rechenlogik, kein Fastify
- **Neu** `api/src/bildablage.ts` — Dateien schreiben, lesen, löschen
- **Neu** `api/src/bildverarbeitung.ts` — drehen, verkleinern, strippen
- **Ändern** `api/src/app.ts` — Endpunkte, Ratenbegrenzung
- **Ändern** `api/src/aufraeumen.ts` — fünfter Zähler, vorbereitet
- **Neu** `api/tests/fotoalbum.test.ts`, `api/tests/fotoalbum-endpunkte.test.ts`
- **Neu** `src/data/fotos.ts` — Abruf und Upload aus der App
- **Neu** `src/features/fotos/` — `AlbumKarte.tsx`, `FotoRaster.tsx`,
  `FotoHochladen.tsx`, `Sichtung.tsx`
- **Neu** `app/fotos/index.tsx`, `app/fotos/[id].tsx`
- **Ändern** `betrieb/Caddyfile` — Zone `fotoupload`, Größengrenze
- **Ändern** `betrieb/docker-compose.yml` — Volume `betrieb-fotos`

**Kein neuer Reiter.** Die Leiste fasst vier Einträge; mit einem fünften
steht dort „EINSTELLUN…", auf einem Gerät nachgemessen. Der Einstieg ist
deshalb ein Abschnitt **im Termin** („Fotos vom 12. Juli — 43 Bilder") plus
eine Albumübersicht unter *Verein*. Das ist ohnehin der bessere Weg: Man
sucht Fotos über das Ereignis, nicht über eine Liste von Alben.

---

## Aufgabe 1: Datenbank und Rechenlogik

**Dateien:** `api/src/migrationen/013-fotoalben.sql`, `api/src/fotoalbum.ts`,
`api/tests/fotoalbum.test.ts`

- [ ] **Schritt 1: Die Migration**

Zwei Tabellen wie oben. Dieselben Bedingungen wie bei `jugendtraining`: ein
Zustand ohne seinen Zeitstempel ist ein halber Zustand, also
`CHECK (zustand <> 'freigegeben' OR entschieden_am IS NOT NULL)`.

Dazu `UNIQUE (album_id, pruefsumme)` gegen Doppelte und ein Index auf
`(album_id, zustand)`, weil die Sichtung genau danach filtert.

- [ ] **Schritt 2: Tests für die Rechenlogik — vor dem Code**

Was `fotoalbum.ts` können muss, ohne Datenbank und ohne Fastify:

- `darfSehen(rolle, album, foto)` — die eine Funktion, an der die ganze
  Sichtbarkeit hängt. Vier Fälle: eigenes Bild im Zustand `neu` (ja),
  fremdes Bild im Zustand `neu` (nein, außer Verwaltung), `freigegeben` bei
  `sichtbarkeit = 'mitglieder'` (ja für alle), `freigegeben` bei
  `sichtbarkeit = 'jugend'` (nur Jugend-Rollen).
- `darfHochladen(album, jetzt)` — Zustand `offen` **und** innerhalb von
  `hochladen_bis`.
- `darfLoeschen(rolle, foto, mitgliedId)` — Verwaltung immer; der
  Hochladende nur solange `neu`.

Diese drei sind der Kern. Alles andere ist Transport.

- [ ] **Schritt 3: Laufen lassen — muss scheitern**

- [ ] **Schritt 4: `fotoalbum.ts` schreiben**

Rein rechnende Funktionen oben, Datenbankzugriffe darunter — dasselbe Muster
wie `jugendtraining.ts`.

- [ ] **Schritt 5: Prüfen und committen**

```bash
npm test && npm run typecheck
```

---

## Aufgabe 2: Ablage und Bildverarbeitung

**Dateien:** `api/src/bildablage.ts`, `api/src/bildverarbeitung.ts`,
`betrieb/docker-compose.yml`

- [ ] **Schritt 1: Das Volume**

`betrieb-fotos` neben `betrieb-postgres`, im API-Container unter `/fotos`.
Pfadmuster `/fotos/<album-id>/<foto-id>-<fassung>.webp` — Kennungen als
Dateinamen, **keine sprechenden**. `IMG_4711.jpg` aus einer fremden Kamera
verrät mehr, als man denkt.

- [ ] **Schritt 2: Tests für die Verarbeitung**

Ein Testbild mit bekannter EXIF-Ausrichtung und bekannten GPS-Koordinaten.
Nach der Verarbeitung muss gelten: Ausrichtung stimmt, GPS ist **weg**,
Aufnahmezeit ist **erhalten** (in der Datenbank, nicht in der Datei), lange
Kante passt.

Der GPS-Test ist der wichtigste. Er ist auch der einzige, der stumm
durchfällt, wenn jemand die Reihenfolge der Schritte ändert.

- [ ] **Schritt 3: `bildverarbeitung.ts` schreiben**

`sharp`, in der Reihenfolge: Aufnahmezeit lesen → `rotate()` →
`resize()` → Metadaten fallen lassen. Drei Fassungen in einem Durchlauf.

- [ ] **Schritt 4: Grenzen setzen**

Dateigröße, Bildmaße, Anzahl je Mitglied und Album. Was keine Grenze hat,
findet irgendwann jemand.

- [ ] **Schritt 5: Prüfen und committen**

---

## Aufgabe 3: Die Endpunkte

**Dateien:** `api/src/app.ts`, `api/tests/fotoalbum-endpunkte.test.ts`,
`betrieb/Caddyfile`

- [ ] **Schritt 1: Tests für die Endpunkte — vor dem Code**

```
POST   /fotoalbum                  anlegen            guide | verwaltung
GET    /fotoalbum                  Liste              angemeldet
GET    /fotoalbum/:id              Detail mit Fotos   angemeldet
PATCH  /fotoalbum/:id              ändern             guide | verwaltung
POST   /fotoalbum/:id/fotos        hochladen          angemeldet
GET    /foto/:id/:fassung          ausliefern         je nach darfSehen
PATCH  /foto/:id                   freigeben/ablehnen verwaltung
DELETE /foto/:id                   löschen            verwaltung | eigenes
POST   /foto/:id/melden            melden             angemeldet
```

**Der wichtigste Test ist der, der fehlschlagen soll:** Ein Mitglied ruft
`GET /foto/<fremde-id>/anzeige` für ein Bild im Zustand `neu` auf und bekommt
404 — nicht 403. Ein 403 verrät, dass es das Bild gibt.

- [ ] **Schritt 2: Endpunkte schreiben**

- [ ] **Schritt 3: Caddy**

Eigene Zone `fotoupload` — großzügiger als `anmeldung`, weil ein Mitglied
nach einem Event dreißig Bilder in Folge schickt, und das ist der Normalfall,
keine Flut. Dazu `request_body max_size`.

- [ ] **Schritt 4: Prüfen und committen**

---

## Aufgabe 4: Die App — ansehen

**Dateien:** `src/data/fotos.ts`, `src/features/fotos/AlbumKarte.tsx`,
`src/features/fotos/FotoRaster.tsx`, `app/fotos/index.tsx`,
`app/fotos/[id].tsx`

- [ ] **Schritt 1: Albumübersicht unter *Verein***

- [ ] **Schritt 2: Das Raster**

Vorschaubilder, nach `aufgenommen_am` sortiert und nach Tagen gruppiert.
Bei einer Sommer-Biketour über sieben Tage entsteht daraus von selbst der
Ablauf der Woche.

- [ ] **Schritt 3: Abschnitt im Termin**

„Fotos vom 12. Juli — 43 Bilder", führt ins Album.

- [ ] **Schritt 4: Prüfen und committen**

```bash
npm test && npm run typecheck && npm run vorschau
```

`npm run vorschau` ist hier nicht optional: Ein Raster, das im Test grün ist
und in der Anzeige zusammenfällt, ist genau die Falle Nummer 2 aus
`CLAUDE.md`.

---

## Aufgabe 5: Die App — hochladen

**Dateien:** `src/features/fotos/FotoHochladen.tsx`, `src/data/fotos.ts`

- [ ] **Schritt 1: Auswahl und Umwandlung**

`expo-image-picker` mit Mehrfachauswahl, danach
`expo-image-manipulator`: nach JPEG wandeln und auf 2400 px verkleinern,
**bevor** etwas über die Leitung geht.

- [ ] **Schritt 2: Die Warteschlange**

Bei euren Events steht man im Wald. Ein Upload, der scheitert und nichts
sagt, ist ein Upload, den niemand wiederholt. Die App merkt sich offene
Uploads und schickt sie nach, wenn wieder Netz da ist — dasselbe Muster wie
bei den Erinnerungen: Logik getrennt von der Systemanbindung, damit sie ohne
Gerät prüfbar bleibt.

- [ ] **Schritt 3: Der Einwilligungssatz**

Beim ersten Upload, kein vorangekreuztes Kästchen, im Ton von
`app.ts:659`. Er muss **zwei** Dinge abdecken:

> Ich habe die Bilder selbst aufgenommen, und die abgebildeten Personen sind
> mit der Verwendung im Verein einverstanden.

Das erste ist kein Formalismus: Bei Rennen fotografieren bezahlte
Fotografen, und deren Bilder kursieren danach in jeder WhatsApp-Gruppe. Ein
solches Bild auf der Vereinsseite ist Ärger anderer Art als ein
Persönlichkeitsrecht — aber Ärger.

- [ ] **Schritt 4: Eigene Uploads sofort zeigen**

Sonst lädt jemand zehn Bilder hoch, sieht nichts und lädt sie noch einmal.

- [ ] **Schritt 5: Prüfen und committen**

---

## Aufgabe 6: Sichten und weiterverwenden

**Dateien:** `src/features/fotos/Sichtung.tsx`

- [ ] **Schritt 1: Die Sichtungsansicht**

Raster mit Mehrfachauswahl, **Stapelverarbeitung statt Bild für Bild**. Bei
120 Fotos vom Vereinsfest entscheidet genau das, ob das Feature benutzt wird
oder verstaubt.

- [ ] **Schritt 2: Markierung „für die Homepage"**

Neben der Freigabe. Das sind die Bilder, die wirklich weiterverwendet werden
— und die vom späteren automatischen Löschen ausgenommen bleiben.

- [ ] ~~**Schritt 3: Download**~~ — **gestrichen am 12.08.2026.** Ein ZIP
  aus JPEGs spart fast nichts, die sind schon komprimiert. Die Verwaltung
  holt die volle Auflösung je Bild über `GET /foto/:id/original`.

- [ ] **Schritt 4: Löschen und Melden**

Die Verwaltung löscht jedes Bild, jederzeit, ohne Begründungszwang. Für
Mitglieder ein Melden-Knopf — „bitte nehmt das raus" gehört in die App und
nicht in eine WhatsApp-Gruppe.

- [ ] **Schritt 5: Prüfen und committen**

---

## Offen — Stand 12.08.2026

Gebaut und auf dem Prüfserver in Betrieb: Aufgaben 1–6 samt persistenter
Upload-Warteschlange. Es bleibt:

- **Das automatische Löschen nach 31 Tagen.** Das Feld `loeschen_ab` ist da,
  der Job in `aufraeumen.ts` kommt später. Wichtig ist nur, dass
  `fuer_homepage` davon ausgenommen bleibt — sonst ist die Auswahl nach
  einem Monat weg, und das wäre die unangenehmste Art, das zu lernen.
- **Wohin die freigegebenen Bilder danach gehen.** Bis auf Weiteres: Der
  Admin lädt sie herunter (`GET /foto/:id/original`) und stellt sie selbst
  auf die Vereinsseite. Eine Anbindung an die Homepage ist ein eigenes
  Vorhaben. Der ZIP-Sammeldownload ist gestrichen, siehe Aufgabe 6.
- **Eine Vollbild-Ansicht in der App.** Das Raster zeigt die 400er; die
  2000er-Fassung liefert die API längst, es fehlt nur der Bildschirm dazu.
- **Speicherplatz.** Der Prüfserver hat 38 GB. Für die Erprobung reicht das;
  der Vereinsserver soll mehr bekommen.
