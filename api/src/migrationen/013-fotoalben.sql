-- Fotoalben: sammeln, sichten, weiterverwenden.
--
-- Die Bilddateien liegen **nicht** hier, sondern auf einem Docker-Volume.
-- In der Datenbank steht, was sie bedeuten — wer sie hochgeladen hat, ob sie
-- freigegeben sind, zu welchem Ereignis sie gehören. Bilder in Postgres wären
-- bequem und würden jede Sicherung und jede Abfrage mitschleppen.

CREATE TABLE fotoalbum (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titel             text NOT NULL,
  beschreibung      text,

  -- Das Datum des Ereignisses, nicht des Anlegens. Danach wird sortiert und
  -- danach sucht auch ein Mensch: „die Sommertour" ist ein Datum, kein
  -- Zeitpunkt, an dem jemand ein Album erstellt hat.
  ereignis_am       date NOT NULL,

  -- Optional. Rennen, bei denen der Verein antritt, stehen nicht im
  -- Vereinskalender — ein Album ohne Termin ist deshalb kein Sonderfall,
  -- sondern der halbe Anwendungsfall. Kein Fremdschlüssel: Termine kommen
  -- aus dem Google-Kalender und haben in dieser Datenbank keine Tabelle.
  termin_schluessel text,

  -- Wer freigegebene Bilder sehen darf. Ob das der ganze Verein sein soll
  -- oder nur die Jugend, ist eine Vereinsentscheidung und noch nicht
  -- gefallen. Deshalb ein Feld und keine Annahme im Quelltext: Fällt der
  -- Beschluss anders aus, ändert sich ein Wert, kein Code.
  sichtbarkeit      text NOT NULL DEFAULT 'mitglieder'
                    CHECK (sichtbarkeit IN ('mitglieder', 'jugend')),

  -- `offen` heißt: hochladen möglich. `geschlossen`: nur noch ansehen.
  zustand           text NOT NULL DEFAULT 'offen'
                    CHECK (zustand IN ('offen', 'geschlossen')),

  -- Das Upload-Fenster schließt sich von allein. Ohne das steht in zwei
  -- Jahren die Frage im Raum, ob jemand noch Bilder nachwerfen darf, und
  -- niemand mag sie beantworten.
  hochladen_bis     timestamptz,

  -- ON DELETE SET NULL statt CASCADE: Wird das Titelbild gelöscht, verliert
  -- das Album sein Titelbild — nicht seine 119 anderen Fotos.
  titelbild_id      uuid,

  angelegt_von      uuid NOT NULL REFERENCES mitglied(id),
  angelegt_am       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fotoalbum_titel_nicht_leer CHECK (length(btrim(titel)) > 0)
);

CREATE INDEX fotoalbum_nach_ereignis ON fotoalbum (ereignis_am DESC);

-- Ein Termin hat höchstens ein Album. Zwei Alben zum selben Termin wären
-- zwei Orte für dieselben Bilder, und Bilder verteilen sich dann auf beide.
CREATE UNIQUE INDEX fotoalbum_je_termin
  ON fotoalbum (termin_schluessel)
  WHERE termin_schluessel IS NOT NULL;

CREATE TABLE foto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id         uuid NOT NULL REFERENCES fotoalbum(id) ON DELETE CASCADE,
  hochgeladen_von  uuid NOT NULL REFERENCES mitglied(id),
  hochgeladen_am   timestamptz NOT NULL DEFAULT now(),

  -- Aus dem EXIF gerettet, **bevor** die Metadaten aus der Datei fliegen.
  -- Danach ist sie fort, und die Sortierung nach Aufnahmezeit ist genau
  -- das, was aus 300 Bildern einer Wochentour den Ablauf der Woche macht.
  aufgenommen_am   timestamptz,

  zustand          text NOT NULL DEFAULT 'neu'
                   CHECK (zustand IN ('neu', 'freigegeben', 'abgelehnt')),
  entschieden_von  uuid REFERENCES mitglied(id),
  entschieden_am   timestamptz,

  -- Die Auswahl der Verwaltung für die Vereinsseite. Getrennt von der
  -- Freigabe, weil das zwei Entscheidungen sind: „darf gezeigt werden" und
  -- „nehmen wir". Später ist genau dieses Feld die Ausnahme vom
  -- automatischen Löschen.
  fuer_homepage    boolean NOT NULL DEFAULT false,

  -- SHA-256 des Originals. Bei einem Event laden drei Leute dieselben
  -- Bilder aus derselben WhatsApp-Gruppe hoch; der eindeutige Index unten
  -- macht daraus stillschweigend eines.
  pruefsumme       text NOT NULL,

  bytes            bigint NOT NULL CHECK (bytes > 0),
  breite           integer CHECK (breite IS NULL OR breite > 0),
  hoehe            integer CHECK (hoehe IS NULL OR hoehe > 0),

  -- Vorbereitet, noch ungenutzt: Der Aufräumjob für die 31 Tage kommt
  -- später. Das Feld jetzt anzulegen kostet nichts und erspart eine
  -- Migration auf einer Tabelle, in der dann schon Bilder liegen.
  loeschen_ab      timestamptz,

  -- Ein Zustand ohne seinen Zeitstempel ist ein halber Zustand — dieselbe
  -- Begründung wie bei `jugendtraining`: Wer später fragt „wann wurde das
  -- freigegeben?", bekäme NULL und wüsste nicht, ob die Angabe fehlt oder
  -- der Zustand falsch gesetzt wurde.
  CONSTRAINT foto_entscheidung_hat_zeit
    CHECK (zustand = 'neu' OR (entschieden_am IS NOT NULL AND entschieden_von IS NOT NULL)),

  -- Ein abgelehntes Bild auf der Vereinsseite wäre der Widerspruch, den
  -- niemand bemerkt, bis er auf der Startseite steht.
  CONSTRAINT foto_homepage_nur_freigegeben
    CHECK (fuer_homepage = false OR zustand = 'freigegeben')
);

ALTER TABLE fotoalbum
  ADD CONSTRAINT fotoalbum_titelbild_fk
  FOREIGN KEY (titelbild_id) REFERENCES foto(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX foto_keine_doppelten
  ON foto (album_id, pruefsumme);

-- Die Sichtung filtert genau danach: „zeig mir alles Neue in diesem Album".
CREATE INDEX foto_je_album_und_zustand ON foto (album_id, zustand);

-- Für „meine Uploads", die der Hochladende sofort sieht, auch unfreigegeben.
CREATE INDEX foto_je_hochladender ON foto (hochgeladen_von);

CREATE TABLE foto_meldung (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  foto_id     uuid NOT NULL REFERENCES foto(id) ON DELETE CASCADE,
  mitglied_id uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  grund       text,
  gemeldet_am timestamptz NOT NULL DEFAULT now(),

  -- Zweimal melden hilft niemandem und macht die Liste der Verwaltung
  -- länger, nicht dringlicher.
  UNIQUE (foto_id, mitglied_id)
);
