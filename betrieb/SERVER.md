# Der Server

Was auf der Maschine eingerichtet ist, in welcher Reihenfolge und **warum**.
Wer den Server neu aufsetzen muss, arbeitet diese Datei von oben nach unten ab.

**Hier stehen keine Zugangsdaten.** Passwörter und Schlüssel liegen in
`betrieb/.env` auf dem Server und im Schlüsselbund der Personen, die Zugang
haben — dieses Repository ist öffentlich.

## Zwei Maschinen, zwei Rollen

Seit dem 7. August 2026 sind **dev und prod getrennt**. Der Grund ist
nicht Ordnungsliebe: Solange beide dieselbe Datenbank benutzten, war jeder
Versuch ein Eingriff in Vereinsdaten — und ab dem Tag, an dem echte
Mitglieder darin stehen, wäre das nicht mehr einzufangen.

| | Prüfserver (dev) | Verein (prod) |
| --- | --- | --- |
| Adresse | `app-dev.mtb-bielefeld.de` | `app.mtb-bielefeld.de` |
| Maschine | Hetzner, `78.47.128.71` | steht noch aus |
| Zugang | `ssh mtb-hetzner` | — |
| Bündelkennung der App | `de.mtbbielefeld.app.dev` | `de.mtbbielefeld.app` |

Dazu läuft **Contabo** (`api.bockelbrink.net`, `169.58.129.20`,
`ssh mtb`) noch als Vorgänger des Prüfservers. Er wird abgeschaltet, sobald
die Hetzner-Maschine sich bewährt hat — nicht vorher und nicht am selben
Tag, denn bis dahin ist er der Rückfallweg.

Vier Werte in `betrieb/.env` unterscheiden die Aufbauten: `API_DOMAIN`,
`API_BASIS_URL`, `AASA_APP_ID` und das Datenbankpasswort. **Die Datenbanken
bleiben getrennt** — ein gemeinsamer Postgres verfehlte den ganzen Sinn.
Beim Umzug wandert sie deshalb auch nicht mit, sondern wird frisch
migriert; das beweist nebenbei, dass die Migrationen von null an
durchlaufen, und das prüft sonst niemand.

## Die Maschinen im Einzelnen

### Prüfserver (Hetzner)

| | |
| --- | --- |
| Anbieter | Hetzner Cloud, Falkenstein |
| Adresse | `78.47.128.71` — `app-dev.mtb-bielefeld.de` |
| System | Ubuntu 24.04 LTS, nacktes Image |
| Ausstattung | 2 Kerne, 3,8 GB RAM, 38 GB Platte, x86_64 |
| Eingerichtet | 7. August 2026 |

Zwei Dinge über die Abschnitte 1–5 hinaus, weil diese Maschine kleiner ist
als Contabo:

- **2 GB Swap** mit `vm.swappiness=10`. Der `xcaddy`-Bau übersetzt das
  Ratenbegrenzungs-Modul aus Go-Quelltext und ist der Schritt, der ohne
  Swap umkippt — mit 3,8 GB RAM ist das keine theoretische Sorge.
- **Docker-Logrotation** in `/etc/docker/daemon.json` (10 MB × 3). **Auf
  Contabo fehlt sie**; dort wächst `json-file` unbegrenzt.

Zwei Eigenheiten des Hetzner-Images, die beim Härten irritieren und beide
kein Fehler sind: `/etc/ssh/sshd_config.d/` ist leer (es gibt keine
`50-cloud-init.conf`, die auf Contabo `PasswordAuthentication yes` setzte),
und `systemctl is-enabled ssh` meldet `disabled`, weil Ubuntu 24.04 über
`ssh.socket` startet.

### Vorgänger (Contabo)

| | |
| --- | --- |
| Anbieter | Contabo, Standort Deutschland |
| Adresse | `169.58.129.20` — `api.bockelbrink.net` |
| System | Ubuntu 24.04 LTS (noble) |
| Ausstattung | 4 Kerne, 7 GB RAM, 96 GB Platte, x86_64 |
| Eingerichtet | 4. August 2026 |

Das ist reichlich bemessen — vier Container für einen Radverein brauchen einen
Bruchteil davon. Contabos kleinstes Gerät ist schlicht größer als nötig.

**Beim Bestellen wurde bewusst das nackte Ubuntu-Image gewählt**, kein
Docker-Fertigimage und keine Verwaltungsoberfläche: Panels wie Plesk oder
CloudPanel bringen einen eigenen Webserver mit und belegen Port 80 und 443 —
genau die, die Caddy braucht. Der Konflikt ist unangenehm zu finden, weil
beide Seiten „läuft" melden.

## Zugang

Ein Benutzer `verein` ohne eigenes Passwort, mit `sudo` und dem
SSH-Schlüssel. Anmeldung als `root` ist abgeschaltet — wer etwas als root tut,
meldet sich als `verein` an und nimmt `sudo`; dann steht im Protokoll, wer es
war.

Auf dem Entwicklungsrechner in `~/.ssh/config`:

```
Host mtb
    HostName 169.58.129.20
    User verein
    IdentityFile ~/.ssh/mtb-verein
    IdentitiesOnly yes
```

`IdentitiesOnly yes` ist nicht schmückend: Ohne das probiert SSH erst alle
anderen Schlüssel durch, und der Server weist nach zu vielen Fehlversuchen ab,
bevor der richtige an die Reihe kommt.

> **Offen, und keine technische Frage:** Zurzeit kommt **ein** Mensch von
> **einem** Rechner an diesen Server. Geht der Laptop verloren, kommt niemand
> mehr hinein — auch der Verein nicht. Bevor echte Mitgliederdaten darauf
> liegen, gehört ein zweiter Schlüssel hinterlegt (zweites Vorstandsmitglied)
> oder dieser an einen Ort, an den der Verein herankommt. Das ist die Frage
> „wer betreibt das auf Dauer" in ihrer praktischen Form.

## Was eingerichtet wurde

### 1. Benutzer

```bash
adduser --disabled-password --gecos "" verein
usermod -aG sudo verein
install -d -m 700 -o verein -g verein /home/verein/.ssh
cp /root/.ssh/authorized_keys /home/verein/.ssh/authorized_keys
chown verein:verein /home/verein/.ssh/authorized_keys
chmod 600 /home/verein/.ssh/authorized_keys
echo 'verein ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/verein
chmod 440 /etc/sudoers.d/verein
visudo -c -f /etc/sudoers.d/verein     # prüfen, bevor man sich darauf verlässt
```

`NOPASSWD`, weil das Konto gar kein Passwort hat (`--disabled-password`) —
sonst käme man mit `sudo` nicht weiter.

**Vor dem nächsten Schritt prüfen, dass die Anmeldung als `verein` und `sudo`
wirklich funktionieren.** Wer root abschaltet, bevor der Ersatz belegt ist,
sperrt sich aus. Das ist der teuerste Fehler dieser Anleitung.

### 2. SSH härten

`/etc/ssh/sshd_config.d/01-verein.conf`:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

**Der Dateiname muss klein nummeriert sein — das ist keine Kosmetik.** In
`sshd_config` gewinnt der **zuerst** gefundene Wert, nicht der letzte, anders
als in fast jeder anderen Konfiguration. Als `99-verein.conf` war die Datei
wirkungslos: Ubuntus `50-cloud-init.conf` wird davor gelesen und setzt dort
`PasswordAuthentication yes`. Gemerkt hat das nur `sshd -T`, das die
tatsächlich wirksamen Werte ausgibt — die Datei selbst sah richtig aus.

Deshalb: **immer `sshd -T` prüfen, nie die Datei ansehen und es glauben.**

```bash
sshd -t                                     # Syntax, vor dem Neustart
sshd -T | grep -E "permitroot|password"     # was wirklich gilt
systemctl restart ssh
```

Gegenprobe von außen, aus einer zweiten Sitzung:

```bash
ssh verein@…   # muss klappen
ssh root@…     # muss "Permission denied (publickey)" sagen
```

### 3. Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # Umleitung und Zertifikatsnachweis
ufw allow 443/tcp     # der eigentliche Verkehr
ufw enable
```

**Reihenfolge beachten:** erst 22 erlauben, dann einschalten. Andersherum
kappt `ufw enable` die laufende Verbindung.

Mehr wird nicht geöffnet. Postgres und die API haben keine Portfreigabe und
sollen keine bekommen — erreichbar sind sie ausschließlich über Caddy im
Compose-Netz.

### 4. Automatische Sicherheitsupdates

```bash
apt-get install -y unattended-upgrades
```

`/etc/apt/apt.conf.d/20auto-upgrades`:

```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
```

**Das deckt das Betriebssystem ab, nicht die Container.** Postgres und Caddy
kommen aus Images und werden davon nicht berührt — siehe „Laufender Betrieb"
unten.

### 5. Docker

Aus der offiziellen Paketquelle von docker.com, **nicht** aus Ubuntus: Dort
ist die Fassung meist zu alt für `compose` als Unterbefehl, und Updates kämen
nicht mit.

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
usermod -aG docker verein
```

Nach `usermod` einmal ab- und wieder anmelden, sonst greift die Gruppe nicht.
Prüfen mit `docker run --rm hello-world` **ohne** `sudo`.

Stand nach der Einrichtung: Docker 29.7.1, Compose v5.4.0.

## Der Aufbau läuft — vorläufig

Seit dem 5. August läuft der Betriebsaufbau unter **https://api.bockelbrink.net**
(Testdomain; die Vereinsdomain kommt später). Noch in der **vorläufigen**
Fassung, weil der Mailzugang fehlt:

```bash
cd ~/mtb-bielefeld-app
docker compose -f betrieb/docker-compose.yml \
               -f betrieb/docker-compose.vorlaeufig.yml up -d --build
```

Der Domainname steht in `betrieb/.env` als `API_DOMAIN` und wird von dort in
die Caddyfile gereicht — beim Umzug auf die Vereinsdomain ändert sich eine
Zeile, keine Datei im Repository.

| Geprüft | Ergebnis |
| --- | --- |
| Zertifikat | Let's Encrypt, per HTTP-01 geholt, gültig bis 2. November; Caddy verlängert selbst |
| `https://…/gesundheit` | 200 in 62 ms |
| HTTP → HTTPS | 308 Umleitung |
| Migrationen | sechs Tabellen |
| `pruefe-begrenzung.sh` | 0, auch über HTTPS — inklusive `trustProxy` in beide Richtungen |
| `pruefe-ablauf.sh` | 0 über HTTPS — Einladungscode, Mail, Link, Konto, an- und abmelden |
| Reverse-DNS | `169.58.129.20` → `api.bockelbrink.net` → `169.58.129.20` (FCrDNS stimmt) |

> **In diesem Zustand darf kein echtes Vereinsmitglied eingeladen werden** —
> nicht mehr wegen fehlender Verschlüsselung, die steht jetzt, sondern weil
> niemand je einen Anmeldelink bekäme. Er landet in Mailpit auf dem Server.

Anmeldemails ansehen (Mailpit hört nur auf `127.0.0.1`):

```bash
ssh -L 8025:127.0.0.1:8025 mtb
# dann im eigenen Browser: http://localhost:8025
```

### Zum Reverse-DNS

Ist eingerichtet und stimmt in beide Richtungen. **Für diesen Aufbau ist es
allerdings nicht tragend:** Die API verschickt nicht selbst, sondern meldet
sich als Klient beim Mailserver des Vereins an — nach außen sendet weiterhin
dieser, und geprüft wird dessen Adresse, nicht die hier. Gut, dass es steht;
gebraucht würde es erst, wenn dieser Server jemals selbst zustellen soll. Das
ist nicht geplant.

## Was noch nicht eingerichtet ist

- **Der Mailzugang des Vereins** — Host, Port, Benutzer, Passwort in die
  `.env`. Erst danach bekommt ein Mensch je einen Anmeldelink, und erst
  danach tritt `docker-compose.server.yml` an die Stelle der vorläufigen
  Fassung.
- **Die Vereinsdomain** — sie steht an **drei** Stellen, und alle drei
  müssen mitgehen:

  | Wo | Was |
  | --- | --- |
  | `betrieb/.env` auf dem Server | `API_DOMAIN`, `API_BASIS_URL` |
  | `app.config.js` (`UMGEBUNGEN`) | `domain` — für `associatedDomains` und `intentFilters` |
  | `src/config.ts` (`waehleApiAdresse`) | die Adresse, mit der die App spricht |

  Die letzten beiden liegen absichtlich nebeneinander und werden von
  `tests/appKonfiguration.test.ts` gegeneinander geprüft — laufen sie
  auseinander, öffnet ein geteilter Link den Browser statt der App, und
  das fiele sonst erst auf einem Gerät auf.

  Nach dem Umstellen braucht es einen **Neubau der nativen Apps**
  (`npm run vorbereiten:prod`, dann `expo run:ios`/`run:android` mit
  gesetztem `EXPO_PUBLIC_APP_UMGEBUNG=prod`): Die Domain landet in den
  nativen Entitlements, ein Metro-Neustart reicht nicht.
- **Backups** — Plan 4b, Aufgabe 5. **Nichts wird gesichert, solange das
  fehlt.** Solange nur Testkonten in der Datenbank liegen, ist das
  verschmerzbar; ab dem ersten echten Mitglied nicht mehr.
- **Ein zweiter Zugang** — siehe oben.

## Laufender Betrieb

**Container aktuell halten** (das tut `unattended-upgrades` nicht):

```bash
cd ~/mtb-bielefeld-app
git pull
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml pull
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml up -d --build
```

Vorschlag: einmal im Monat, zusammen mit dem Blick auf die Sicherungen.
Wenn es nicht im Kalender steht, passiert es nicht.

**Ins Protokoll sehen:**

```bash
docker compose -f betrieb/docker-compose.yml logs --tail 200 api
```

Wonach man im Zweifel sucht: `"msg":"Kalender nicht lesbar"` (der
Vereinskalender war nicht erreichbar), gehäufte 429 (jemand klopft zu oft an),
`Mailversand ist nicht eingerichtet` (die SMTP-Werte fehlen in der `.env`).
