-- Kennzeichnet diese Datenbank unmissverständlich als Wegwerf-Datenbank der
-- Entwicklung. Postgres führt Skripte aus diesem Ordner
-- (docker-entrypoint-initdb.d) nur beim allerersten Start eines frischen,
-- leeren Docker-Volumes aus — eine produktive Datenbank durchläuft diesen
-- Pfad nie und kann diese Tabelle deshalb nicht besitzen. Tests prüfen vor
-- jeder zerstörerischen Operation, ob sie existiert.
--
-- Eigenes Schema, bewusst getrennt von "public": Der Migrationstest baut
-- "public" bei jedem Lauf komplett neu auf (DROP SCHEMA public CASCADE),
-- damit er unabhängig von früheren Läufen ist. Läge die Markierung dort,
-- würde genau der Test, den sie schützen soll, sie bei jedem Lauf selbst
-- mit wegräumen — die Absicherung wäre nach dem ersten Testlauf wirkungslos.
CREATE SCHEMA wegwerf;

CREATE TABLE wegwerf.markierung (
  hinweis text NOT NULL DEFAULT
    'Diese Datenbank ist zum Wegwerfen da. Tests dürfen sie jederzeit leeren oder neu aufbauen.'
);

INSERT INTO wegwerf.markierung DEFAULT VALUES;
