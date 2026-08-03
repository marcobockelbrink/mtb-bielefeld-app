-- Index für das Aufräumen abgelaufener Sitzungen.
--
-- raeumeAbgelaufeneSitzungenAuf filtert mit
-- "DELETE FROM sitzung WHERE erneuerung_bis < $1". Ohne passenden Index
-- dafür liest das bei jedem Aufruf die ganze Tabelle und sperrt dabei jede
-- gefundene Zeile — bei einer Erneuerung, die jedes Gerät alle 15 Minuten
-- durchläuft, wächst das mit der Zahl der Sitzungen mit.
CREATE INDEX sitzung_erneuerung_bis ON sitzung (erneuerung_bis);
