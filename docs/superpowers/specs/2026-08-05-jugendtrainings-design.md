# Jugendtrainings — Entwurf

**Stand:** 5. August 2026 · Entschieden mit dem Auftraggeber im Gespräch.

## Das Problem

Jugendtrainings entstehen spontan — meist sonntags um 10:30, an wechselnden
Orten. Sie stehen **nicht** im Vereinskalender und laufen heute über eine
WhatsApp-Gruppe: Ein Trainer fragt, wer von den Guides kann, und wenn genug
zusammenkommen, sagt er den Eltern Bescheid.

Das funktioniert, hat aber drei Löcher. Wer nicht in der Gruppe ist, erfährt
nichts. Niemand weiß verlässlich, wie viele Kinder kommen. Und die Absprache
unter den Guides mischt sich mit allem anderen im selben Chat.

## Was gebaut wird

Ein eigener Bereich **Jugend** in der App, mit zwei Phasen:

```
Guide legt Entwurf an              nur für Guides sichtbar
  → Mail an alle Guides            „Sonntag 10:30 Oerlinghausen — kannst du?"
  → Guides sagen zu oder ab
  → der anlegende Guide sieht, wer kann, und entscheidet
       ↓ veröffentlichen
  sichtbar für alle Mitglieder     Eltern melden ein bis zwei Kinder an
       ↓ Absage jederzeit möglich
  → Mail an alle Angemeldeten, mit Grund
```

## Die Entscheidungen — und warum

| Frage | Entscheidung | Warum |
| --- | --- | --- |
| Woher kommen die Trainings? | In der App angelegt, nur von Guides | Wer heute eine WhatsApp tippt, macht keinen Kalendereintrag. Zum ersten Mal erzeugt der Verein damit Inhalte bei uns, statt sie zu spiegeln. |
| Wann geht es online? | Ein Guide drückt darauf | Ob zwei Guides für acht Kinder reichen, hängt an Strecke, Alter und Wetter. Ein Schwellenwert im Code träfe eine Entscheidung, die Erfahrung braucht. |
| Wer wird angemeldet? | Ein bis zwei **Kinder** mit Namen; das Konto ist nur der Absender | Die Eltern fahren nicht mit. Gezählt gehören die Kinder, und die Guide-Liste soll sie nennen, nicht die Erwachsenen. |
| Wer sieht die Namen? | Die Eltern entscheiden je Kind, was andere Mitglieder sehen | Einwilligung pro Anmeldung statt einer Regel für alle. Datensparsam, und es nimmt den Eltern die Entscheidung nicht ab. |
| Sehen Guides dasselbe? | Nein — Guides sehen immer Vor- **und** Nachname | Sie haben die Aufsicht. Bei einem Sturz muss jemand wissen, wer da liegt. Rechtlich sauber trennbar: berechtigtes Interesse für die Betreuung, Einwilligung für die öffentliche Anzeige. |
| Wie erfahren Guides von einer Anfrage? | Per Mail, Push später | Die API verschickt schon Mails. Push kostet ein bezahltes Apple-Konto, Gerätetoken auf dem Server und bricht ein Versprechen, das in den Einstellungen steht. |
| Wo in der App? | Eigener Bereich, **nicht** in der Terminliste | Die Terminliste kommt ohne Server aus und soll es bleiben. Trainings kämen aus unserer Datenbank — die Trennung ist technisch ehrlich. |
| Absage? | Guide sagt ab, alle Angemeldeten bekommen eine Mail mit Grund | Nutzt denselben Weg wie die Guide-Anfrage. Bei einem Sonntagstermin um acht Uhr ist Mail langsam — genau dort hilft Push später wirklich. |

## Das Loch, und wie es geschlossen wird

**Woher erfährt ein Elternteil, dass es Sonntag ein Training gibt?**

Heute piept WhatsApp. In diesem Entwurf müsste jemand von sich aus in die App
sehen — bei einem Termin, der Freitagabend entsteht, passiert das nicht, und
der Guide stünde am Sonntag allein am Parkplatz. Ohne eine Antwort darauf
scheitert das Feature an seinem eigentlichen Zweck.

**Antwort:** In den Einstellungen ein Schalter „Benachrichtige mich über neue
Jugendtrainings". Wer ihn setzt, bekommt beim Veröffentlichen eine Mail. Kein
Rundschreiben an den ganzen Verein — das wäre Spam für alle ohne Kinder — und
genau die Liste, die später auch die Push-Nachrichten bekommt.

## WhatsApp bleibt der Kanal — über einen Teilen-Knopf

Der Abonnement-Schalter erreicht nur, wer die App schon hat und ihn gefunden
hat. Die WhatsApp-Gruppe erreicht heute alle. Also beides.

**Automatisch posten geht nicht.** Die WhatsApp Business API schickt
Nachrichten an einzelne Nummern, die vorher zugestimmt haben; in normale
Gruppenchats kann sie nicht schreiben. Das ist von Meta so gebaut, keine
Einstellungssache, und bräuchte zudem ein Business-Konto, Nummern­verifizierung
und Geld je Unterhaltung — dasselbe Muster wie bei Instagram, das aus
denselben Gründen vertagt ist.

**Stattdessen ein Teilen-Knopf.** Nach dem Veröffentlichen legt die App einen
fertigen Text vor und öffnet das System-Teilen; der Guide wählt die Gruppe:

```
🚵 Jugendtraining am Sonntag, 10:30 Uhr
Wanderparkplatz Kalkofen, Oerlinghausen

Anmelden: https://<vereinsdomain>/t/k3f9
```

Ein Fingertipp mehr als vollautomatisch, dafür ohne Meta-Konto, ohne Kosten
und ohne weiteren Auftragsverarbeiter. Dass ein Mensch vor dem Absenden noch
einmal draufschaut, ist bei einem Termin für Kinder kein Nachteil.

### Was daran hängt

**Universal Links.** Der Link muss auch für jemanden funktionieren, der die
App nicht hat — sonst tippt die halbe Gruppe ins Leere. `https://…` öffnet
die App, wenn sie installiert ist, sonst eine kleine Seite mit
Installationshinweis. In `app.json` ist das noch nicht eingerichtet (seit
Plan 3 offen) und wird Teil von Plan 2. **Setzt die feststehende
Vereinsdomain voraus.**

**Die Seite hinter dem Link zeigt wenig:** „Jugendtraining am Sonntag — in
der App anmelden", plus Installationshinweis. **Nicht** Ort, Uhrzeit,
Teilnehmer. WhatsApp-Nachrichten werden weitergeleitet, und ein Link ist
kein Zugangsschutz. Im Nachrichtentext selbst dürfen Ort und Zeit stehen:
Die gehen heute ohnehin durch dieselbe Gruppe — das ist kein Rückschritt,
sondern der Ist-Zustand.

Der kurze Weg `/t/:id` statt `/jugendtraining/:id`: Ein Link, den jemand
abtippt oder vorliest, soll kurz sein. Er zeigt auf dieselbe Sache.

## Datenmodell

`mitglied.rolle` gibt es bereits mit `mitglied | guide | verwaltung` — daran
ändert sich nichts. Dazukommen drei Tabellen und eine Spalte:

```sql
-- Der Abonnement-Schalter. Eine Spalte statt einer eigenen Tabelle: Für ein
-- Ja/Nein je Mitglied wäre alles andere Aufwand ohne Gegenwert.
ALTER TABLE mitglied
  ADD COLUMN jugend_benachrichtigung boolean NOT NULL DEFAULT false;

CREATE TABLE jugendtraining (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beginnt_am         timestamptz NOT NULL,
  endet_am           timestamptz,
  ort                text NOT NULL,          -- „Wanderparkplatz Kalkofen"
  hinweis            text,                   -- „Helm nicht vergessen"
  plaetze            integer,                -- NULL = unbegrenzt
  guides_noetig      integer NOT NULL DEFAULT 2,   -- Anzeige, keine Automatik
  zustand            text NOT NULL DEFAULT 'entwurf'
                     CHECK (zustand IN ('entwurf', 'veroeffentlicht', 'abgesagt')),
  absagegrund        text,
  angelegt_von       uuid NOT NULL REFERENCES mitglied(id),
  angelegt_am        timestamptz NOT NULL DEFAULT now(),
  veroeffentlicht_am timestamptz,
  abgesagt_am        timestamptz,

  -- Ein Zustand ohne seinen Zeitstempel ist ein halber Zustand.
  CHECK (zustand <> 'veroeffentlicht' OR veroeffentlicht_am IS NOT NULL),
  CHECK (zustand <> 'abgesagt' OR (abgesagt_am IS NOT NULL AND absagegrund IS NOT NULL))
);

CREATE TABLE jugendtraining_guide (
  training_id    uuid NOT NULL REFERENCES jugendtraining(id) ON DELETE CASCADE,
  mitglied_id    uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  zusage         boolean NOT NULL,
  geantwortet_am timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (training_id, mitglied_id)
);

CREATE TABLE jugendtraining_kind (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id    uuid NOT NULL REFERENCES jugendtraining(id) ON DELETE CASCADE,
  mitglied_id    uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  vorname        text NOT NULL,
  nachname       text NOT NULL,
  -- 1 oder 2. Beim Einfügen wird der erste freie Wert genommen; zusammen
  -- mit dem Index unten setzt das die Grenze in der Datenbank durch, statt
  -- in einer Zählung, die zwei gleichzeitige Anfragen beide bestehen.
  platz          smallint NOT NULL CHECK (platz IN (1, 2)),
  -- Was andere Mitglieder sehen. Guides sehen immer beides.
  zeigt_vorname  boolean NOT NULL DEFAULT true,
  zeigt_nachname boolean NOT NULL DEFAULT false,
  angelegt_am    timestamptz NOT NULL DEFAULT now(),
  storniert_am   timestamptz
);

-- Höchstens zwei Kinder je Konto und Training. Als Bedingung in der
-- Datenbank und nicht als Prüfung im Code: Sonst gewinnt irgendwann ein
-- Doppelklick, wie schon bei der Tourenanmeldung.
CREATE UNIQUE INDEX jugendtraining_kind_hoechstens_zwei
  ON jugendtraining_kind (training_id, mitglied_id, platz)
  WHERE storniert_am IS NULL;
```

Gesperrt wird beim Anmelden mit `pg_advisory_xact_lock` je Training, genau
wie in `tourenanmeldung.ts` — dieselbe Begründung, dieselbe Bauweise.

## Endpunkte

Alle unter `/jugendtraining`, alle mit Zugangs-Token.

**„Guide" heißt: jeder Guide, nicht nur der anlegende.** Wer krank wird, soll
sein Training abgeben können, ohne dass es niemand mehr ändern kann. Der
Verein hat eine Handvoll Guides, die einander kennen — eine Eigentümerprüfung
wäre eine Hürde ohne Gegenwert. Wer wann was geändert hat, steht ohnehin im
Protokoll.

| Methode | Pfad | Wer | Was |
| --- | --- | --- | --- |
| `POST` | `/jugendtraining` | Guide | Entwurf anlegen, Mail an alle Guides |
| `GET` | `/jugendtraining` | Mitglied | veröffentlichte und abgesagte Trainings; Guides sehen zusätzlich Entwürfe |
| `GET` | `/jugendtraining/:id` | Mitglied | Einzelheiten samt Teilnehmeranzeige nach Rolle |
| `PATCH` | `/jugendtraining/:id` | Guide | Ort, Zeit, Hinweis ändern |
| `POST` | `/jugendtraining/:id/veroeffentlichen` | Guide | freischalten, Mail an die Abonnenten |
| `POST` | `/jugendtraining/:id/absage` | Guide | absagen mit Grund, Mail an alle Angemeldeten |
| `PUT` | `/jugendtraining/:id/guide` | Guide | eigene Zusage oder Absage setzen |
| `POST` | `/jugendtraining/:id/kinder` | Mitglied | ein Kind anmelden, mit Anzeige-Wahl |
| `DELETE` | `/jugendtraining/:id/kinder/:kindId` | Mitglied | eigenes Kind abmelden |
| `PUT` | `/konto/jugend-benachrichtigung` | Mitglied | Abonnement ein- oder ausschalten |
| `GET` | `/t/:id` | **niemand angemeldet** | die kleine Seite hinter dem geteilten Link; liefert HTML, keine Einzelheiten |

**Nicht vergessen — zwei Stellen außerhalb dieser Liste:**

- `/jugendtraining` muss in `IP_GESCHUETZTE_PFAD_PRAEFIXE` (`api/src/app.ts`),
  denn jeder dieser Pfade prüft ein Token gegen die Datenbank.
- Und in die Zonen von `betrieb/Caddyfile` **und**
  `api/caddy/anmeldung.Caddyfile`. Wer nur eine der beiden ändert, hat eine
  Vorlage, die von der laufenden Fassung abweicht.

`GET /t/:id` ist der **einzige Pfad ohne Token** in diesem Entwurf. Er gehört
deshalb in Caddys Ratenbegrenzung, aber nicht in die token­prüfende Schicht
der API — er prüft nichts gegen die Datenbank außer der Frage, ob es das
Training gibt. Er antwortet für ein unbekanntes Kürzel genauso wie für ein
abgesagtes Training: mit derselben Seite und demselben Statuscode. Sonst
wäre er ein Auskunftsdienst darüber, welche Kürzel existieren.

Die Belegungsabfrage `GET /jugendtraining` wird wie `GET /termine/…`
**nicht** je Anfrage gezählt: Wer den Bereich öffnet, stellt sie einmal, aber
regelmäßig. Eine Notbremse, die den Normalfall bremst, ist keine.

## Sichtbarkeit

| | Andere Mitglieder | Guides |
| --- | --- | --- |
| Entwürfe | unsichtbar | sichtbar |
| Zahl der Angemeldeten | ja | ja |
| Kindernamen | nur was die Eltern freigegeben haben | immer Vor- und Nachname |
| Wer zugesagt hat | nur die Zahl | namentlich |

Gespeichert wird immer der volle Name; die Wahl der Eltern steuert
ausschließlich die Anzeige. Zwei Schalter statt einem, damit „Lena M."
genauso möglich ist wie „Lena" oder gar nichts — im letzten Fall zählt das
Kind nur mit.

**Aufbewahrung:** Kindernamen werden **30 Tage nach dem Training gelöscht**.
Lang genug für Rückfragen, kurz genug, um nicht zu horten. Erledigt der
vorhandene Aufräum-Mechanismus (`api/src/aufraeumen.ts`), der schon
abgelaufene Token und Sitzungen wegräumt.

## Die App

Ein neuer Reiter oder Abschnitt **Jugend**:

- **Liste** der kommenden Trainings. Abgesagte durchgestrichen mit Grund.
- **Einzelansicht:** Datum, Uhrzeit, Ort, Hinweis, Zahl der Angemeldeten,
  Namen nach Freigabe, Knopf „Kind anmelden".
- **Anmeldeformular:** Vorname, Nachname, zwei Schalter für die Anzeige.
  Ein zweites Kind über denselben Weg.
- **Für Guides zusätzlich:** Entwürfe, das Anlegen-Formular, „Ich kann" /
  „Ich kann nicht", der Veröffentlichen-Knopf und die volle Teilnehmerliste.

Die Terminliste bleibt **unangetastet**. Ohne Netz ist der Jugendbereich leer
und sagt das auch — er ist ein Zusatz, kein Ersatz.

Fehlermeldungen kommen wie überall über einen eigenen Übersetzer
(`jugendFehler.ts`), nach dem Muster von `teilnahmeFehler.ts`: sortiert nach
dem, was die Person als Nächstes tun soll, und mit denselben Konstanten für
„nicht erreichbar" und „zu viele Versuche".

## Die Guide-Rolle setzen

Per Kommandozeile auf dem Server, wie `einladung:erzeugen`:

```bash
docker compose -f betrieb/docker-compose.yml exec api \
  npm run rolle:setzen -- vorname.nachname@example.org guide
```

Eine Benutzerverwaltung zu bauen, damit fünf Leute eine Rolle bekommen, wäre
unverhältnismäßig. Kommt der Verein je auf fünfzig Guides, ist das der
Zeitpunkt, es zu überdenken — nicht vorher.

## Was bewusst nicht gebaut wird

- **Push.** Kostet ein bezahltes Apple-Entwicklerkonto, Gerätetoken auf dem
  Server und einen weiteren Auftragsverarbeiter — und der Satz in den
  Einstellungen („es wird nichts an den Verein oder an Dritte übertragen")
  müsste weg. Der Abonnement-Schalter oben ist die Liste, an die Push später
  andockt; mehr braucht es dafür nicht vorzubereiten.
- **Die Vereinssoftware-API.** „Ich hoffe, wir bekommen die Daten" ist keine
  Grundlage. Falls sie kommt, ersetzt sie später das Anlegen von
  Mitgliedern — am Modell hier ändert das nichts.
- **Automatisches Posten in WhatsApp.** Geht nicht (siehe oben); der
  Teilen-Knopf ist die Antwort darauf, nicht ein Zwischenschritt zu etwas
  Besserem.
- **Wiederkehrende Trainings.** Sie entstehen spontan; eine Serienlogik löst
  ein Problem, das es nicht gibt.
- **Wartelisten.** Erst bauen, wenn ein Training wirklich einmal voll war.
- **Eltern-Kind-Beziehungen als eigenes Modell.** Ein Kind ist ein Name an
  einer Anmeldung, mehr nicht. Wer Kinder als Datensätze führt, muss sie auch
  pflegen und löschen.

## Rechtliches

Fällt an, sobald das erste echte Kind eingetragen wird — nicht danach:

- **Einwilligungstext für die Anzeige**, den die Eltern beim Anmelden sehen.
  Muss benennen, wer die Namen sieht (andere Vereinsmitglieder mit Konto) und
  dass Guides immer den vollen Namen bekommen.
- **Verzeichnis von Verarbeitungstätigkeiten** um diese Kategorie ergänzen:
  Namen Minderjähriger, Zweck Trainingsbetreuung, Löschung nach 30 Tagen.
- **Datenschutzerklärung** entsprechend.

## Umsetzung

Als **zwei Pläne**, weil das Ganze für einen zu groß ist und die Hälfte davon
für sich funktioniert:

1. **API und Rollen** — die drei Tabellen, die Endpunkte, die Mails, das
   CLI-Werkzeug für die Rolle. Prüfbar über `betrieb/pruefe-ablauf.sh` und
   die Rauchprobe, ohne dass die App etwas davon weiß.
2. **Die App** — der Bereich Jugend, Anmeldeformular, Guide-Ansicht, der
   Abonnement-Schalter in den Einstellungen, der Teilen-Knopf und Universal
   Links samt der kleinen Seite hinter `/t/:id`.

**Voraussetzung für beides:** Der SMTP-Zugang des Vereins muss stehen. Ohne
Mailversand gibt es weder die Guide-Anfrage noch die Absage — und damit kein
Feature, sondern nur Tabellen.
