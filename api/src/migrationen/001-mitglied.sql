CREATE TABLE mitglied (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  rolle        text NOT NULL DEFAULT 'mitglied'
               CHECK (rolle IN ('mitglied', 'guide', 'verwaltung')),
  angelegt_am  timestamptz NOT NULL DEFAULT now(),
  gesehen_am   timestamptz
);

-- Groß- und Kleinschreibung darf keine zwei Konten erzeugen.
CREATE UNIQUE INDEX mitglied_email_eindeutig ON mitglied (lower(email));
