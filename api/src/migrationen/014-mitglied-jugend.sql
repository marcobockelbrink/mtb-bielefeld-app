-- Jugend-Zugehörigkeit als gepflegtes Feld statt nur als Herleitung.
--
-- Bisher galt: Wer je ein Kind zu einem Training angemeldet hat, zählt zur
-- Jugend (`gehoertZurJugend` in fotoalbum.ts — bewusst die eine Stelle für
-- diese vorläufige Antwort). Das bleibt als ODER bestehen; dieses Feld ist
-- die ausdrückliche Zuteilung durch die Verwaltung, etwa für Jugendliche
-- mit eigenem Konto oder Betreuer ohne angemeldetes Kind.
ALTER TABLE mitglied
  ADD COLUMN jugend boolean NOT NULL DEFAULT false;
