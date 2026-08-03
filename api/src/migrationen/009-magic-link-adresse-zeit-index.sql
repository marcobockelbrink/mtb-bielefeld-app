-- Die Begrenzung zählt je Adresse in einem Zeitfenster. Ohne diesen Index
-- läse sie dafür die ganze Tabelle — bei jedem Anmeldeversuch.
CREATE INDEX magic_link_adresse_zeit ON magic_link (lower(email), angelegt_am);
