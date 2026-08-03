-- Ohne diesen Index liest das Aufräumen jedes Mal die ganze Tabelle.
-- Dieselbe Lehre wie bei `sitzung_erneuerung_bis`: Wer nach einer Frist
-- löscht, braucht einen Index auf die Frist.
CREATE INDEX magic_link_gueltig_bis ON magic_link (gueltig_bis);
