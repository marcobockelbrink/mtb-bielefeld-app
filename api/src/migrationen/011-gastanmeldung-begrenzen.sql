-- Grenzen für die Gastanmeldung.
--
-- Bis hierher konnte sich eine beliebige, selbst gewählte Adresse beliebig
-- oft als Gast eintragen: Touren mit Phantomgästen füllen und dabei
-- beliebig viele Bestätigungsmails an eine fremde Adresse schicken war
-- eine Frage der Ausdauer, nicht des Zugangs. Ein Mitglied schützt der
-- Index tourenanmeldung_einmal_je_mitglied schon lange, ein Gast hatte
-- nichts Vergleichbares.

-- Dieselbe Adresse kann sich je Termin nur einmal als Gast anmelden.
-- lower(), weil "Traute@…" und "traute@…" dasselbe Postfach sind. Wie beim
-- Mitgliedsindex zählen nur aktive Zeilen: Wer storniert hat, darf sich
-- wieder anmelden.
CREATE UNIQUE INDEX tourenanmeldung_gast_einmal_je_termin
  ON tourenanmeldung (terminschluessel, lower(gast_email))
  WHERE gast_email IS NOT NULL AND storniert_am IS NULL;

-- Für das Zählfenster je Adresse über alle Termine hinweg (siehe
-- zuVieleGastanmeldungen in tourenanmeldung.ts). Ohne diesen Index läge
-- bei jeder Gastanmeldung ein Durchlauf über die ganze Tabelle in der
-- Transaktion — hinter der Beratungssperre, also für alle anderen
-- Anmeldungen zu demselben Termin spürbar. Ohne WHERE-Teil auf
-- storniert_am: Das Fenster zählt bewusst auch stornierte Zeilen mit,
-- sonst setzte ein Storno das Kontingent zurück.
CREATE INDEX tourenanmeldung_gast_adresse_zeit
  ON tourenanmeldung (lower(gast_email), angelegt_am)
  WHERE gast_email IS NOT NULL;
