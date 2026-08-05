-- Der Abonnement-Schalter. Eine Spalte statt einer eigenen Tabelle: Für ein
-- Ja/Nein je Mitglied wäre alles andere Aufwand ohne Gegenwert.
ALTER TABLE mitglied
  ADD COLUMN jugend_benachrichtigung boolean NOT NULL DEFAULT false;

CREATE TABLE jugendtraining (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beginnt_am         timestamptz NOT NULL,
  endet_am           timestamptz,
  ort                text NOT NULL,
  hinweis            text,
  plaetze            integer,
  guides_noetig      integer NOT NULL DEFAULT 2,
  zustand            text NOT NULL DEFAULT 'entwurf'
                     CHECK (zustand IN ('entwurf', 'veroeffentlicht', 'abgesagt')),
  absagegrund        text,
  angelegt_von       uuid NOT NULL REFERENCES mitglied(id),
  angelegt_am        timestamptz NOT NULL DEFAULT now(),
  veroeffentlicht_am timestamptz,
  abgesagt_am        timestamptz,

  -- Ein Zustand ohne seinen Zeitstempel ist ein halber Zustand: Wer später
  -- „wann ging das online?" fragt, bekäme NULL und wüsste nicht, ob die
  -- Angabe fehlt oder der Zustand falsch gesetzt wurde.
  CONSTRAINT jugendtraining_veroeffentlicht_hat_zeit
    CHECK (zustand <> 'veroeffentlicht' OR veroeffentlicht_am IS NOT NULL),
  CONSTRAINT jugendtraining_absage_hat_grund
    CHECK (zustand <> 'abgesagt' OR (abgesagt_am IS NOT NULL AND absagegrund IS NOT NULL)),
  CONSTRAINT jugendtraining_plaetze_positiv
    CHECK (plaetze IS NULL OR plaetze > 0)
);

CREATE INDEX jugendtraining_kommend ON jugendtraining (beginnt_am);

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
  -- 1 oder 2. Beim Einfügen wird der erste freie Wert genommen; zusammen mit
  -- dem Teilindex unten setzt das die Grenze in der Datenbank durch, statt in
  -- einer Zählung, die zwei gleichzeitige Anfragen beide bestehen.
  platz          smallint NOT NULL CHECK (platz IN (1, 2)),
  -- Was andere Mitglieder sehen. Guides sehen immer beides.
  zeigt_vorname  boolean NOT NULL DEFAULT true,
  zeigt_nachname boolean NOT NULL DEFAULT false,
  angelegt_am    timestamptz NOT NULL DEFAULT now(),
  storniert_am   timestamptz,

  CONSTRAINT jugendtraining_kind_namen_nicht_leer
    CHECK (length(btrim(vorname)) > 0 AND length(btrim(nachname)) > 0)
);

CREATE UNIQUE INDEX jugendtraining_kind_hoechstens_zwei
  ON jugendtraining_kind (training_id, mitglied_id, platz)
  WHERE storniert_am IS NULL;

CREATE INDEX jugendtraining_kind_je_training
  ON jugendtraining_kind (training_id)
  WHERE storniert_am IS NULL;
