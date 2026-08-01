# Sicherheit

## Eine Lücke melden

Bitte **kein öffentliches Issue** aufmachen — dann wüsste jeder von der Lücke,
bevor sie behoben ist.

Zwei Wege:

1. **Über GitHub** (bevorzugt): Reiter *Security* → *Report a vulnerability*.
   Der Bericht ist nur für die Verwaltenden des Repositories sichtbar.
2. **Per Mail** über das [Kontaktformular des Vereins](https://mtb-bielefeld.de/kontakt)
   mit dem Betreff „Sicherheit App".

Wir sind ein ehrenamtlicher Verein und lesen nicht stündlich mit. Rechne mit
einer Antwort innerhalb von zwei Wochen.

## Was unterstützt wird

Sicherheitskorrekturen gibt es für den jeweils aktuellen Stand auf `main` und
die zuletzt in den Stores veröffentlichte Fassung.

## Was diese App angreifbar macht — und was nicht

Ehrlich eingeschätzt ist die Angriffsfläche klein, und das aus einem Grund:

**Die App hat keine Geheimnisse.** Keine API-Schlüssel, keine Konten, keine
Anmeldung, kein Server, keine Datenbank. Es gibt schlicht nichts zu erbeuten.
Alle abgerufenen Daten sind ohnehin öffentlich, und es werden keine
Nutzerdaten erhoben oder übertragen. Damit fällt der größte Teil dessen weg,
was bei mobilen Apps üblicherweise schiefgeht.

Was bleibt:

- **Auswertung von Fremddaten.** Die App liest iCal- und RSS-Daten und wertet
  sie mit vielen regulären Ausdrücken aus. Ein ungünstig gebauter Ausdruck kann
  bei passender Eingabe sehr lange rechnen und die App zum Stehen bringen
  (*ReDoS*). Deshalb läuft CodeQL mit dem Abfragesatz `security-and-quality`,
  der genau darauf achtet.
- **Vertrauen in die Quellen.** Wer den Google-Kalender des Vereins verändern
  kann, kann steuern, was die App anzeigt. Das ist kein Fehler der App, sondern
  eine Frage der Zugriffsrechte auf den Kalender — dort gehören die Rechte eng
  gehalten und die Zwei-Faktor-Anmeldung eingeschaltet.
- **Lieferkette.** Der größte reale Risikofaktor. Eine Expo-App bringt viele
  fremde Pakete mit; ein übernommenes Paket wäre der wahrscheinlichste Weg
  hinein. Dagegen laufen Dependabot und die Prüfung in der CI.
- **Angezeigte Inhalte.** Beitragstexte werden als reiner Text dargestellt,
  nicht in einer eingebetteten Webansicht. Das war eine bewusste Entscheidung
  und nimmt einer ganzen Klasse von Angriffen die Grundlage.

## Was automatisch prüft

| Prüfung | Was sie tut |
| --- | --- |
| CodeQL | Statische Analyse des Quelltextes, wöchentlich und bei jedem Pull Request |
| Dependabot | Meldet verwundbare Pakete und schlägt Aktualisierungen vor |
| `npm audit` in der CI | Blockiert bei hoher und kritischer Einstufung |
| Secret Scanning | GitHub sucht nach versehentlich eingecheckten Zugangsdaten |

## Hinweis zu `overrides` in der package.json

Das Projekt erzwingt `uuid` in Version 11.1.1 oder neuer. Grund ist
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq): Expos
Build-Werkzeuge ziehen transitiv eine ältere Fassung mit.

Zur Einordnung: Betroffen sind nur die Werkzeuge, die auf dem Entwicklungsrechner
laufen — der Code landet nie auf einem Telefon. Die Korrektur ist trotzdem
sinnvoll, weil sie nichts kostet: Sie ist geprüft mit Tests, Typprüfung,
`expo export` und `expo prebuild`. Sobald Expo selbst nachzieht, kann der
Eintrag entfallen.
