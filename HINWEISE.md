# Rechtliche Hinweise

## Der Quelltext: MIT-Lizenz

Der Programmcode in diesem Repository steht unter der [MIT-Lizenz](LICENSE).
Andere Vereine dürfen ihn übernehmen, anpassen und weitergeben — das ist
ausdrücklich erwünscht.

**Für andere Vereine besonders brauchbar:** Wer seine Termine ebenfalls über
einen öffentlichen Google-Kalender pflegt, kann fast alles direkt übernehmen. Zu
ändern sind im Wesentlichen die Adressen in [`src/config.ts`](src/config.ts) und
die Vereinstexte in [`src/content/club.ts`](src/content/club.ts). Die Muster zur
Auswertung der Terminbeschreibungen in
[`src/data/parse/description.ts`](src/data/parse/description.ts) sind auf die
Schreibweise des MTB Bielefeld e.V. abgestimmt und brauchen vermutlich
Anpassungen.

## Was **nicht** unter der MIT-Lizenz steht

Die Lizenz gilt für den Quelltext. Ausdrücklich **nicht** erfasst sind:

- **Name und Logo des MTB Bielefeld e.V.** Die Vereinsbezeichnung und alle
  Bildmarken sind kennzeichenrechtlich geschützt. Eine abgeleitete App darf nicht
  den Anschein erwecken, sie käme vom oder gehöre zum MTB Bielefeld e.V.
- **Die Vereinstexte** in `src/content/club.ts` sowie die Texte im README, die
  von mtb-bielefeld.de stammen. Sie beschreiben diesen Verein und gehören ihm.
- **Die Kalender- und Beitragsdaten**, die die App abruft. Sie sind zwar
  öffentlich zugänglich, aber nicht zur beliebigen Weiterverwendung freigegeben.

Kurz: Der Bauplan ist frei, das Vereinsschild nicht.

## Testdaten

`tests/fixtures/kalender-auszug.ics` und `tests/fixtures/news-feed.xml` sind
eingefrorene Auszüge der öffentlichen Feeds des Vereins. Sie enthalten
Terminbeschreibungen, in denen Vornamen von Guides vorkommen — dieselben Angaben
stehen im öffentlichen Vereinskalender. Wer die Nennung dort nicht möchte, sollte
sie aus den Testdaten entfernen; die Tests hängen nicht an einzelnen Namen.

## Datenschutz

Die App sammelt keine Daten. Es gibt keine Konten, keine Nutzungsanalyse, keine
Werbung und keine Weitergabe an Dritte.

Termin-Erinnerungen entstehen **auf dem Gerät**. Es wird kein Gerätekennzeichen
übertragen, und der Verein betreibt keinen Push-Dienst — es gibt schlicht nichts,
was gespeichert werden könnte.

Die App ruft ausschließlich diese beiden öffentlichen Adressen ab:

- den Vereinskalender bei Google (`calendar.google.com`)
- den RSS-Feed der Vereinswebsite (`mtb-bielefeld.de`)

Dabei erfahren Google und der Webhoster des Vereins — wie bei jedem Aufruf einer
Website — die IP-Adresse des Geräts. Das lässt sich ohne eigenen Server nicht
vermeiden und ist in der Datenschutzerklärung zu erwähnen, wenn die App in die
Stores geht.
