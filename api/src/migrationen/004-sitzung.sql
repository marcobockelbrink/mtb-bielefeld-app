CREATE TABLE sitzung (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mitglied_id       uuid NOT NULL REFERENCES mitglied (id) ON DELETE CASCADE,
  zugang_hash       text NOT NULL UNIQUE,
  erneuerung_hash   text NOT NULL UNIQUE,
  zugang_bis        timestamptz NOT NULL,
  erneuerung_bis    timestamptz NOT NULL,
  angelegt_am       timestamptz NOT NULL DEFAULT now(),
  -- Gesetzt, sobald das Erneuerungs-Token benutzt wurde. Taucht es danach
  -- noch einmal auf, wurde es kopiert.
  ersetzt_am        timestamptz
);

CREATE INDEX sitzung_mitglied ON sitzung (mitglied_id);
