---
name: git-refs-duplikate-macos
description: "„bad object refs/heads/main 2\" bei jedem git pull — macOS legt Duplikate in .git/refs an, gefahrlos zu löschen"
metadata: 
  node_type: memory
  type: reference
  originSessionId: be554ade-3ea1-4298-8237-c78dec3c4d02
  modified: 2026-08-16T10:25:07.935Z
---

Jedes `git pull --rebase` brach am 16.08.2026 ab mit:

```
Schwerwiegend: bad object refs/heads/main 2
Fehler: … hat nicht alle erforderlichen Objekte gesendet
```

Die Ursache steht wörtlich in der Meldung und ist trotzdem leicht zu
überlesen: In `.git/refs/heads/` und `.git/refs/remotes/origin/` lagen
Dateien namens **`main 2`** — macOS-Duplikate mit Leerzeichen, wie sie
beim Kopieren oder nach abgebrochenen Schreibvorgängen entstehen. Hier
stammten sie aus der Nacht, in der hängende Prozesse abgeschossen wurden.
Git behandelt sie als Referenzen mit dem Namen „main 2", findet den
Zeitpunkt aber nicht mehr sauber auf und verweigert dann den ganzen
Vorgang.

**Erst prüfen, ob etwas daran hängt, dann löschen:**

```bash
sha=$(cat ".git/refs/heads/main 2")
git merge-base --is-ancestor "$sha" main && echo "gefahrlos"
rm ".git/refs/heads/main 2" ".git/refs/remotes/origin/main 2"
```

Zeigt der Ableger auf einen Commit, der **nicht** in `main` steckt, ist
das kein Müll, sondern verlorene Arbeit — dann einen Branch daraus machen
statt zu löschen.

`git fsck` danach läuft mehrere Minuten und ist entbehrlich; es lief hier
in einen Timeout, ohne dass etwas gefehlt hätte.

**Why:** Die Meldung klingt nach einem beschädigten Repository oder einem
Problem beim Gegenüber („hat nicht alle erforderlichen Objekte
gesendet") — beides falsch, und beides verführt zu Maßnahmen, die
tatsächlich Schaden anrichten (neu klonen, `--force`). Verwandt:
[[lokal-gruen-ist-nicht-ci-gruen]]

**How to apply:** Bei „bad object refs/…" zuerst `ls .git/refs/heads/`
und `ls .git/refs/remotes/origin/` ansehen. Ein Dateiname mit Leerzeichen
ist die Antwort. **Nie** mit `git push --force` darauf reagieren — im
Projekt arbeiten mehrere Sitzungen parallel, siehe CLAUDE.md.
