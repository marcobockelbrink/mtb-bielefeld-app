-- Der Magic Link merkt sich, zu welcher Einladung er gehört.
--
-- Der Einladungscode wird beim Anfordern nur noch geprüft, nicht mehr
-- verbraucht. Entwertet wird er erst beim Einlösen — in derselben
-- Transaktion, in der das Mitglied entsteht. Dafür muss der Link die
-- Einladung kennen, sonst wäre beim Einlösen nicht mehr feststellbar,
-- welche Eintrittskarte gerade benutzt wird.
--
-- Darf NULL sein: Ein bestehendes Mitglied braucht keine Einladung mehr,
-- seine Adresse genügt. Genau diese Links tragen hier NULL.
ALTER TABLE magic_link
  ADD COLUMN einladung_id uuid REFERENCES einladung (id);
