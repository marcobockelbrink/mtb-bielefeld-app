-- Bildrechte: die Einwilligung als Datensatz am Kind (Handoff 15).
--
-- Bisher lief sie über ein MS-Forms-Formular mit Freitext-Namen — Abgleich
-- gegen die Kinderliste von Hand, Widerruf per E-Mail.
--
-- ## Warum eine eigene Tabelle und kein Feld am Mitglied
--
-- Ein Feld wird überschrieben. Der Handoff verlangt aber, dass bei einer
-- neuen Textversion „die alte Antwort als Historie erhalten bleibt" — und
-- bei einem Widerruf will man später nachsehen können, wer wann was gesagt
-- hat. Eine Zeile je Antwort, **nur angehängt, nie geändert**.
--
-- Der aktuelle Stand ist damit die jüngste Zeile zur aktuellen Textversion.
-- Dass eine Textänderung alle Antworten auf „offen" zurückwirft, fällt so
-- von selbst heraus: Zum neuen Text gibt es noch keine Zeile. Ohne dass
-- irgendwo etwas gelöscht würde.
CREATE TABLE einwilligung_bild (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- **Die Reihenfolge, in der die Zeilen entstanden sind.**
  --
  -- Sortiert wird danach und nicht nach `angelegt_am`: Zwei Antworten in
  -- derselben Millisekunde tragen dieselbe Zeitmarke, und dann ist „die
  -- jüngste" nicht bestimmt — Postgres darf beide Reihenfolgen liefern.
  --
  -- Das ist kein Gedankenspiel. Genau daran ist ein Test gescheitert, der
  -- eine feste Uhr benutzt und zweimal hintereinander antwortet: Er lief
  -- einmal grün und einmal rot, ohne dass sich etwas geändert hatte. Im
  -- Betrieb wäre es seltener und schlimmer — eine widerrufene Einwilligung
  -- könnte als erteilt erscheinen.
  --
  -- Eine UUID taugt dafür nicht: `gen_random_uuid()` ist zufällig, nicht
  -- aufsteigend.
  nr            bigserial NOT NULL,
  -- Das Kind. `ON DELETE CASCADE`: Wird das Profil gelöscht, hat die
  -- Einwilligung keinen Gegenstand mehr — sie aufzubewahren wäre das
  -- Gegenteil von Datenschutz.
  kind_id       uuid NOT NULL REFERENCES mitglied(id) ON DELETE CASCADE,
  -- 'erteilt' entsteht in der App, 'abgelehnt' und 'widerrufen' nur in der
  -- Verwaltung (siehe `einwilligung.ts`). 'offen' steht hier nie: Das ist
  -- die Abwesenheit einer Zeile, kein Eintrag.
  status        text NOT NULL CHECK (status IN ('erteilt', 'abgelehnt', 'widerrufen')),
  -- Welcher Fassung des Textes zugestimmt wurde. Ändert sich der Text,
  -- zählt die alte Zustimmung nicht mehr — sie bleibt aber stehen.
  text_version  text NOT NULL,
  -- Wer die Zeile ausgelöst hat: das Elternkonto, das Jugendkonto oder das
  -- Verwaltungskonto. `ON DELETE SET NULL` wie bei `angelegt_von`: Ein
  -- gelöschtes Konto darf die Einwilligung nicht mitnehmen.
  bestaetigt_von uuid REFERENCES mitglied(id) ON DELETE SET NULL,
  -- Die zweite Stimme ab 13 (Jahresgrenze, siehe `einwilligung.ts`).
  -- `jugend_bestaetigt_von` ist das eigene Konto des Kindes — oder NULL,
  -- wenn die Eltern das Häkchen „<Name> stimmt zu" gesetzt haben.
  jugend_bestaetigt      boolean NOT NULL DEFAULT false,
  jugend_bestaetigt_von  uuid REFERENCES mitglied(id) ON DELETE SET NULL,
  -- Aus der App oder aus dem alten Forms-Bestand von Hand abgehakt.
  quelle        text NOT NULL DEFAULT 'app' CHECK (quelle IN ('app', 'forms-import')),
  angelegt_am   timestamptz NOT NULL DEFAULT now()
);

-- Der Zugriff geht immer „welche Zeilen hat dieses Kind, jüngste zuerst".
CREATE INDEX einwilligung_bild_kind ON einwilligung_bild (kind_id, nr DESC);

-- Die Verknüpfung von einer Trainingsanmeldung zum Kindprofil.
--
-- **Nullbar, und das ist der Punkt.** Eine Anmeldung ist Freitext: Vorname,
-- Nachname und das Elternkonto. Ein Familienprofil füllt das Formular nur
-- vor. Wer ein Nachbarskind mitbringt, tippt den Namen — und soll das
-- weiter können.
--
-- Ohne Verknüpfung gibt es aber keinen Weg von der Teilnehmerliste zur
-- Einwilligung. Solche Anmeldungen gelten deshalb dauerhaft als „keine
-- Fotos", nach derselben Regel wie eine fehlende Antwort: Für dieses Kind
-- hat wirklich niemand eingewilligt.
--
-- `ON DELETE SET NULL`: Wird das Profil gelöscht, bleibt die Anmeldung
-- bestehen (der Platz ist belegt, der Name steht da) — nur die Verknüpfung
-- fällt weg, und damit gilt wieder „keine Fotos".
ALTER TABLE jugendtraining_kind
  ADD COLUMN kind_mitglied_id uuid REFERENCES mitglied(id) ON DELETE SET NULL;
