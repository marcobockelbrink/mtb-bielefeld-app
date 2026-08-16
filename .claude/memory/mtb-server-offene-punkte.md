---
name: mtb-server-offene-punkte
description: "Hetzner ist der Prüfserver und verschickt echte Mail; es fehlen noch Sicherungsziel und Vereinsmaschine — Stand 13.08.2026"
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

**Contabo ist am 08.08.2026 gekündigt**, der Hetzner trägt allein.

`api.bockelbrink.net` zeigt seit dem 08.08.2026 auf den Hetzner und wird
**seit dem 12.08.2026 dort auch bedient**: `API_DOMAIN_ZUSATZ` in
`betrieb/.env` hängt den Namen als zweite Adresse an den Site-Block
(Commits d0fe880, 40a82fb), Caddy hat das Zertifikat geholt, beide Namen
liefern `{"zustand":"bereit"}`. Es ist **derselbe Aufbau und dieselbe
Datenbank** — kein zweiter Stapel, kein prod. Der echte prod-Endpunkt
entsteht weiterhin später als `api.mtb-bielefeld.de` auf der
Vereinsmaschine; der Apple-Entwicklerzugang ist seit dem 11.08.2026
vorhanden (bezahlt), es fehlen noch SMTP und die Maschine selbst.

Seit dem 12.08.2026 besteht außerdem **SSH-Zugang von Marcos neuem
Laptop**: `ssh mtb-hetzner`, Benutzer `verein`, Schlüssel
`~/.ssh/mtb-verein` (neu erzeugt am 11.08., Fingerabdruck dTRm/Qgr…, über
die Hetzner-Konsole hinterlegt). Der Contabo (`ssh mtb`) ist von hier nie
erreichbar gewesen — Port 22 antwortet nicht, vermutlich `ufw`.

Beim Messen die Falle beachten: Der Systemauflöser hielt
`api.bockelbrink.net` noch auf der Contabo-Adresse fest und lieferte
prompt einen 200er. Gegen `@1.1.1.1` prüfen, und die Maschine mit
`curl --resolve <name>:443:<ip>` festnageln.

Der Vereinsserver (`api.mtb-bielefeld.de`) existiert noch nicht.

## Was fehlt — und nur von außen kommen kann

- ~~SMTP~~ **erledigt am 12.08.2026**: `sslout.df.eu:465`, Konto
  `jugendorga@mtb-bielefeld.de`, in `betrieb/.env`; `MAIL_ABSENDER` auf
  dieselbe Adresse umgestellt (Absender muss zum Postfach passen). Mailpit
  läuft im Compose noch mit, wird aber nicht mehr benutzt. Der
  Umstieg auf `docker-compose.server.yml` steht noch aus.
- ~~SFTP-Ziel~~ **erledigt am 16.08.2026**: Hetzner Storage Box
  `u647588-sub2@u647588.your-storagebox.de:/home/mtb-bielefeld-app-backup`,
  **Port 23** (Port 22 nimmt Verbindungen an und weist den Schlüssel dann
  ab — sieht wie ein Schlüsselproblem aus, ist keines). Nur über IPv6
  erreichbar. Eigener Schlüssel `/home/verein/.ssh/sicherung` auf dem
  Server, hinterlegt per SFTP in `.ssh/authorized_keys` der Box. Timer
  `mtb-sicherung.timer` läuft alle zwei Stunden, erste Sicherungen liegen.
  **Noch nie zurückgespielt** — der private age-Schlüssel liegt auf dem
  alten Laptop, siehe [[age-schluessel-fuer-sicherungen]]. Ein nie
  zurückgespieltes Backup ist eine Vermutung, keine Sicherung.
- **Ein zweiter Zugang zu den Servern.** Es kommt genau ein Mensch von
  genau einem Rechner hinein.
- **Die Maschine des Vereins** und **`api.mtb-bielefeld.de` im DNS**.
- ~~Apple-Konto~~ **erledigt**: Team `755278A9P4`, siehe
  [[testflight-und-eas]] — Universal Links am 12.08.2026 auf echtem
  iPhone nachgewiesen.

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

## Stand nach dem 13.08.2026

Marco ist registriert und hat die Rolle `verwaltung` — der erste
Verwalter steht, ab jetzt läuft alles über die Verwaltungsansicht der
App (einladen mit Ein-Klick-Mail, Rollen, Jugend, Einladungen
zurückziehen, Mitglieder löschen; die letzte Verwaltung ist
unentziehbar und unlöschbar). **Verwaltung erbt die Guide-Rechte**
(`hatGuideRechte` in `rolle.ts`) — keine Doppelrolle.

Noch offen, wartet auf außen: der **öffentliche TestFlight-Link** (nach
Beta-Review) als `TESTFLIGHT_LINK` in die Server-.env — dann ist die
Einladungsmail die Komplett-Einladung samt App-Installation. Und
weiterhin: **SFTP-Sicherungsziel** (inzwischen liegen echte Fotos und
Mitgliederdaten ungesichert!) und die **Vereinsmaschine**.

CodeQL-Funde am 13.08. abgearbeitet: sechs Härtungen, vier begründete
Fehlalarme. Die zwei Dependabot-Warnungen sind die bekannten
image-size-Advisories ohne Fix (Ausnahme bis 01.11. in
tools/audit-mit-ausnahmen.mjs).
