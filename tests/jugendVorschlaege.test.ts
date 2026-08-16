import { describe, expect, it } from 'vitest';

import type { Training } from '../src/data/jugend';
import {
  alsUhrzeit,
  baueZeitpunkt,
  datumsVorschlaege,
  HOECHSTENS,
  ortsVorschlaege,
  uhrzeitVorschlaege,
} from '../src/features/jugend/vorschlaege';

// Alles hier rechnet in Gerätezeit — deshalb werden die Trainings mit
// lokalen Datumsangaben gebaut, nicht mit `Z`-Zeitstempeln. Ein
// UTC-Zeitstempel hieße auf einem Rechner in einer anderen Zone ein anderer
// Wochentag, und der Test prüfte dann etwas anderes als die App tut.
function training(jahr: number, monat: number, tag: number, stunde: number, minute: number, ort: string): Training {
  return {
    id: `${jahr}-${monat}-${tag}-${stunde}${minute}`,
    beginntAm: new Date(jahr, monat - 1, tag, stunde, minute),
    endetAm: null,
    ort,
    hinweis: null,
    plaetze: null,
    guidesNoetig: 2,
    zustand: 'veroeffentlicht',
    absagegrund: null,
    belegt: 0,
  };
}

// Mittwoch, 19. August 2026.
const JETZT = new Date(2026, 7, 19, 14, 30);

describe('datumsVorschlaege', () => {
  it('bietet immer Heute und Morgen an', () => {
    const v = datumsVorschlaege([], JETZT);
    expect(v.map((e) => e.label)).toEqual(['Heute', 'Morgen']);
    expect(v[0]!.datum).toEqual(new Date(2026, 7, 19));
    expect(v[1]!.datum).toEqual(new Date(2026, 7, 20));
  });

  it('setzt die Uhrzeit auf Mitternacht — wie der Datumswähler', () => {
    // Sonst schleppte der Chip die aktuelle Uhrzeit mit, und `baueZeitpunkt`
    // nähme zwar nur den Tag, aber ein Entwurf sähe seltsam aus.
    const heute = datumsVorschlaege([], JETZT)[0]!.datum;
    expect([heute.getHours(), heute.getMinutes(), heute.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('schlägt zusätzlich den üblichen Trainingstag vor', () => {
    // Vier Dienstage, zwei Donnerstage → Dienstag ist der übliche Tag.
    const trainings = [
      training(2026, 8, 18, 17, 30, 'Kalkofen'), // Di
      training(2026, 8, 11, 17, 30, 'Kalkofen'), // Di
      training(2026, 8, 4, 17, 30, 'Kalkofen'), // Di
      training(2026, 7, 28, 17, 30, 'Kalkofen'), // Di
      training(2026, 8, 13, 18, 0, 'Johannisberg'), // Do
      training(2026, 8, 6, 18, 0, 'Johannisberg'), // Do
    ];

    const v = datumsVorschlaege(trainings, JETZT);
    expect(v).toHaveLength(3);
    // Der nächste Dienstag nach Mittwoch dem 19. ist der 25.
    expect(v[2]!.datum).toEqual(new Date(2026, 7, 25));
    expect(v[2]!.schluessel).toBe('wochentag-2');
  });

  it('lässt den dritten Vorschlag weg, wenn er auf heute oder morgen fiele', () => {
    // Übliche Tage: Donnerstag. Heute ist Mittwoch, morgen Donnerstag —
    // ein dritter Chip mit demselben Tag wäre eine Auswahl ohne Wahl.
    const donnerstage = [
      training(2026, 8, 13, 18, 0, 'Kalkofen'),
      training(2026, 8, 6, 18, 0, 'Kalkofen'),
    ];
    const v = datumsVorschlaege(donnerstage, JETZT);
    // Der nächste Donnerstag frühestens übermorgen ist der 27., nicht der 20.
    expect(v[2]!.datum).toEqual(new Date(2026, 7, 27));
    expect(v[2]!.datum.getDay()).toBe(4);
  });

  it('springt bei „Morgen" korrekt über einen Monatswechsel', () => {
    const silvester = new Date(2026, 11, 31, 20, 0);
    expect(datumsVorschlaege([], silvester)[1]!.datum).toEqual(new Date(2027, 0, 1));
  });

  it('trifft über die Zeitumstellung hinweg den richtigen Tag', () => {
    // In Deutschland endet die Sommerzeit am 25.10.2026. Ein „Morgen" als
    // `+ 24 * 60 * 60 * 1000` läge in dieser Nacht eine Stunde daneben und
    // damit womöglich am falschen Tag. Über die Datumsfelder gerechnet
    // stimmt es — dieselbe Falle wie bei den Serienterminen.
    const vorher = new Date(2026, 9, 24, 23, 30);
    const morgen = datumsVorschlaege([], vorher)[1]!.datum;
    expect(morgen.getDate()).toBe(25);
    expect(morgen.getMonth()).toBe(9);
    expect(morgen.getHours()).toBe(0);
  });
});

describe('uhrzeitVorschlaege', () => {
  it('sortiert nach Häufigkeit', () => {
    const trainings = [
      training(2026, 8, 18, 17, 30, 'A'),
      training(2026, 8, 11, 18, 0, 'A'),
      training(2026, 8, 4, 17, 30, 'A'),
      training(2026, 7, 28, 17, 30, 'A'),
    ];
    expect(uhrzeitVorschlaege(trainings).map((u) => u.label)).toEqual(['17:30', '18:00']);
  });

  it('füllt die Stunde mit einer Null auf', () => {
    expect(uhrzeitVorschlaege([training(2026, 8, 18, 9, 5, 'A')])[0]!.label).toBe('09:05');
  });

  it('zerlegt die Beschriftung wieder in Stunde und Minute', () => {
    const [erster] = uhrzeitVorschlaege([training(2026, 8, 18, 9, 5, 'A')]);
    expect([erster!.stunde, erster!.minute]).toEqual([9, 5]);
  });

  it('bietet höchstens drei an', () => {
    const trainings = [17, 18, 19, 20, 21].map((h) => training(2026, 8, h, h, 0, 'A'));
    expect(uhrzeitVorschlaege(trainings)).toHaveLength(HOECHSTENS);
  });

  it('bevorzugt bei Gleichstand die zuletzt genutzte Zeit', () => {
    // Beide einmal — dann soll die jüngere vorn stehen. Genau der Fall,
    // wenn ein Verein die Zeit gerade umstellt.
    const trainings = [
      training(2026, 8, 18, 18, 0, 'A'), // jünger
      training(2026, 8, 11, 17, 30, 'A'),
    ];
    expect(uhrzeitVorschlaege(trainings)[0]!.label).toBe('18:00');
  });

  it('kommt mit einer leeren Liste zurecht', () => {
    expect(uhrzeitVorschlaege([])).toEqual([]);
  });
});

describe('ortsVorschlaege', () => {
  it('sortiert nach Häufigkeit und lässt Leeres weg', () => {
    const trainings = [
      training(2026, 8, 18, 17, 30, 'Kalkofen'),
      training(2026, 8, 11, 17, 30, 'Johannisberg'),
      training(2026, 8, 4, 17, 30, 'Kalkofen'),
      training(2026, 7, 28, 17, 30, '   '),
    ];
    expect(ortsVorschlaege(trainings)).toEqual(['Kalkofen', 'Johannisberg']);
  });

  it('schneidet Leerzeichen ab, damit derselbe Ort einer bleibt', () => {
    const trainings = [
      training(2026, 8, 18, 17, 30, ' Kalkofen'),
      training(2026, 8, 11, 17, 30, 'Kalkofen '),
    ];
    expect(ortsVorschlaege(trainings)).toEqual(['Kalkofen']);
  });
});

describe('baueZeitpunkt', () => {
  it('nimmt den Tag vom Datum und die Zeit von der Uhrzeit', () => {
    const zeitpunkt = baueZeitpunkt(new Date(2026, 7, 20), new Date(2026, 0, 1, 17, 30));
    expect(zeitpunkt).toEqual(new Date(2026, 7, 20, 17, 30));
  });

  it('ergibt aus Chips dasselbe wie aus den nativen Wählern', () => {
    // **Die Zusage des ganzen Umbaus.** Wenn hier etwas abwiche, entstünden
    // je nach Bedienweg verschiedene Trainings — und niemand käme darauf.
    const ausChips = baueZeitpunkt(
      datumsVorschlaege([], JETZT)[1]!.datum, // „Morgen"
      alsUhrzeit(17, 30, JETZT),
    );
    const ausWaehlern = baueZeitpunkt(
      new Date(2026, 7, 20), // der Datumswähler liefert Mitternacht
      new Date(2026, 7, 19, 17, 30), // der Zeitwähler liefert den heutigen Tag
    );
    expect(ausChips).toEqual(ausWaehlern);
    expect(ausChips).toEqual(new Date(2026, 7, 20, 17, 30));
  });

  it('bleibt an der Zeitumstellung bei der gewählten Uhrzeit', () => {
    // 25.10.2026, der Tag der Rückstellung: 17:30 bleibt 17:30, egal wie
    // viele Stunden die Nacht davor hatte.
    const zeitpunkt = baueZeitpunkt(new Date(2026, 9, 25), alsUhrzeit(17, 30, JETZT));
    expect(zeitpunkt!.getHours()).toBe(17);
    expect(zeitpunkt!.getMinutes()).toBe(30);
    expect(zeitpunkt!.getDate()).toBe(25);
  });

  it('gibt null, solange eines von beidem fehlt', () => {
    expect(baueZeitpunkt(null, new Date())).toBeNull();
    expect(baueZeitpunkt(new Date(), null)).toBeNull();
  });
});
