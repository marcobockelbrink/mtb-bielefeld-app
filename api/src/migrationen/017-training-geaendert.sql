-- „Zuletzt geändert" am Jugendtraining — Punkt 5 aus Handoff 12/13 (12b).
--
-- Seit dem Bearbeiten-Bildschirm kann ein Guide Zeit, Ort, Hinweis und
-- Plätze eines veröffentlichten Trainings ändern. Die angemeldeten Familien
-- bekommen auf Wunsch eine Mail — **wer sie übersieht, sah bisher nichts**.
-- In der App stand der neue Stand da, als wäre er immer so gewesen.
--
-- Deshalb zwei Spalten. Sie beantworten die Frage, die sich beim Blick auf
-- eine Karte stellt, deren Uhrzeit man anders in Erinnerung hat: *Hat sich
-- das geändert, oder irre ich mich?*
--
-- `NULL` heißt „seit dem Anlegen unverändert" und ist der Normalfall — auch
-- für alle Trainings, die es vor dieser Migration schon gab. Ein Vorgabewert
-- `now()` wäre bequemer und gelogen: Er behauptete eine Änderung, die nie
-- stattfand.
--
-- `geaendert_von` zeigt auf `mitglied` mit `ON DELETE SET NULL`, wie
-- `angelegt_von` in 012: Ein gelöschtes Konto soll das Training nicht
-- mitnehmen. Übrig bleibt dann „geändert am …", ohne Namen — das ist
-- ehrlicher als ein erfundener.
ALTER TABLE jugendtraining
  ADD COLUMN geaendert_am timestamptz NULL,
  ADD COLUMN geaendert_von uuid NULL REFERENCES mitglied(id) ON DELETE SET NULL;
