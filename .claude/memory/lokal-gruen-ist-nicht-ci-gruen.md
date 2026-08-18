---
name: lokal-gruen-ist-nicht-ci-gruen
description: "In diesem Projekt mehrfach „alles grün\" gemeldet, während die CI seit Tagen rot war — vor solchen Aussagen die CI abfragen"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-04T22:27:19.160Z
---

Am 04.08.2026 habe ich über Stunden hinweg wiederholt „alles grün" gemeldet,
gestützt auf lokale Läufe. Die CI war seit dem 03.08. rot. Aufgefallen ist es
nur zufällig, weil Marco nach den Dependabot-Zweigen fragte.

Zwei Ursachen, beide derselben Art — die Prüfung lief in einer bequemeren
Welt als die Wirklichkeit:

- Der API-Auftrag installierte nur `api/`; die geteilten Module aus der
  Projektwurzel brauchen aber die Wurzel-Pakete. Zehn von neunzehn
  Testdateien liefen gar nicht erst an, die übrigen 59 Tests waren grün und
  sahen nach einem Teilerfolg aus.
- Ein Test suchte über `start.getHours()` und funktionierte nur auf einem
  Rechner in Bielefelder Zeitzone. Die CI läuft in UTC.

## Und die banalste Variante: die Ausgabe abgeschnitten

Am 18.08.2026 fast wieder passiert, aus einem viel dümmeren Grund. Ich
rufe die Tests gern als `npm test 2>&1 | tail -4` auf, weil die volle
Ausgabe lang ist. Vitest schreibt aber **erst** die Fehlerberichte und
**dann** die Zusammenfassung:

    Test Files  1 failed | 40 passed (41)
          Tests  444 passed (444)

Mit `tail -4` blieb davon nur die zweite Zeile stehen — „444 passed",
und das las sich wie ein voller Erfolg. Tatsächlich lud eine ganze
Testdatei nicht mehr, weil ich React Native in eine Datei gezogen hatte,
die ohne Gerät ladbar bleiben muss.

**Deshalb nie `tail` auf eine Testausgabe**, sondern
`grep -E "Test Files|Tests "` — das holt beide Zeilen, egal wie lang der
Bericht davor ist. Eine bestandene Zahl ohne die Dateizeile daneben ist
keine Auskunft.

**Why:** „Grün" ist eine Tatsachenbehauptung über den Zustand des Projekts,
nicht über meinen Rechner. Wer sie glaubt, merged darauf.

**How to apply:** Vor jeder Aussage über den Gesamtzustand `gh run list
--limit 3` abfragen, nicht nur lokale Läufe zitieren. Und wenn ein Fehlschlag
auftaucht: erst nachstellen, dann beheben — bei beiden Fällen oben hat das
Nachstellen gezeigt, dass die naheliegende Erklärung nicht stimmte. Gilt
sinngemäß auch für Konfiguration: `sshd -T` statt die Datei ansehen,
`docker compose config` statt die Überlagerung glauben.
Verwandt: [[mtb-server-offene-punkte]]
