---
name: instagram-erst-mit-backend
description: "Instagram-Beiträge in \"Aktuelles\" sind vertagt, bis die App ohnehin ein Backend und Nutzerkonten bekommt"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-02T17:51:11.562Z
---

Am 02.08.2026 entschieden: Instagram-Beiträge werden **nicht** in "Aktuelles"
eingebunden. Erst wieder ein Thema, wenn Backend und Nutzerkonten ohnehin
anstehen. Der Link auf das Vereinsprofil unter Verein → Kontakt & Links bleibt
die einzige Instagram-Anbindung.

**Why:** Meta hat jeden unauthentifizierten Zugriff geschlossen — auch auf
öffentliche Konten. Nötig wären ein Business-/Creator-Konto, eine Meta-App und
ein Zugriffstoken, das nach ~60 Tagen abläuft. Das Token darf nicht in die App
(dort auslesbar), braucht also eine Stelle außerhalb. Das widerspricht dem
Kernversprechen des Projekts: kein Server, keine laufenden Kosten. Dazu offen:
ob eine Zustimmung zur Veröffentlichung auf Instagram auch die automatische
Übernahme in eine App deckt — auf den Fotos sind Vereinsmitglieder zu sehen.

**How to apply:** Nicht erneut durchrechnen, solange kein Backend geplant ist.
Kommt die Frage wieder auf, ist der serverlose Zwischenweg eine geplante
GitHub Action, die die Beiträge holt und als JSON ins Repo legt — Haken bleibt
die Token-Erneuerung alle 60 Tage. Abgreifen der Website ohne API scheidet aus
(Sperren und Nutzungsbedingungen). Siehe [[ios-geraetebau-push-berechtigung]]
für die andere wiederkehrende Hürde.
