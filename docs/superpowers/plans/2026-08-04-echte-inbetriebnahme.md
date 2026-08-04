# Plan 4b — Echte Inbetriebnahme

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Die Vereins-API läuft auf einem echten Linux-Server unter einer eigenen Domain, mit gültigem Zertifikat, Mailversand über den Mailserver des Vereins und einem Backup, das nachweislich zurückspielbar ist.

**Architektur:** Derselbe `docker compose`-Aufbau wie lokal (Plan 4a), nur ohne Mailpit und mit vier geänderten Stellen. Es gibt keine Registry und keine Veröffentlichungspipeline: Auf dem Server wird geklont und gebaut. Das ist für einen Verein die richtige Größe — eine Registry wäre ein weiteres Ding, das jemand pflegen muss.

**Voraussetzung:** Plan 4a ist umgesetzt (`betrieb/`), Plan 3 ist umgesetzt (die App spricht mit der API).

---

## Was der Verein entscheiden muss, bevor jemand tippt

Diese fünf Punkte sind **keine** technischen Fragen. Ohne Antwort darauf ist der Rest Beschäftigung.

| Frage | Wer entscheidet | Wenn unbeantwortet |
| --- | --- | --- |
| **Welche Domain?** Etwa `api.mtb-bielefeld.de` | Vorstand / wer den DNS verwaltet | Kein Zertifikat, keine App-Anbindung |
| **Welcher Hoster?** Vorschlag: Hetzner CX22 (~4 €/Monat), Rechenzentrum Deutschland | Vorstand (Kosten) | — |
| **Wer hält die Zugänge?** SSH-Schlüssel, Hoster-Konto, DNS | Vorstand | Ein Server, an den niemand mehr herankommt |
| **Wer schaut hin, wenn es klemmt?** Namentlich, nicht „der Verein" | Vorstand | In zwei Jahren ein Sicherheitsproblem |
| **SMTP-Zugang** auf dem Vereins-Mailserver: eigenes Postfach `noreply@mtb-bielefeld.de`, nicht das einer Person | wer den Mailserver verwaltet | Kein Mailversand, also keine Anmeldung |

**Zum Mailserver:** Dass der Verein einen eigenen hat, ist ein echter Vorteil und nicht nur ein gesparter Dienst:

- **Kein Auftragsverarbeitungsvertrag mit einem Mailanbieter nötig** — die Adressen verlassen den Verein nicht.
- **SPF, DKIM und DMARC sind vermutlich schon richtig.** Die API meldet sich als Klient an dem Mailserver an, der ohnehin für `mtb-bielefeld.de` verschickt; nach außen sendet weiterhin er. Der neue Server taucht in der SPF-Kette gar nicht auf. Genau das ist bei einem fremden Anbieter der mühsame Teil.

Zu klären ist nur: **Host, Port (587 oder 465), Benutzer, Passwort** — und ob der Mailserver ein Sendekontingent hat (viele geteilte Hoster begrenzen auf z. B. 100 Mails/Stunde). Die API verschickt pro Anmeldung genau eine Mail; bei einem Verein dieser Größe reicht jedes übliche Kontingent. Trotzdem wissen, wo die Grenze liegt.

## Übergreifende Vorgaben

Gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, Konfiguration und Commit-Nachrichten auf Deutsch.
- **Kein Geheimnis im Repository.** Es ist öffentlich. Zugangsdaten ausschließlich in `betrieb/.env` auf dem Server.
- **Keine stillen Fehlschläge.** Ein Dienst, der nicht startet, muss laut scheitern.
- **Nichts von Hand auf dem Server ändern, was auch im Repository stehen kann.** Alles, was nur auf dem Server existiert, ist beim nächsten Neuaufsetzen verloren — und niemand weiß dann, dass es fehlt. Ausnahme: `betrieb/.env`.
- **Nach jeder Aufgabe committen.**

---

## Aufgabe 1: SMTP aus der `.env`, nicht aus der Compose-Datei

Der Umstieg auf den Vereins-Mailserver soll eine reine Konfigurationsänderung sein. Heute steht er im Weg: `SMTP_HOST` und `SMTP_PORT` sind in `betrieb/docker-compose.yml` fest auf Mailpit verdrahtet, und für Benutzer und Passwort gibt es in `.env.beispiel` keinen Platz.

**Der Mailer selbst kann bereits alles** (`api/src/mailer.ts`): `SMTP_BENUTZER`, `SMTP_PASSWORT`, TLS auf Port 465, STARTTLS auf 587, Vorgabe 587. Hier ist nichts zu bauen — nur durchzureichen.

**Dateien:**
- Ändern: `betrieb/docker-compose.yml` — SMTP-Werte aus der Umgebung, Mailpit als Vorgabe
- Ändern: `betrieb/.env.beispiel` — vier SMTP-Schlüssel mit Erklärung
- Ändern: `betrieb/LIESMICH.md` — der Umstieg in zwei Sätzen

- [ ] **Schritt 1: Werte durchreichen statt festschreiben**

In `betrieb/docker-compose.yml` beim Dienst `api`:

```yaml
      # Lokal fängt Mailpit alles ab; auf dem Server steht hier der
      # Mailserver des Vereins. Die Vorgaben nach `:-` gelten nur, wenn die
      # `.env` dazu schweigt — so bleibt der lokale Aufbau ohne Zutun
      # lauffähig, und der Server braucht nur vier Zeilen in seiner `.env`.
      SMTP_HOST: ${SMTP_HOST:-mailpit}
      SMTP_PORT: ${SMTP_PORT:-1025}
      SMTP_BENUTZER: ${SMTP_BENUTZER:-}
      SMTP_PASSWORT: ${SMTP_PASSWORT:-}
```

**Achtung, und das ist der Grund für die leeren Vorgaben:** `waehleMailer` prüft `benutzer && passwort`. Ein leerer String ist falsch, also bleibt es bei Mailpit ohne Anmeldung — genau richtig. Stünden die Schlüssel gar nicht in der Compose-Datei, käme `undefined` an, was hier dasselbe täte; ausgeschrieben ist es aber lesbar.

- [ ] **Schritt 2: `.env.beispiel` ergänzen**

Bei den anderen Werten, mit erkennbar wertlosen Beispielen:

```bash
# Mailversand. Lokal leer lassen — dann fängt Mailpit alles ab und zeigt es
# unter http://localhost:8025, nichts geht nach draußen.
#
# Auf dem Server der Mailserver des Vereins. Dass es der eigene ist, spart
# nicht nur einen Dienst: Die Adressen der Mitglieder verlassen den Verein
# nicht, ein Auftragsverarbeitungsvertrag mit einem Mailanbieter entfällt,
# und SPF/DKIM/DMARC bleiben unangetastet — nach außen verschickt weiterhin
# derselbe Server wie bisher, dieser hier meldet sich nur als Klient an.
#
# Port 587 mit STARTTLS ist der Normalfall, 465 bedeutet TLS von Anfang an.
# Ein eigenes Postfach nehmen (noreply@…), nicht das einer Person: Wer den
# Verein verlässt, soll nicht die Anmeldung mitnehmen.
#SMTP_HOST=mail.mtb-bielefeld.de
#SMTP_PORT=587
#SMTP_BENUTZER=noreply@mtb-bielefeld.de
#SMTP_PASSWORT=bitte-aendern
```

- [ ] **Schritt 3: Beweisen, dass beides geht**

```bash
docker compose -f betrieb/docker-compose.yml up -d --build api
betrieb/pruefe-ablauf.sh          # muss weiterhin mit 0 enden
```

Dann die Gegenprobe, dass die Werte wirklich aus der `.env` kommen:

```bash
SMTP_HOST=beispiel.invalid docker compose -f betrieb/docker-compose.yml up -d api
docker compose -f betrieb/docker-compose.yml exec api printenv SMTP_HOST
```

Erwartet: `beispiel.invalid`. **Danach zurücksetzen** (`docker compose … up -d api` ohne die Variable), sonst scheitert der nächste Lauf am Mailversand.

- [ ] **Schritt 4: Committen**

```bash
git add betrieb/
git commit -m "SMTP-Zugang kommt aus der .env, Mailpit bleibt die lokale Vorgabe"
```

---

## Aufgabe 2: Den Server vorbereiten

Bevor irgendetwas läuft. Diese Aufgabe berührt das Repository nicht — sie wird auf dem Server ausgeführt und hier nur **dokumentiert**, damit sie beim nächsten Neuaufsetzen wiederholbar ist.

**Dateien:**
- Anlegen: `betrieb/SERVER.md` — was auf dem Server eingerichtet wurde und warum

- [ ] **Schritt 1: Server anlegen**

Hetzner CX22 (2 vCPU, 4 GB, 40 GB) oder CAX11 (ARM, günstiger). Debian 13 oder Ubuntu LTS. Beim Anlegen **den SSH-Schlüssel hinterlegen** — dann ist Passwort-Anmeldung von Anfang an nicht nötig.

Bei ARM (CAX): Alle vier Images gibt es für arm64. Der `xcaddy`-Bau dauert dort beim ersten Mal spürbar länger — kein Fehler, nur Geduld.

- [ ] **Schritt 2: Benutzer ohne root-Rechte, SSH härten**

```bash
adduser --disabled-password verein
usermod -aG sudo verein
rsync --archive --chown=verein:verein ~/.ssh /home/verein/
```

In `/etc/ssh/sshd_config.d/99-verein.conf`:

```
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
```

Dann `systemctl restart ssh`. **Vor dem Abmelden in einer zweiten Sitzung prüfen, dass die Anmeldung als `verein` klappt** — sonst sperrt man sich aus, und das ist der teuerste Fehler dieses Plans.

- [ ] **Schritt 3: Firewall**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Mehr nicht. Postgres und die API haben keine Portfreigabe und sollen keine bekommen.

- [ ] **Schritt 4: Automatische Sicherheitsupdates**

```bash
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

Das deckt das Betriebssystem ab, **nicht** die Container. Die kommen in Aufgabe 6.

- [ ] **Schritt 5: Docker**

Nach der offiziellen Anleitung von docker.com (nicht das Paket der Distribution — das ist meist zu alt für `compose` als Unterbefehl). Danach `usermod -aG docker verein` und einmal ab- und wieder anmelden.

Prüfen: `docker compose version` muss v2 melden.

- [ ] **Schritt 6: `betrieb/SERVER.md` schreiben und committen**

Was eingerichtet wurde, in welcher Reihenfolge, und **was bewusst nicht**. Wer den Server in drei Jahren neu aufsetzt, soll nicht raten müssen. Keine Passwörter, keine Schlüssel — nur die Schritte.

---

## Aufgabe 3: Die Compose-Datei serverfest machen

Die vier Stellen, die im Kopf von `betrieb/docker-compose.yml` aufgezählt sind. Eine davon (SMTP) hat Aufgabe 1 erledigt.

**Der Weg ist eine `betrieb/docker-compose.server.yml`**, die die lokale Datei überlagert, statt sie zu ersetzen:

```bash
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml up -d --build
```

So bleibt die lokale Datei genau das, was sie ist — der Aufbau zum Entwickeln —, und der Unterschied zum Server steht an **einer** Stelle, sichtbar und kurz. Eine Kopie der ganzen Datei würde beim ersten Ändern auseinanderlaufen, ohne dass es jemand merkt.

**Dateien:**
- Anlegen: `betrieb/docker-compose.server.yml`
- Anlegen: `betrieb/Caddyfile.server`
- Ändern: `betrieb/docker-compose.yml` — der Kopf zählt die Unterschiede auf; nach dieser Aufgabe verweist er auf die Überlagerungsdatei

- [ ] **Schritt 1: `betrieb/docker-compose.server.yml` anlegen**

```yaml
# Was auf dem Server anders ist als lokal — und nur das.
#
# Aufruf:
#   docker compose -f betrieb/docker-compose.yml \
#                  -f betrieb/docker-compose.server.yml up -d --build
#
# Bewusst eine Überlagerung und keine Kopie: Eine zweite vollständige Datei
# liefe beim ersten Ändern auseinander, ohne dass es jemand merkt. So steht
# der Unterschied an einer Stelle und ist in dreißig Sekunden zu lesen.

services:
  postgres:
    restart: unless-stopped

  api:
    restart: unless-stopped

  caddy:
    restart: unless-stopped
    ports:
      # Lokal auf 127.0.0.1 gebunden, hier auf alle Adressen — sonst wäre der
      # Dienst von außen unerreichbar. 443 kommt dazu: Darüber läuft alles,
      # 80 dient nur der Umleitung und dem Zertifikatsnachweis.
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile.server:/etc/caddy/Caddyfile:ro

  # Mailpit fängt Mail ab, statt sie zuzustellen — auf einem Server wäre das
  # die stille Variante von „es geht keine Mail raus". Der Dienst wird
  # deshalb nicht überlagert, sondern in der Server-Fassung gar nicht
  # gestartet; siehe `--scale mailpit=0` in LIESMICH.md, Abschnitt Server.
  mailpit:
    profiles: ['nur-lokal']
```

**Zum `profiles`-Kniff:** Ein Dienst mit einem Profil startet nur, wenn das Profil ausdrücklich angefordert wird. In der lokalen Datei steht kein Profil, also läuft Mailpit dort normal; die Überlagerung setzt eines und nimmt ihn damit heraus. Prüfe das nach — falls die Compose-Fassung auf dem Server das anders handhabt, ist `--scale mailpit=0` der Ersatz. **Nimm nicht an, dass es geht; sieh nach.**

- [ ] **Schritt 2: `betrieb/Caddyfile.server` anlegen**

Wörtlich `betrieb/Caddyfile`, mit einer einzigen Änderung: statt `:80` der Domainname.

```
api.mtb-bielefeld.de {
	rate_limit {
		… unverändert aus betrieb/Caddyfile übernehmen …
	}

	reverse_proxy api:3000
}
```

Caddy holt das Zertifikat von Let's Encrypt dann von selbst — dafür muss die Domain schon auf den Server zeigen (Aufgabe 4) und Port 80 offen sein.

**Kein `trusted_proxies` eintragen.** Der Kopf von `betrieb/Caddyfile` begründet, warum: Ohne diese Zeile ersetzt Caddy ein mitgeschicktes `X-Forwarded-For` durch die echte Adresse, und nur deshalb kann niemand der API von außen eine erfundene IP unterschieben. Wer sie einträgt — der naheliegende Handgriff, sobald ein CDN davorsteht —, muss `VERTRAUTER_PROXY` mit anpassen, sonst ist die Begrenzung je IP wertlos, **ohne dass ein Test rot wird**.

- [ ] **Schritt 3: Den Kopf von `docker-compose.yml` nachziehen**

Die Aufzählung dort beschreibt jetzt einen behobenen Zustand. Ersetze sie durch einen Verweis auf `docker-compose.server.yml` — und den Hinweis, dass jede künftige Abweichung dorthin gehört, nicht in Kommentare.

- [ ] **Schritt 4: Lokal prüfen, dass nichts kaputtging**

```bash
docker compose -f betrieb/docker-compose.yml config >/dev/null && echo "lokal lesbar"
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml config | grep -E "restart|443|Caddyfile.server"
betrieb/pruefe-ablauf.sh
```

Die zweite Zeile prüft die zusammengeführte Fassung, ohne sie zu starten — auf dem Entwicklungsrechner würde Port 443 vermutlich kollidieren.

- [ ] **Schritt 5: Committen**

```bash
git add betrieb/
git commit -m "Server-Fassung als Überlagerung statt als Kopie"
```

---

## Aufgabe 4: Die erste Inbetriebnahme

- [ ] **Schritt 1: DNS setzen**

Ein `A`-Eintrag (und `AAAA`, falls IPv6) für `api.mtb-bielefeld.de` auf die Server-Adresse. **Vor** dem Start warten, bis er sich verbreitet hat:

```bash
dig +short api.mtb-bielefeld.de
```

Caddy versucht sonst vergeblich, ein Zertifikat zu holen, und Let's Encrypt hat ein Fehlversuchs-Kontingent — zu früh starten kostet Wartezeit.

- [ ] **Schritt 2: Klonen und `.env` ausfüllen**

```bash
git clone https://github.com/marcobockelbrink/mtb-bielefeld-app.git
cd mtb-bielefeld-app
cp betrieb/.env.beispiel betrieb/.env
chmod 600 betrieb/.env
```

Auszufüllen: `POSTGRES_PASSWORD` (lang und zufällig, **ohne** Sonderzeichen — es wandert unkodiert in `DATABASE_URL`, siehe Kommentar in der Vorlage), die vier `SMTP_*`, `MAIL_ABSENDER`, `APP_BASIS_URL` (`mtbie://`), `API_BASIS_URL` (`https://api.mtb-bielefeld.de`).

- [ ] **Schritt 3: Starten**

```bash
docker compose -f betrieb/docker-compose.yml \
               -f betrieb/docker-compose.server.yml up -d --build
docker compose -f betrieb/docker-compose.yml logs -f caddy
```

Der erste Bau dauert einige Minuten (`xcaddy`). Im Caddy-Protokoll muss ein erfolgreicher Zertifikatsbezug stehen.

- [ ] **Schritt 4: Prüfen, was in Plan 4a schon geprüft wurde — jetzt gegen echt**

```bash
curl -sI https://api.mtb-bielefeld.de/gesundheit | head -3
BASIS=https://api.mtb-bielefeld.de betrieb/pruefe-begrenzung.sh
```

Erwartet: `HTTP/2 200`, gültiges Zertifikat, und die Ratenbegrenzung greift wie lokal.

**`pruefe-ablauf.sh` läuft hier nicht durch** — es holt die Mail aus Mailpit, den es auf dem Server nicht gibt. Der Ablauf wird stattdessen von Hand geprüft (Schritt 5). Halte das im Bericht fest, statt es zu übergehen.

- [ ] **Schritt 5: Der erste echte Anmeldeablauf**

```bash
docker compose -f betrieb/docker-compose.yml exec api \
  npm run einladung:erzeugen -- deine.adresse@example.org
curl -X POST https://api.mtb-bielefeld.de/anmeldung/anfordern \
  -H 'content-type: application/json' \
  -d '{"email":"deine.adresse@example.org","einladungscode":"<Code>"}'
```

Dann **im echten Postfach nachsehen**. Zu prüfen ist mehr als „ist angekommen":

- Landet sie im Posteingang oder im Spam? (Wenn Spam: mit dem verantwortlichen Menschen für den Mailserver reden, bevor Mitglieder eingeladen werden.)
- Kommen Umlaute in Betreff und Text richtig an?
- Stimmt der Absender?
- Zeigt der Link auf `mtbie:///anmeldung/<token>` — drei Schrägstriche?

- [ ] **Schritt 6: Auf dem Telefon**

`EXPO_PUBLIC_API_URL=https://api.mtb-bielefeld.de` in einen Bau der App, dann den Link aus der Mail antippen. Erwartet: Die App öffnet sich, der Anmeldebildschirm erscheint kurz, danach die Terminliste, und unter Einstellungen steht „Du bist angemeldet."

**Das ist der eigentliche Prüfstein dieses Plans.** Alles davor lässt sich vom Schreibtisch aus behaupten.

---

## Aufgabe 5: Backups, und einmal zurückspielen

Ein nie geprüftes Backup ist kein Backup. Diese Aufgabe ist erst fertig, wenn eine Rücksicherung **tatsächlich gelaufen** ist.

**Dateien:**
- Anlegen: `betrieb/sichern.sh`
- Ändern: `betrieb/SERVER.md` — wo die Sicherungen liegen, wer herankommt

- [ ] **Schritt 1: `betrieb/sichern.sh`**

Ein Postgres-Dump aus dem Container, verschlüsselt, auf einen **anderen** Rechner. Eine Sicherung auf derselben Maschine ist keine.

```bash
docker compose -f betrieb/docker-compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "sicherung-$(date +%F).sql.gz"
```

Ziel: Hetzner Storage Box, ein Rechner im Verein, oder `restic` gegen einen S3-kompatiblen Speicher. Was gewählt wird, ist eine Vereinsentscheidung — dass es **nicht dieselbe Maschine** ist, nicht.

Das Skript sagt, was es erwartet, und endet mit einem Wert ungleich Null, wenn etwas nicht stimmt — wie die anderen Skripte in `betrieb/`.

- [ ] **Schritt 2: Ein Zeitplan**

`systemd`-Timer oder cron, täglich. Und: **eine Meldung, wenn es scheitert.** Ein Backup, das seit sechs Wochen stumm fehlschlägt, ist schlimmer als keines, weil man sich darauf verlässt.

- [ ] **Schritt 3: Zurückspielen — wirklich**

Auf einem **zweiten**, leeren Aufbau (lokal genügt):

```bash
gunzip < sicherung-JJJJ-MM-TT.sql.gz | docker compose -f betrieb/docker-compose.yml exec -T postgres psql -U mtbie mtbie
```

Dann `betrieb/pruefe-ablauf.sh` gegen den zurückgespielten Stand. **Erst wenn der durchläuft, ist diese Aufgabe fertig.**

Trag in `SERVER.md` ein, wann die letzte Probe war. Vorschlag: einmal im Quartal, im Vereinskalender vermerkt.

---

## Aufgabe 6: Betrieb

- [ ] **Schritt 1: Container aktuell halten**

`unattended-upgrades` deckt das Betriebssystem ab, nicht die Images. Für Postgres und Caddy braucht es einen bewussten Handgriff:

```bash
git pull
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml pull
docker compose -f betrieb/docker-compose.yml -f betrieb/docker-compose.server.yml up -d --build
```

Wie oft, entscheidet der Verein. Vorschlag: einmal im Monat, zusammen mit dem Blick auf die Sicherungen. Schreib es in `SERVER.md`, sonst passiert es nie.

- [ ] **Schritt 2: Aufräumen prüfen**

`server.ts` räumt abgelaufene Token und Sitzungen im Betrieb selbst weg. Prüfe nach einer Woche, dass das greift:

```bash
docker compose -f betrieb/docker-compose.yml exec api npm run aufraeumen
```

Erwartet: kleine Zahlen. Große hieße, der Zeitgeber im Server läuft nicht — dann wächst die Datenbank still.

- [ ] **Schritt 3: Ins Protokoll sehen können**

`docker compose … logs api` reicht für den Anfang, aber die Protokolle wachsen unbegrenzt. Setz eine Grenze (`logging.options.max-size` in der Server-Überlagerung) und schreib in `SERVER.md`, wonach man im Zweifel sucht — etwa `"msg":"Kalender nicht lesbar"` oder gehäufte 429.

---

## Aufgabe 7: Das Rechtliche

Kein Code. Aber vor dem ersten echten Mitglied fällig, nicht danach — sobald echte Adressen in der Datenbank liegen, ist es keine Kür.

- [ ] **Verzeichnis von Verarbeitungstätigkeiten** (Art. 30 DSGVO). Welche Daten, wozu, wie lange, wer hat Zugriff. Für diese App überschaubar: E-Mail-Adresse, Anmeldezeitpunkte, Tourenteilnahmen.
- [ ] **Auftragsverarbeitungsvertrag mit dem Hoster.** Hetzner stellt ihn zum Herunterladen bereit. **Mit dem Mailanbieter entfällt er** — der Mailserver ist der des Vereins.
- [ ] **Datenschutzerklärung anpassen.** Die bestehende kennt die App nicht.
- [ ] **Einwilligungstext für Gäste** — die API sieht ihn vor, der Wortlaut muss vom Verein kommen.
- [ ] **Löschkonzept.** `DELETE /konto` gibt es; im Verzeichnis muss stehen, dass und wie es benutzt wird.

---

## Nach diesem Plan

Die Vereins-API läuft unter einer eigenen Domain mit gültigem Zertifikat, verschickt über den Mailserver des Vereins, wird gesichert, und die Sicherung ist nachweislich zurückspielbar. Mitglieder können sich in der App anmelden und zu Touren eintragen.

**Was danach noch offen ist:**

- **`binIchDabei`** — die App vergisst nach einem Neustart, dass man eingetragen ist. Ein kleiner API-Nachtrag.
- **Gastanmeldung in der App** — die API kann sie, die App bietet sie nicht an.
- **Universal Links** — jetzt, wo die Domain feststeht, ließe sich `https://…` statt `mtbie://` einrichten. Dann öffnet der Link aus der Mail die App auch dann, wenn sie noch gar nicht installiert ist.
- **Instagram** — mit einem Backend wäre das Token endlich sicher unterzubringen.
