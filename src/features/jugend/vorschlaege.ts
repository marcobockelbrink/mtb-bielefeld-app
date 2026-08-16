/**
 * Vorschläge fürs Trainings-Formular, abgelesen an den letzten Trainings.
 *
 * Aus dem Handoff „Runde 11" (11c): Ein Guide legt jede Woche ein Training
 * an, tippt jede Woche denselben Treffpunkt und stellt jede Woche dieselbe
 * Uhrzeit. Sechs gleich aussehende Felder machen daraus jedes Mal
 * Fleißarbeit. Mit Vorschlägen wird der Regelfall **dreimal Antippen ohne
 * Tastatur**.
 *
 * Die Vorschläge kommen aus `holeTrainings(api)` — der Liste, die der
 * Bildschirm ohnehin holen kann. **Kein neuer Endpunkt**, keine neue
 * Tabelle: Was der Verein tut, steht schon in seinen Daten.
 *
 * ## Zeitrechnung
 *
 * Alles hier rechnet in der **Zeitzone des Geräts**, nicht in der
 * Vereinszeitzone — und das ist Absicht, keine Nachlässigkeit: Das Formular
 * baut den Zeitpunkt am Ende mit
 * `new Date(jahr, monat, tag, stunde, minute)` zusammen, und das ist
 * Gerätezeit. Würden die Vorschläge in Vereinszeit gerechnet, hieße ein Chip
 * „Do" und träfe auf einem Telefon in anderer Zeitzone den Mittwoch.
 *
 * Tage werden über die Datumsfelder gerechnet (`getDate() + 1`), **nicht**
 * über Millisekunden. Der Unterschied zeigt sich an der Zeitumstellung: Ein
 * „Morgen" als `+ 24 * 60 * 60 * 1000` landet in der Nacht der Umstellung
 * eine Stunde daneben und damit womöglich am falschen Tag. Dieselbe Falle
 * wie bei den Serienterminen (CLAUDE.md, Falle 4).
 */

import type { Training } from '../../data/jugend';

/** Wie viele vergangene Trainings die Vorschläge tragen. */
export const BLICKFELD = 10;

/** Wie viele Vorschläge je Reihe höchstens erscheinen. */
export const HOECHSTENS = 3;

export interface DatumsVorschlag {
  /** Stabil für React-Schlüssel und Tests. */
  schluessel: string;
  label: string;
  /** Mitternacht in Gerätezeit — dieselbe Form, die der Datumswähler liefert. */
  datum: Date;
}

export interface UhrzeitVorschlag {
  schluessel: string;
  label: string;
  stunde: number;
  minute: number;
}

/** Mitternacht des Tages, in den `datum` fällt — in Gerätezeit. */
function tagesbeginn(datum: Date): Date {
  return new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
}

/**
 * Der Tag `versatz` Tage nach `datum`.
 *
 * Über die Datumsfelder, nicht über Millisekunden — siehe Dateikopf.
 */
function tagePlus(datum: Date, versatz: number): Date {
  return new Date(datum.getFullYear(), datum.getMonth(), datum.getDate() + versatz);
}

/**
 * Beschriftet einen Tag: „Di 19.8."
 *
 * Ohne `timeZone`-Angabe, also in Gerätezeit — sonst könnte die Beschriftung
 * einen anderen Tag nennen als der Wert, den der Chip setzt.
 */
function tagesLabel(datum: Date): string {
  return datum.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

/** Die jüngsten Trainings zuerst, höchstens `BLICKFELD` Stück. */
function jüngste(trainings: Training[]): Training[] {
  return [...trainings]
    .sort((a, b) => b.beginntAm.getTime() - a.beginntAm.getTime())
    .slice(0, BLICKFELD);
}

/**
 * Zählt Werte und gibt sie nach Häufigkeit sortiert zurück.
 *
 * Bei Gleichstand entscheidet, was zuerst kam — und weil die Liste jüngste
 * zuerst enthält, heißt das: das zuletzt Benutzte. Genau richtig, wenn ein
 * Verein den Treffpunkt wechselt und beide gleich oft vorkommen.
 */
function nachHaeufigkeit<T>(werte: T[]): T[] {
  const zaehler = new Map<T, { anzahl: number; platz: number }>();
  werte.forEach((wert, platz) => {
    const vorhanden = zaehler.get(wert);
    if (vorhanden) vorhanden.anzahl += 1;
    else zaehler.set(wert, { anzahl: 1, platz });
  });

  return [...zaehler.entries()]
    .sort((a, b) => b[1].anzahl - a[1].anzahl || a[1].platz - b[1].platz)
    .map(([wert]) => wert);
}

/**
 * „Heute", „Morgen" und der nächste übliche Trainingstag.
 *
 * Der dritte Vorschlag fällt weg, wenn er auf heute oder morgen fiele —
 * zwei Chips mit demselben Tag wären eine Auswahl ohne Wahl.
 */
export function datumsVorschlaege(trainings: Training[], jetzt: Date): DatumsVorschlag[] {
  const heute = tagesbeginn(jetzt);
  const morgen = tagePlus(heute, 1);

  const vorschlaege: DatumsVorschlag[] = [
    { schluessel: 'heute', label: 'Heute', datum: heute },
    { schluessel: 'morgen', label: 'Morgen', datum: morgen },
  ];

  const wochentage = jüngste(trainings).map((training) => training.beginntAm.getDay());
  const ueblich = nachHaeufigkeit(wochentage)[0];
  if (ueblich === undefined) return vorschlaege;

  // Der nächste Tag mit diesem Wochentag, frühestens übermorgen: Heute und
  // morgen haben schon ihre eigenen Chips.
  let versatz = 2;
  while (tagePlus(heute, versatz).getDay() !== ueblich) versatz += 1;
  const naechster = tagePlus(heute, versatz);

  vorschlaege.push({
    schluessel: `wochentag-${ueblich}`,
    label: tagesLabel(naechster),
    datum: naechster,
  });

  return vorschlaege;
}

/** Die zuletzt genutzten Uhrzeiten, häufigste zuerst. */
export function uhrzeitVorschlaege(trainings: Training[]): UhrzeitVorschlag[] {
  const zeiten = jüngste(trainings).map(
    (training) =>
      `${String(training.beginntAm.getHours()).padStart(2, '0')}:${String(training.beginntAm.getMinutes()).padStart(2, '0')}`,
  );

  return nachHaeufigkeit(zeiten)
    .slice(0, HOECHSTENS)
    .map((label) => {
      const [stunde, minute] = label.split(':').map(Number);
      return { schluessel: label, label, stunde: stunde!, minute: minute! };
    });
}

/**
 * Die zuletzt genutzten Treffpunkte, häufigste zuerst.
 *
 * Nebeneffekt und halber Zweck der Sache: Solange man den Ort antippt statt
 * ihn zu tippen, bleiben die Namen einheitlich. „Kalkofen",
 * „Wanderparkplatz Kalkofen" und „kalkofen" sind für die Datenbank drei
 * Orte und für einen Menschen einer.
 */
export function ortsVorschlaege(trainings: Training[]): string[] {
  const orte = jüngste(trainings)
    .map((training) => training.ort.trim())
    .filter((ort) => ort !== '');

  return nachHaeufigkeit(orte).slice(0, HOECHSTENS);
}

/**
 * Datum und Uhrzeit zu einem Zeitpunkt zusammensetzen.
 *
 * Genau die Rechnung, die vorher im Bildschirm stand — hierher gezogen,
 * damit prüfbar ist, dass ein Chip dasselbe ergibt wie der native Wähler.
 * `null`, solange eines von beidem fehlt.
 */
export function baueZeitpunkt(datum: Date | null, uhrzeit: Date | null): Date | null {
  if (!datum || !uhrzeit) return null;
  return new Date(
    datum.getFullYear(),
    datum.getMonth(),
    datum.getDate(),
    uhrzeit.getHours(),
    uhrzeit.getMinutes(),
  );
}

/**
 * Eine Uhrzeit als `Date`, wie sie der Zeitwähler liefern würde.
 *
 * Der Tagesanteil ist gleichgültig — `baueZeitpunkt` nimmt nur Stunde und
 * Minute —, aber er muss *irgendeiner* sein. Der heutige ist der
 * unverfänglichste.
 */
export function alsUhrzeit(stunde: number, minute: number, jetzt: Date): Date {
  return new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), stunde, minute);
}
