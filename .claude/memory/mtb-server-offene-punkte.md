---
name: mtb-server-offene-punkte
description: "Zwei Server (Contabo als Vorgänger, Hetzner als Prüfserver); was noch fehlt, kann nur von außen kommen — Stand 07.08.2026"
metadata:
  node_type: memory
  type: project
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
---

## Was läuft

| | Prüfserver | Vorgänger |
| --- | --- | --- |
| Domain | `api-dev.bockelbrink.net` | `api.bockelbrink.net` |
| Maschine | Hetzner, `78.47.128.71` | Contabo, `169.58.129.20` |
| Zugang | `ssh mtb-hetzner` | `ssh mtb` |

Beide fahren die **vorläufige** Fassung mit Mailpit
(`docker-compose.vorlaeufig.yml`) — `docker-compose.server.yml` verlangt
einen echten SMTP-Zugang. Der Prüfserver hat eine frisch migrierte
Datenbank (12 Migrationen von null), nichts ist von Contabo mitgewandert.
Contabo bleibt der Rückfallweg, bis sich Hetzner ein paar Tage bewährt
hat.

Der Vereinsserver (`api.mtb-bielefeld.de`) existiert noch nicht.

## Was fehlt — und nur von außen kommen kann

- **SMTP-Zugang des Vereins-Mailservers** (Host, Port, Benutzer,
  Passwort). Bis dahin fängt Mailpit alles ab, also bekommt **kein Mensch
  je einen Anmeldelink**. Das ist der einzige Punkt zwischen jetzt und
  „ein Mitglied kann die App benutzen". Vier Zeilen in `betrieb/.env`.
- **SFTP-Ziel für die Sicherungen.** Skripte und systemd-Einheiten liegen
  fertig im Repository, es fehlt nur `SICHERUNG_ZIEL`. Solange wird
  **nichts gesichert**.
- **Ein zweiter Zugang zu den Servern.** Es kommt genau ein Mensch von
  genau einem Rechner hinein.
- **Die Maschine des Vereins** und **`api.mtb-bielefeld.de` im DNS**.
- **Ein bezahltes Apple-Entwicklerkonto.** Das kostenlose Personal Team
  stellt `associated-domains` so wenig aus wie `aps-environment`. Auf dem
  Simulator ist der geteilte Link vollständig nachgewiesen, auf einem
  echten iPhone nicht — und bis dahin auch nicht möglich. Dessen Team-ID
  gehört danach in `AASA_APP_ID` auf dem Vereinsserver.

## Die Hetzner-Maschine im Einzelnen

x86_64, **kein** CAX11/arm64 wie zunächst entworfen — die arm64-Begründung
ist gegenstandslos. Ubuntu 24.04.4 LTS, 2 Kerne, 3,8 GB, 38 GB,
Reverse-DNS stimmt in beide Richtungen.

Zwei Dinge über `SERVER.md` Abschnitt 1–5 hinaus, weil sie kleiner ist als
Contabo: **2 GB Swap** mit `vm.swappiness=10` (der `xcaddy`-Go-Bau kippt
sonst um) und **Docker-Logrotation** in `/etc/docker/daemon.json`
(10 MB × 3 — **die fehlt auf Contabo ebenfalls**, dort wächst `json-file`
unbegrenzt).

Zwei Eigenheiten des Hetzner-Images, beide kein Fehler:
`/etc/ssh/sshd_config.d/` ist leer (keine `50-cloud-init.conf`, die auf
Contabo `PasswordAuthentication yes` setzte), und `systemctl is-enabled
ssh` meldet `disabled`, weil Ubuntu 24.04 über `ssh.socket` startet.

Bewusst abgewählt: Hetzners Cloud-Firewall neben `ufw`, und ein
AAAA-Eintrag.

## Zwei Merkregeln, die Zeit gekostet haben

**DNS gegen `@1.1.1.1` prüfen, nie gegen den Systemauflöser.** Der hielt
`api-dev.bockelbrink.net` zwischenzeitlich auf der Contabo-Adresse fest,
und ich habe daraufhin Falsches in einen Plan geschrieben.

**Vor einem Umgebungswechsel `pkill -f "expo start"`.** `expo run:ios`
übernimmt einen laufenden Metro; `EXPO_PUBLIC_API_URL` erreicht dann nur
den Bau, nicht das Bündel, und die App spricht mit dem falschen Server,
ohne dass irgendwo etwas anderes steht. Siehe [[simulator-mit-idb]].

**Why:** Diese Punkte tauchen in jedem Gespräch über den Server wieder
auf, und die meisten sind keine technischen Fragen, sondern
Vereinsentscheidungen. Sie im Blick zu haben verhindert, dass ich Arbeit
vorschlage, die daran hängt.

**How to apply:** `betrieb/SERVER.md` im Repository führt beide Maschinen
und ist die ausführliche Quelle; dieser Eintrag ist die Kurzfassung samt
dem, was der Verein liefern muss. Version bleibt auf Marcos Wunsch bei
0.8, bis der Mailweg steht. Verwandt:
[[age-schluessel-fuer-sicherungen]], [[lokal-gruen-ist-nicht-ci-gruen]],
[[simulator-mit-idb]]
