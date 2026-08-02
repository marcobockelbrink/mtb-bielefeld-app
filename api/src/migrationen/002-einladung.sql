CREATE TABLE einladung (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash         text NOT NULL UNIQUE,
  ausgestellt_fuer  text NOT NULL,
  ausgestellt_am    timestamptz NOT NULL DEFAULT now(),
  gueltig_bis       timestamptz NOT NULL,
  eingeloest_am     timestamptz,
  eingeloest_von    uuid REFERENCES mitglied (id) ON DELETE SET NULL
);

CREATE INDEX einladung_offen ON einladung (code_hash) WHERE eingeloest_am IS NULL;
