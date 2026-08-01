# MTB Bielefeld — Vereins-App

Die App zum [MTB Bielefeld e.V.](https://mtb-bielefeld.de) für iOS und Android.
Termine, Aktuelles und Vereinsinfos — aus den Daten, die der Verein ohnehin pflegt.

## Worum es geht

Der Verein hat einen guten Kalender und eine gute Website. Was fehlt, ist die
Antwort auf die Frage, die sich vor jeder Ausfahrt stellt:

> **Was kann ich mit meinem Können in den nächsten Wochen mitfahren?**

Der Vereinskalender enthält diese Antwort bereits — sie steckt in den
Beschreibungen. Seit Jahren schreibt der Verein seine Angebote nach festem
Muster aus:

```
Euer Guide: Malte
Uhrzeit & Dauer: 10Uhr, ca. 3 Std
Abfahrtsort: Parkplatz Eisgrund
Ausdauer: ⭐/⭐⭐ ca. 22 km, 450hm, mittleres Tempo
Fahrtechnik: ⭐
Trail-Anteil: gering
Schwierigkeitsgrad: flowig
```

Die App liest das aus und macht daraus Filter. „Zeig mir alle Termine mit
höchstens zwei Sternen Fahrtechnik in den nächsten vier Wochen" ist damit eine
Frage von zwei Fingertipps — im Kalender-Abo ist sie unbeantwortbar.

## Was die App kann

- **Termine mit echten Filtern** — nach Fahrtechnik- und Ausdauer-Sternen, nach
  Art (Tour, Fahrtechnik, Treff, Ausflug, Werkstatt, Jugend, Racing, Verein),
  nach Erfahrungsstufe, nach Ladies-Only. Dazu Freitextsuche über Titel, Ort,
  Beschreibung und Guide.
- **Serientermine korrekt** — MittwochsRudel, Bike&Beer am letzten Samstag im
  Monat, Winterpausen und verschobene Einzeltermine inklusive.
- **Absagen sichtbar** — der Verein markiert sie im Titel, mal als
  `-ABGESAGT-`, mal als „(fällt witterungsbedingt leider aus!!)". Die App
  erkennt beides.
- **Erinnerungen** — das Handy meldet sich vor einem Termin und wenn ein
  vorgemerkter Termin abgesagt wird. Dafür sieht die App etwa alle drei Stunden
  im Hintergrund nach. Wann das tatsächlich geschieht, entscheidet das
  Betriebssystem: Android hält sich meist grob daran, iOS führt solche Aufträge
  oft nur in eigenen Zeitfenstern aus. Der Absage-Alarm ist deshalb ein Zusatz,
  keine Zusage — das sagt die App in den Einstellungen auch so.
- **Treffpunkt in der Karten-App** — ein Tipp, und die Navigation läuft.
- **Aktuelles** — die Beiträge der Website mit Bildern, offline lesbar.
- **Verein & Mitmachen** — Angebote, Beiträge, Mitglied werden, Kontakt.
- **Funktioniert ohne Empfang** — im Wald zählt, was auf dem Gerät liegt.

## Woher die Daten kommen

Die App fragt zwei öffentliche Quellen direkt ab:

| Quelle | Adresse |
| --- | --- |
| Termine | öffentlicher Google-Kalender „MTBie Angebote" (ICS) |
| Aktuelles | RSS-Feed von mtb-bielefeld.de |

**Es gibt keinen Server und keine laufenden Kosten.** Der Verein pflegt weiter
nur seinen Google-Kalender und seine Website — die App zieht automatisch nach.
Beide Adressen stehen in [`src/config.ts`](src/config.ts).

Wird die App größer und ein eigenes Backend sinnvoll, ist
[`src/data/repository.ts`](src/data/repository.ts) die einzige Stelle, die sich
ändert. Bildschirme, Filter und Erinnerungen bleiben unberührt.

### Datenschutz

Die App sammelt nichts. Es gibt keine Konten, keine Analyse, keine Werbung.
Erinnerungen entstehen **auf dem Gerät** — es wird kein Gerätekennzeichen an
den Verein oder an Dritte übertragen, und der Verein muss keinen Push-Dienst
betreiben. Abgerufen werden nur die beiden öffentlichen Adressen oben.

## Loslegen

Vorausgesetzt sind Node 20 oder neuer und die
[Expo-Go-App](https://expo.dev/go) auf dem Handy.

```bash
npm install
npm start          # QR-Code mit Expo Go scannen
```

Weitere Befehle:

```bash
npm test           # Tests (ohne Gerät, reines Node)
npm run typecheck  # TypeScript prüfen
npm run android    # auf Android-Gerät/Emulator starten
npm run ios        # auf iOS-Gerät/Simulator starten (macOS nötig)
```

> **Hinweis zu `npm install`:** Das Projekt enthält eine `.npmrc` mit
> `legacy-peer-deps=true`. Grund ist eine Unstimmigkeit zwischen den
> React-Versionen, die Expo SDK 57 und dessen Entwicklerwerkzeuge verlangen —
> ohne die Einstellung bricht jede Installation ab. Sobald Expo das behebt, kann
> die Datei weg.

### Veröffentlichen

Für den Weg in App Store und Play Store wird
[EAS Build](https://docs.expo.dev/build/introduction/) genutzt. Nötig sind ein
Apple-Developer-Konto (99 $/Jahr) und ein Google-Play-Konto (25 $ einmalig) —
beide sollten dem Verein gehören, nicht einer Privatperson.

## Aufbau

```
app/                     Bildschirme (expo-router: Dateiname = Adresse)
  (tabs)/index.tsx         Termine — Hauptbildschirm
  (tabs)/news.tsx          Aktuelles
  (tabs)/verein.tsx        Verein & Mitmachen
  (tabs)/einstellungen.tsx Erinnerungen
  termin/[id].tsx          Termin-Detailansicht
  news/[id].tsx            Beitrag-Detailansicht

src/
  config.ts              Adressen der Datenquellen — hier wird getauscht
  domain/types.ts        Datentypen, unabhängig von iCal und RSS
  data/
    ical/                Kalender einlesen samt Serienterminen
    rss/                 News-Feed einlesen
    parse/               Beschreibungen auswerten und einordnen
    repository.ts        Abruf + Zwischenspeicher (Umstiegspunkt für ein Backend)
  features/events/       Filter, Aufbereitung, Terminkarte
  notifications/         Erinnerungen (Planung getrennt von der System-Anbindung)
  content/club.ts        Vereinstexte — von Hand gepflegt
  ui/                    Farbschema und wiederverwendete Bausteine

tests/                   Tests, u.a. gegen echte Kalenderdaten
```

## Über die Tests

149 Tests, die ohne Gerät und ohne Netz laufen. Nennenswert:

- **Echte Daten als Prüfstein.** `tests/fixtures/kalender-auszug.ics` ist ein
  eingefrorener Auszug des Vereinskalenders — bewusst mit den kniffligen Fällen:
  einer Serie mit 22 Ausnahmeterminen und einem Einzeltermin, der verschoben
  *und* abgesagt wurde.
- **Zeitumstellung.** Ein Test prüft, dass eine Serie über den Wechsel von
  Winter- auf Sommerzeit hinweg um 19:00 Uhr Ortszeit bleibt, obwohl sich der
  Zeitpunkt in UTC um eine Stunde verschiebt. Genau hier verrechnen sich
  Kalender-Umsetzungen typischerweise.
- **Zwei echte Fehler dokumentiert.** Beide wurden beim Abgleich mit den
  Kalenderdaten gefunden und sind als Test festgehalten:
  - „Die Route, das **Profil** und der Schwierigkeitsgrad ergeben sich spontan"
    stufte 183 Termine als Könner-Termine ein — das Muster für „Profi" hatte
    keine saubere Wortgrenze.
  - „Trail-Anteil" wurde in 393 von 393 Fällen verschluckt, weil der Bindestrich
    im Beschriftungsmuster fehlte.

Bei den anderen Angaben liegt der Erfassungsgrad gemessen an den echten Daten
bei 100 % — die einzigen Ausreißer sind die Scherzeinträge der Bike&Beer-Termine
(„Ausdauer: 🌭", „Fahrtechnik: 🍺"), die korrekt keine Sternebewertung ergeben.

## Was noch offen ist

- **Auf echten Geräten testen.** Termine, Filter und Auswertung sind geprüft;
  Erinnerungen und Hintergrund-Aktualisierung sind bisher nur als Rechenlogik
  getestet, nicht auf einem Gerät. Vor der Veröffentlichung nötig. Zum Auslösen
  ohne Warten hilft `BackgroundTask.triggerTaskWorkerForTestingAsync()`.
- **App-Symbol und Startbild.** Aktuell die Expo-Platzhalter — hier gehört das
  Vereinslogo hin.
- **Vereinstexte pflegen.** `src/content/club.ts` ist von Hand geschrieben
  (Stand August 2026). Ändern sich die Beiträge, muss es dort nachgezogen
  werden — jeder Abschnitt verlinkt deshalb auf die Website als verbindliche
  Quelle.

## Lizenz

Der Quelltext steht unter der [MIT-Lizenz](LICENSE) — andere Vereine dürfen ihn
gerne übernehmen.

Name, Logo und die Vereinstexte des MTB Bielefeld e.V. sind davon **nicht**
erfasst. Was genau frei ist und was nicht, steht in [HINWEISE.md](HINWEISE.md);
dort finden sich auch die Angaben zum Datenschutz.
