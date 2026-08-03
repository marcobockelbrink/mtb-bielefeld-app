-- Anmeldungen zu Terminen. Die Termine selbst besitzt der Kalender —
-- hier steht nur, wer sich wozu eingetragen hat.
CREATE TABLE tourenanmeldung (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Der stabile Schlüssel aus termine.ts: bei einem Einzeltermin die uid
  -- allein, bei einem Termin aus einer Serie uid plus ursprünglicher
  -- Zeitpunkt. Bewusst Text ohne Fremdschlüssel: Es gibt keine
  -- Termintabelle, auf die er zeigen könnte.
  terminschluessel text NOT NULL,
  -- Der Startzeitpunkt, festgehalten beim Anmelden. Nur fürs Aufräumen:
  -- 30 Tage danach wird die Zeile gelöscht, ohne den Kalender zu fragen.
  termin_start     timestamptz NOT NULL,
  mitglied_id      uuid REFERENCES mitglied (id) ON DELETE CASCADE,
  gast_name        text,
  gast_email       text,
  storno_hash      text UNIQUE,
  angelegt_am      timestamptz NOT NULL,
  storniert_am     timestamptz,
  -- Entweder Mitglied oder Gast, nie beides und nie keins.
  CHECK (
    (mitglied_id IS NOT NULL AND gast_name IS NULL AND gast_email IS NULL AND storno_hash IS NULL)
    OR
    (mitglied_id IS NULL AND gast_name IS NOT NULL AND gast_email IS NOT NULL AND storno_hash IS NOT NULL)
  )
);

-- Doppelanmeldung durch Doppeltippen ist damit unmöglich, nicht nur
-- unwahrscheinlich. Nur aktive Zeilen zählen: Wer storniert hat, darf
-- sich wieder anmelden.
CREATE UNIQUE INDEX tourenanmeldung_einmal_je_mitglied
  ON tourenanmeldung (terminschluessel, mitglied_id)
  WHERE mitglied_id IS NOT NULL AND storniert_am IS NULL;

CREATE INDEX tourenanmeldung_termin
  ON tourenanmeldung (terminschluessel)
  WHERE storniert_am IS NULL;

-- Fürs Aufräumen nach Terminende.
CREATE INDEX tourenanmeldung_start ON tourenanmeldung (termin_start);
