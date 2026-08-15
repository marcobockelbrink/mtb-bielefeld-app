-- Familienprofile: Ein Mitglied legt Profile für seine Kinder selbst an.
--
-- Der Grund: Kinder haben oft keine eigene Mailadresse, und die Verwaltung
-- soll nicht jedes Kind einzeln einladen müssen. Wer ein Profil verwaltet,
-- darf dessen Namen, Geburtsjahr und Rechte ändern — **nicht** dessen
-- Rolle. Rollen bleiben Sache der Vereinsverwaltung; sonst könnte sich
-- jeder über ein angelegtes Kind selbst Rechte verschaffen.
--
-- `verwaltet_von` ist `uuid` und nicht `integer` wie im Entwurf skizziert:
-- `mitglied.id` ist eine UUID (001-mitglied.sql), ein integer-Fremdschlüssel
-- ließe sich gar nicht anlegen.
-- `name` gab es bisher nicht: Konten hingen allein an der Mailadresse.
-- Für Familienprofile und Avatare braucht es einen Anzeigenamen — ein Kind
-- heißt „Mika", nicht „mika.a3f9@familie.mtb-bielefeld.de". Bestehende
-- Konten haben `NULL`; die Oberfläche fällt dann auf die Adresse zurück.
ALTER TABLE mitglied
  ADD COLUMN name text NULL,
  ADD COLUMN verwaltet_von uuid NULL REFERENCES mitglied(id) ON DELETE SET NULL,
  ADD COLUMN geburtsjahr integer NULL,
  -- Voreinstellung `true`: Der Normalfall ist ein erwachsenes Mitglied, das
  -- hochladen darf. Kinderprofile setzen den Wert beim Anlegen auf `false`.
  ADD COLUMN kann_bilder_hochladen boolean NOT NULL DEFAULT true,
  ADD COLUMN avatar_url text NULL;

-- Ein Profil kann nicht sich selbst verwalten.
ALTER TABLE mitglied
  ADD CONSTRAINT mitglied_verwaltet_nicht_sich_selbst CHECK (verwaltet_von IS NULL OR verwaltet_von <> id);

ALTER TABLE mitglied
  ADD CONSTRAINT mitglied_geburtsjahr_plausibel
  CHECK (geburtsjahr IS NULL OR (geburtsjahr BETWEEN 1900 AND 2100));

CREATE INDEX mitglied_verwaltet_von_idx ON mitglied (verwaltet_von);
