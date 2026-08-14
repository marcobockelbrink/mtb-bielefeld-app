-- Jugend-Guide als eigenes Feld neben `jugend`.
--
-- Im Verein macht einer oft beides: Touren führen **und** Jugendtraining.
-- Das Rollenfeld ist ein Entweder-oder (mitglied/guide/verwaltung) und
-- taugt dafür nicht — es umzubauen hieße, die Hierarchie aus `rolle.ts`
-- aufzugeben, an der Trainings, Fotos und die Verwaltung hängen. Ein
-- boolesches Feld daneben kostet nichts und erlaubt jede Kombination.
--
-- Dasselbe Muster wie `jugend` (Migration 014), aus demselben Grund.
ALTER TABLE mitglied
  ADD COLUMN jugend_guide boolean NOT NULL DEFAULT false;
