/**
 * Die Zeile „Zuletzt geändert" unter einem Jugendtraining.
 *
 * Punkt 5 aus Handoff 12/13 (12b). Seit dem Bearbeiten-Bildschirm kann ein
 * Guide Zeit, Ort, Hinweis und Plätze eines veröffentlichten Trainings
 * ändern; die angemeldeten Familien bekommen auf Wunsch eine Mail —
 * **wer sie übersieht, sah bisher nichts.** In der App stand der neue Stand
 * da, als wäre er immer so gewesen.
 *
 * Reine Rechenlogik ohne React Native, damit sie ohne Gerät prüfbar bleibt.
 */

/** Wie lange „gerade eben" dauert, bevor eine Uhrzeit dasteht. */
const GERADE_EBEN_MS = 5 * 60 * 1000;

function uhrzeit(zeitpunkt: Date): string {
  return `${String(zeitpunkt.getHours()).padStart(2, '0')}:${String(zeitpunkt.getMinutes()).padStart(2, '0')}`;
}

function istSelberTag(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/**
 * „Geändert gestern 19:04 · Marco" — oder `null`, wenn nie geändert wurde.
 *
 * Der Name steht hinten und fällt weg, wenn er fehlt: `geaendert_von` zeigt
 * mit `ON DELETE SET NULL` auf das Mitglied, ein gelöschtes Konto lässt
 * also „geändert am …" ohne Namen übrig. Das ist ehrlicher als ein
 * erfundener — und besser als die ganze Zeile zu verschlucken, denn die
 * Änderung hat ja stattgefunden.
 */
export function beschreibeAenderung(
  geaendertAm: Date | null | undefined,
  geaendertVon: string | null | undefined,
  jetzt: Date,
): string | null {
  if (!geaendertAm) return null;

  const abstand = jetzt.getTime() - geaendertAm.getTime();
  let wann: string;

  if (abstand >= 0 && abstand < GERADE_EBEN_MS) {
    wann = 'gerade eben';
  } else if (istSelberTag(geaendertAm, jetzt)) {
    wann = `heute ${uhrzeit(geaendertAm)}`;
  } else if (istSelberTag(geaendertAm, new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 1))) {
    wann = `gestern ${uhrzeit(geaendertAm)}`;
  } else {
    // Älter als gestern: Das Datum sagt mehr als „vor elf Tagen", weil man
    // es mit dem eigenen Kalender vergleichen kann.
    wann = `${geaendertAm.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} ${uhrzeit(geaendertAm)}`;
  }

  const name = geaendertVon?.trim();
  return name ? `Geändert ${wann} · ${name}` : `Geändert ${wann}`;
}
