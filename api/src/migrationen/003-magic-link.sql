CREATE TABLE magic_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  email         text NOT NULL,
  angelegt_am   timestamptz NOT NULL DEFAULT now(),
  gueltig_bis   timestamptz NOT NULL,
  verbraucht_am timestamptz
);

CREATE INDEX magic_link_offen ON magic_link (token_hash) WHERE verbraucht_am IS NULL;
