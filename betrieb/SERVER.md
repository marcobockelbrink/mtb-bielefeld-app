# Der Server

Was auf der Maschine eingerichtet ist, in welcher Reihenfolge und **warum**.
Wer den Server neu aufsetzen muss, arbeitet diese Datei von oben nach unten ab.

**Hier stehen keine Zugangsdaten.** Passwörter und Schlüssel liegen in
`betrieb/.env` auf dem Server und im Schlüsselbund der Personen, die Zugang
haben — dieses Repository ist öffentlich.

## Die Maschine

| | |
| --- | --- |
| Anbieter | Contabo, Standort Deutschland |
| Adresse | `169.58.129.20` |
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

Seit dem 5. August läuft der Betriebsaufbau auf dieser Maschine, aber in der
**vorläufigen** Fassung (`betrieb/docker-compose.vorlaeufig.yml`), weil Domain
und Mailzugang noch fehlen:

```bash
cd ~/mtb-bielefeld-app
docker compose -f betrieb/docker-compose.yml \
               -f betrieb/docker-compose.vorlaeufig.yml up -d --build
```

Geprüft und bestanden: API antwortet über das Netz (`http://169.58.129.20/gesundheit`),
sechs Tabellen migriert, `pruefe-begrenzung.sh` und `pruefe-ablauf.sh` beide
mit 0 — samt echtem Kalenderabruf aus dem Container und dem vollständigen
Anmeldeablauf über Mailpit.

> **In diesem Zustand darf kein echtes Vereinsmitglied eingeladen werden.**
> Ohne Domain gibt es kein Zertifikat; alles läuft unverschlüsselt, auch die
> Magic-Link-Token. Praktisch ist der Aufbau derzeit geschlossen — ohne
> Einladungscode kommt niemand hinein, und Mails gehen ausschließlich an
> Mailpit, verlassen die Maschine also nicht. Aber verlassen sollte sich
> darauf niemand.

Anmeldemails ansehen (Mailpit hört nur auf `127.0.0.1`):

```bash
ssh -L 8025:127.0.0.1:8025 mtb
# dann im eigenen Browser: http://localhost:8025
```

## Was noch nicht eingerichtet ist

- **Domain, DNS und TLS** — Plan 4b, Aufgabe 4. Ein `A`-Eintrag auf diese
  Adresse, dann `docker-compose.server.yml` statt der vorläufigen Fassung.
  Caddy holt das Zertifikat selbst.
- **Der Mailzugang des Vereins** — Host, Port, Benutzer, Passwort in die
  `.env`. Erst danach bekommt ein Mensch je einen Anmeldelink.
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
