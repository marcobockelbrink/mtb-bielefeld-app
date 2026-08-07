---
name: mtb-server-offene-punkte
description: "Der Vereinsserver läuft auf Contabo und wartet auf Daten, die nur Marco und der Verein liefern können; die Hetzner-Maschine ist grundinstalliert, trägt aber noch keinen Aufbau — Stand 07.08.2026"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9594adb8-6d4b-46e0-b2ff-87ebf8679fee
  modified: 2026-08-07T12:59:48.208Z
---

Der Vereinsserver läuft seit dem 05.08.2026 unter
`https://api.bockelbrink.net` (Contabo, Ubuntu 24.04). Das Technische steht;
was fehlt, sind Angaben, die nur von außen kommen können:

- **SMTP-Zugang des Vereins-Mailservers** (Host, Port, Benutzer, Passwort).
  Bis dahin fängt Mailpit alles ab, also bekommt **kein Mensch je einen
  Anmeldelink**. Das ist der einzige Punkt zwischen jetzt und „ein Mitglied
  kann die App benutzen". Vier Zeilen in `betrieb/.env`.
- **SFTP-Ziel für die Sicherungen.** Skripte und systemd-Einheiten liegen
  fertig im Repository, es fehlt nur `SICHERUNG_ZIEL`. Solange wird **nichts
  gesichert**.
- **Ein zweiter Zugang zum Server.** Es kommt genau ein Mensch von genau
  einem Rechner hinein (`~/.ssh/mtb-verein`).
- **Die Vereinsdomain.** `api.bockelbrink.net` ist Marcos eigene Domain zum
  Prüfen; die Vereinsdomain kommt später, dann `API_DOMAIN` in der `.env`
  umstellen. **Für Universal Links reicht das nicht** — die Domain steht
  zusätzlich in `app.json` (`associatedDomains`, `intentFilters`) und wird
  vom Betriebssystem aus dem fertigen Bündel gelesen. Seit dem 07.08.2026
  sind dort beide Domains angemeldet, damit der Umzug nur noch die `.env`
  betrifft.
- **Ein bezahltes Apple-Entwicklerkonto.** Das kostenlose Personal Team
  stellt `associated-domains` so wenig aus wie `aps-environment`. Auf dem
  Simulator ist der geteilte Link nachgewiesen, auf einem echten iPhone
  nicht und bis dahin auch nicht möglich.

**Umzug zu Hetzner — Maschine steht, Aufbau fehlt (07.08.2026).** Contabo
wird abgelöst; der dev-Server heißt künftig **`api-dev.bockelbrink.net`**
(`78.47.128.71`), nicht mehr `api.bockelbrink.net` — das weicht vom
ursprünglichen Entwurf ab und ist **noch nirgends in der App nachgezogen**
(`src/config.ts`, `app.config.js`/`app.json` zeigen weiter auf
`api.bockelbrink.net`). Die Maschine ist **x86_64**, kein CAX11/arm64 wie
zunächst entworfen; die arm64-Begründung ist damit gegenstandslos.
Ubuntu 24.04.4 LTS, 2 Kerne, 3,8 GB, 38 GB, Reverse-DNS stimmt in beide
Richtungen. `SERVER.md` Abschnitt 1–5 ist abgearbeitet und nachgemessen:
Benutzer `verein`, root und Passwort abgeschaltet, `ufw` mit 22/80/443,
unattended-upgrades, Docker 29.7.2 + Compose v5.4.0 aus docker.com.
Über `SERVER.md` hinaus eingerichtet, weil die Maschine kleiner ist als
Contabo: Zeitzone `Europe/Berlin` (wie dort), **2 GB Swap** mit
`vm.swappiness=10` (3,8 statt 7,9 GB RAM — der `xcaddy`-Go-Bau ist der
Schritt, der ohne Swap umkippt), und **Docker-Logrotation** in
`/etc/docker/daemon.json` (10 MB × 3; **die fehlt auf Contabo ebenfalls**).
Zwei Eigenheiten des Hetzner-Images: `/etc/ssh/sshd_config.d/` ist leer, es
gibt keine `50-cloud-init.conf`, und `systemctl is-enabled ssh` meldet
`disabled`, weil Ubuntu 24.04 über `ssh.socket` startet — beides kein
Fehler. **Docker Compose läuft dort noch nicht** — kein Repository, keine
`.env`, keine Datenbank. Datenbank soll **nicht** mitwandern, sondern frisch
migriert werden. Bewusst abgewählt: Hetzners Cloud-Firewall neben `ufw`,
und ein AAAA-Eintrag. Zugang lokal über `ssh mtb-hetzner` (Contabo bleibt
`ssh mtb`). **In `betrieb/SERVER.md` steht davon noch nichts.**

**Stand 07.08.2026:** Plan 6 (Jugendbereich in der App) ist **fertig und
auf `main`** (`4fb67be`), Zweig gelöscht. Zwei Prüfungsrunden über den
ganzen Zweig brachten neun Befunde, alle behoben. Contabo läuft auf `main`
mit neu gebauter API; nachgemessen: 3 Mitglieder und 12 Migrationen
unversehrt, 401 ohne Token, AASA mit `application/json`, Bremse bei 10.

Als Nächstes: **dev und prod trennen**, Plan liegt unter
`docs/superpowers/plans/2026-08-07-dev-und-prod-trennen.md`. Entschieden:
Umgebung wird **beim Bauen** festgelegt (kein Umschalter in den
Einstellungen, der stünde im ausgelieferten Programm), Voreinstellung ist
`dev` — wer prod baut, sagt es. Die dev-Fassung bekommt die eigene
Bündelkennung `de.mtbbielefeld.app.dev`, damit beide nebeneinander auf
einem Telefon liegen. Neu dazu: `AASA_APP_ID` in der `.env`, damit jeder
Aufbau seine eigene App-Kennung für Universal Links nennt.

**Achtung beim Ablesen von DNS:** Der lokale Auflöser hielt
`api-dev.bockelbrink.net` zwischenzeitlich auf der Contabo-Adresse fest,
und ich habe daraufhin Falsches in den Plan geschrieben. Immer gegen
`@1.1.1.1` prüfen, nie gegen den Systemauflöser.

**Why:** Diese Punkte tauchen in jedem Gespräch über den Server wieder auf,
und die meisten sind keine technischen Fragen, sondern Vereinsentscheidungen. Sie
im Blick zu haben verhindert, dass ich Arbeit vorschlage, die daran hängt.

**How to apply:** Bei Fragen zum Server oder zum nächsten Schritt zuerst
prüfen, ob sich hier etwas erledigt hat. `betrieb/SERVER.md` im Repository
führt den Stand der **Contabo**-Maschine — **von der Hetzner-Maschine weiß
es nichts**, dieser Eintrag ist dafür bis auf Weiteres die einzige Quelle.
Version bleibt auf Marcos Wunsch bei 0.8, bis der Mailweg steht.
Verwandt: [[age-schluessel-fuer-sicherungen]],
[[lokal-gruen-ist-nicht-ci-gruen]]
