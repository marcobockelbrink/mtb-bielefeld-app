# Tourenanmeldung mit Mitgliedskonten

**Stand:** 02.08.2026 · **Zustand:** entworfen, nicht begonnen

## Zweck

Mitglieder und Gäste melden sich in der App zu einer Tour an. Der Guide sieht,
wer kommt. Alle anderen sehen, ob noch Plätze frei sind.

Heute läuft das über einen vorbereiteten Mail-Entwurf
(`src/features/events/signup.ts`). Das genügt für „ich komme mit", beantwortet
aber nicht die Frage, die vor jeder Ausfahrt zählt: **Ist überhaupt noch Platz?**

## Abgrenzung

Das Backend besitzt **keine Termine**. Der Google-Kalender bleibt die Wahrheit.
Gespeichert werden nur Konten und Anmeldungen.

```
Google-Kalender ──► App (liest direkt, wie heute)
       │
       └──────────► API ──► Postgres
                    Konten, Anmeldungen
```

Drei Gründe:

1. **Der Vereinsablauf bleibt unverändert.** Guides pflegen weiter den
   Kalender. Keine zweite Oberfläche, in der Termine doppelt gepflegt werden.
2. **Die App bleibt offlinefähig.** Fällt die API aus, sind Termine, Filter und
   Erinnerungen unberührt — nur die Anmeldung fehlt.
3. **Kleine Angriffsfläche.** Es gibt keine Termindaten zu schützen.

## Getroffene Entscheidungen

| Frage | Entscheidung | Warum |
|---|---|---|
| Was können Mitglieder tun? | Zu Touren an- und abmelden | Lesen allein hätte kein Backend gebraucht |
| Wer darf sich anmelden? | Der Guide legt es je Termin fest | Schnupperfahrten sind ausdrücklich für Nicht-Mitglieder |
| Wer sieht die Teilnehmer? | Namen nur der Guide, Zahl für alle | Datensparsam; beantwortet „passe ich noch rein?" |
| Mitgliedsnachweis | Einladungscodes der Verwaltung | Koppelt an einen Prozess, den es schon gibt; Austritte entziehen den Zugang |
| Betrieb | Eigener Server, schlank | Daten bleiben beim Verein; ~5 €/Monat, ~1 Std./Monat Pflege |
| Anmeldeverfahren | Magic Link, kein Passwort | Wo es kein Passwort gibt, kann keines geleakt werden |
| Identitätsanbieter | **keiner** | Keycloak/Authentik lösen Probleme, die dieser Verein nicht hat |
| Gäste | Im ersten Stand enthalten | Ausdrücklich so entschieden, trotz höherem Datenschutz-Anteil |

## Stabiler Terminschlüssel

Die App bildet ihre Kennung als `uid#startInstant` (`parseCalendar.ts:204`) —
der Startzeitpunkt steckt also **in der Kennung**. Verschiebt der Verein einen
Termin, entsteht eine neue Kennung und alle Anmeldungen hängen ins Leere. Das
passiert regelmäßig; der Parser behandelt `RECURRENCE-ID` bereits ausdrücklich.

**Die API schlüsselt Anmeldungen deshalb nach `uid` plus dem *ursprünglichen*
Zeitpunkt der Wiederholung** (`recurrenceInstant`), der eine Verschiebung
überlebt. Bei Einzelterminen genügt die `uid`.

Dafür muss `ClubEvent` diesen Wert mitführen. Er liegt im Parser vor
(`parseCalendar.ts:106`) und wird derzeit nur nicht durchgereicht.

## Die API glaubt der App nichts

Ob Gäste mitdürfen, wie viele Plätze es gibt, ob der Termin existiert — all das
steht im Kalender, und **die API liest ihn selbst**. Käme die Angabe von der
App, könnte jeder sie fälschen.

Möglich, weil beide Seiten TypeScript sind: `src/data/ical/` und
`src/data/parse/` werden geteilter Code, kein zweiter Parser. Beides ist ohne
React Native geschrieben und durch die bestehenden Tests abgedeckt.

Guides schreiben ihre Vorgabe wie gewohnt in die Terminbeschreibung:

```
Gäste: ja
Plätze: 12
```

`maxParticipants` liest `description.ts` bereits aus. Es kommt eine Zeile hinzu,
kein neues Werkzeug.

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `mitglied` | E-Mail, Rolle, angelegt, zuletzt gesehen |
| `einladung` | Code als Hash, ausgestellt von, eingelöst von, eingelöst am, gültig bis |
| `anmeldung` | Terminschlüssel, Mitglied **oder** Gastdaten, angelegt, storniert |
| `magic_link` | Token als Hash, gültig 15 Minuten, einmal verbrauchbar |
| `sitzung` | Refresh-Token als Hash, mit Rotation und Wiederverwendungserkennung |

Alle Token stehen **nur als Hash** in der Datenbank. Wer die Datenbank erbeutet,
kann sich damit nicht anmelden.

Eindeutiger Index auf `(terminschluessel, mitglied_id)`: Doppelanmeldung durch
Doppeltippen ist damit unmöglich, nicht nur unwahrscheinlich.

## Rollen

`mitglied` · `guide` · `verwaltung`

Der Kalender nennt Guides nur beim Vornamen („Euer Guide: Malte"). Das an ein
Konto zu binden wäre fehleranfällig — zwei Maltes, und die Teilnehmerliste
landet beim Falschen. **Wer die Rolle `guide` trägt, sieht die Namen aller
Touren.** In einem Verein mit einer Handvoll Guides ist das ein klar
umrissener Kreis.

Die genauere Alternative — jeder Guide sieht nur seine eigenen Touren —
verlangt eine gepflegte Zuordnung Vorname → Konto, also genau die zweite
Datenpflege, die dieses Design vermeidet.

## API

```
POST   /anmeldung/anfordern      E-Mail + Einladungscode → Magic Link
POST   /anmeldung/einloesen      Token → Zugangs- und Refresh-Token
POST   /sitzung/erneuern         Refresh-Token rotieren
DELETE /sitzung                  Abmelden

GET    /termine/:schluessel      belegte und freie Plätze — ohne Token für alle
                                 lesbar; Namen nur mit Rolle `guide`
POST   /termine/:schluessel      anmelden — mit Token als Mitglied,
                                 ohne Token mit Gastdaten
DELETE /termine/:schluessel/ich  abmelden (nur Mitglieder; Gäste über Storno-Link)

GET    /gast/storno/:token       Anmeldung eines Gastes zurücknehmen

GET    /konto                    was über mich gespeichert ist
DELETE /konto                    Konto und Daten löschen
```

`GET /konto` und `DELETE /konto` sind nicht optional: Die DSGVO verlangt
Auskunft und Löschung, und **Apple verlangt die Kontolöschung direkt in der
App**, sonst gibt es keine Store-Freigabe.

## Datenfluss

### Anmeldung ohne Passwort

```
1. App:      E-Mail + Einladungscode  →  POST /anmeldung/anfordern
2. API:      Code prüfen, Magic Link mailen, Token als Hash speichern
3. Mitglied: tippt den Link in der Mail
4. Link:     öffnet die App        →  POST /anmeldung/einloesen
5. API:      Zugangs-Token (15 Min) + Refresh-Token (60 Tage)
```

Für den Rückweg aus der Mail **Universal Links**, nicht das nackte Schema
`mtbie://`: Ein Schema kann jede App beanspruchen, ein Universal Link ist an
die verifizierte Domain gebunden. Kostet eine Datei auf dem Webserver.

**Die Antwort ist immer dieselbe** — ob die E-Mail bekannt ist, der Code stimmt
oder gar nichts passt: „Wenn die Angaben stimmen, ist eine Mail unterwegs."
Sonst wird die Anmeldung zum Werkzeug, um Mitgliedschaften zu erraten.

### Token auf dem Gerät

| Token | Wo | Wie lange |
|---|---|---|
| Zugangs-Token | nur im Arbeitsspeicher | 15 Minuten |
| Refresh-Token | `expo-secure-store` (Keychain / Keystore) | 60 Tage, rotiert bei jeder Nutzung |

Nicht in AsyncStorage — dort liegt alles im Klartext auf dem Gerät.

Bei Rotation wird das alte Token entwertet. Taucht ein bereits verbrauchtes
wieder auf, wurde es kopiert: Dann fliegen **alle** Sitzungen des Kontos raus.

### Anmeldung zu einer Tour

```
POST /termine/:schluessel
  ├─ Token gültig? (bei Gästen: entfällt)
  ├─ Kalender lesen (zwischengespeichert): Termin da? Gäste erlaubt? Plätze?
  ├─ In einer Transaktion: zählen und einfügen
  └─ voll → 409, mit aktueller Belegung in der Antwort
```

**Zwei Leute greifen gleichzeitig nach dem letzten Platz.** Lesen-dann-Schreiben
lässt beide durch. Die Prüfung läuft deshalb in einer Transaktion, abgesichert
durch eine Bedingung in der Datenbank — nicht im Anwendungscode.

### Gäste

Ein Gast hat kein Konto. Für ihn gilt zusätzlich:

- Er gibt **Name und E-Mail** an — nicht mehr
- Er willigt **ausdrücklich ein**, mit Angabe des Zwecks und der Löschfrist.
  Kein vorangekreuztes Kästchen
- Er erhält eine Bestätigungsmail mit einem **einmaligen Storno-Link**; so nimmt
  er seine Anmeldung ohne Konto zurück
- Seine Daten werden **30 Tage nach dem Termin automatisch gelöscht**, durch
  einen wiederkehrenden Auftrag, nicht von Hand
- Sichtbar sind sie nur dem Guide

Gäste sind nur möglich, wenn der Termin `Gäste: ja` trägt. Fehlt die Zeile,
lehnt die API ab — auch dann, wenn die App den Knopf fälschlich anzeigen würde.

### Wenn die API nicht erreichbar ist

Die App zeigt Termine, Filter und Erinnerungen wie heute; nur der Anmeldeknopf
trägt einen Hinweis. **Anmeldungen werden nicht offline gepuffert.** Eine
Anmeldung, die vielleicht später ankommt, ist schlimmer als keine: Man erschiene
in der Überzeugung, angemeldet zu sein.

## Betrieb

```
Hetzner, Deutschland, kleinster Server (~5 €/Monat)
  Debian stable, unattended-upgrades
  docker-compose.yml
    Caddy       TLS, Reverse Proxy, Ratenbegrenzung
    API         Fastify, TypeScript
    Postgres    nur auf localhost
  restic → Objektspeicher, verschlüsselt
```

TypeScript im Backend, weil die App TypeScript ist: Die Typen aus
`src/domain/types.ts` und der Kalender-Parser lassen sich teilen. Ein Verein hat
keine zwei Fachleute — je weniger Sprachen, desto eher findet sich jemand, der
weitermacht.

## Sicherheit

- **TLS 1.3** über Caddy, HSTS, Zertifikate erneuern sich selbst
- **Ratenbegrenzung je Adresse *und* je E-Mail** — sonst wird der Magic Link
  zum Mailversand-Werkzeug für Fremde
- **Token als SHA-256-Hash.** Bewusst kein bcrypt: Das sind Zufallswerte mit
  voller Entropie, keine Passwörter. Langsames Hashen schützt hier nichts
- **Postgres hört nur auf localhost** — die häufigste Ursache echter Datenlecks
- SSH nur mit Schlüssel, Firewall auf 22/80/443
- **Keine Geheimnisse im Repo** — es ist öffentlich und MIT-lizenziert
- Backups verschlüsselt, **einmal im Quartal testweise zurückgespielt**

**Certificate Pinning bewusst nicht.** Es schützt gegen einen Angreifer, der
eine Zertifizierungsstelle unterwandert hat — kein realistisches Szenario für
einen Radverein. Der Preis dagegen ist real: Läuft das Zertifikat aus und die
App kennt das neue nicht, ist die App für alle tot, bis ein Update durch beide
Stores ist.

## Fehlerbehandlung

Die API antwortet immer im selben Format und **niemals mit internen Details** —
kein Stacktrace, kein SQL, keine Angabe, ob eine E-Mail bekannt ist.

In der App zählt die Formulierung. Nicht „Fehler 409", sondern:

> **Die Tour ist voll.** 12 von 12 Plätzen belegt.

Keine stillen Fehlschläge: Geht eine Anmeldung nicht durch, sagt die App das.

## Tests

Dem Muster des Projekts folgend — Rechenlogik ohne Rahmenwerk, ohne Gerät
prüfbar:

| Ebene | Was |
|---|---|
| Einheit | Einladungscodes, Token-Rotation, Platzberechnung, Löschfristen |
| Integration | Gegen ein echtes Postgres, nicht gegen Attrappen |
| **Wettlauf** | Zwei gleichzeitige Anmeldungen auf den letzten Platz — als echter Test |
| Gast | Storno ohne Konto, automatische Löschung nach 30 Tagen |
| Geteilt | Der Kalender-Parser bringt seine bestehenden Tests mit |

## Was der Verein rechtlich braucht

**Vor** der ersten Zeile Code:

- Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)
- Auftragsverarbeitungsvertrag mit Hetzner
- Neue Datenschutzerklärung. **HINWEISE.md und README stimmen nicht mehr** —
  dort steht heute „keine Konten", „sammelt nichts", „kein Server"
- Einwilligungstext für Gäste, mit Zweck und Löschfrist
- Löschung, die auch Backups nach Ablauf der Aufbewahrung erfasst

## Umfang

**Enthalten:** Magic Link mit Einladungscode · An- und Abmelden zu einer Tour ·
Gästeanmeldung mit Einwilligung, Storno-Link und Löschfrist · Zähler
„7 von 12" · Guide sieht Namen · Konto-Auskunft und -Löschung

**Nicht enthalten:** Warteliste · Push-Mitteilungen · Profilbilder · gemeinsame
Anmeldung mit der Website

**Einladungscodes im ersten Stand:** Die Verwaltung hat keinen Serverzugang und
soll auch keinen bekommen. Sie meldet den Bedarf, der Betreiber erzeugt die
Codes stapelweise mit einem Kommandozeilenwerkzeug und gibt sie zurück. Das
trägt für den Anfang, ist aber **kein Dauerzustand** — eine schlanke
Selbstbedienung für die Verwaltung ist der erste Kandidat für den zweiten
Ausbaustand.

## Offene Punkte

- **Mailversand:** Welcher Anbieter verschickt Magic Links und
  Gastbestätigungen? Ein eigener Mailserver kommt nicht in Frage — Zustellbarkeit
  ist ein Vollzeitproblem. Zu klären: Anbieter mit Sitz in der EU
- **Domain:** Unter welcher Adresse läuft die API? Wird für Universal Links
  gebraucht
- **Wer betreibt den Server auf Dauer?** Bewusst offengelassen, bis der Aufwand
  aus der Umsetzung sichtbar ist. Vor Inbetriebnahme zu beantworten
