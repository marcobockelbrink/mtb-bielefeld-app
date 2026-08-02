-- Die Adresse auf einer Einladung muss verschwinden können.
--
-- Löscht ein Mitglied sein Konto, darf seine Adresse nirgends
-- zurückbleiben. Die Einladungszeile selbst soll aber bleiben: Der Verein
-- soll nachvollziehen können, dass ein Code ausgestellt und eingelöst
-- wurde. Dafür braucht er die personenbezogene Angabe nicht — also wird
-- sie auf NULL gesetzt statt die Zeile zu löschen.
--
-- Solange die Spalte NOT NULL ist, geht das nicht.
ALTER TABLE einladung
  ALTER COLUMN ausgestellt_fuer DROP NOT NULL;
