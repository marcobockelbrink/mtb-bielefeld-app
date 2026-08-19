import { describe, expect, it } from 'vitest';

import {
  ausJson,
  guidesAusEntwurf,
  hatInhalt,
  istFrisch,
  plaetzeAusEntwurf,
  zahlInEntwurf,
  type TrainingsEntwurf,
} from '../src/features/jugend/entwurf';

const JETZT = new Date('2026-08-16T12:00:00Z');

function entwurf(teil: Partial<TrainingsEntwurf> = {}): TrainingsEntwurf {
  return {
    datum: null,
    uhrzeit: null,
    ort: '',
    hinweis: '',
    plaetze: '',
    guidesNoetig: '2',
    standAm: JETZT.getTime(),
    ...teil,
  };
}

describe('hatInhalt', () => {
  it('hält ein unangetastetes Formular für leer', () => {
    expect(hatInhalt(entwurf())).toBe(false);
  });

  it('zählt das vorbelegte Guides-Feld nicht als Inhalt', () => {
    // Sonst wäre jedes einmal geöffnete Formular ein „Entwurf", und die
    // Rückfrage käme, ohne dass jemand etwas getippt hätte.
    expect(hatInhalt(entwurf({ guidesNoetig: '3' }))).toBe(false);
  });

  it('erkennt jedes wirklich gefüllte Feld', () => {
    expect(hatInhalt(entwurf({ ort: 'Eisgrund' }))).toBe(true);
    expect(hatInhalt(entwurf({ datum: '2026-09-01T00:00:00.000Z' }))).toBe(true);
    expect(hatInhalt(entwurf({ plaetze: '8' }))).toBe(true);
  });

  it('hält reine Leerzeichen nicht für Inhalt', () => {
    expect(hatInhalt(entwurf({ ort: '   ' }))).toBe(false);
  });

  /**
   * **Die Falle an der Vorbelegung** (Handoff 14): Seit das Formular auf
   * dem nächsten Sonntag um 10:30 startet, sind `datum` und `uhrzeit`
   * gesetzt, ohne dass jemand etwas getan hat. Ohne die zweite Angabe
   * gälte jedes einmal geöffnete Formular als Entwurf — und beim nächsten
   * Anlegen fragte die App nach einem „gefundenen Entwurf", der nur aus der
   * eigenen Voreinstellung besteht.
   *
   * Ein Hinweis, den man dreimal wegtippt, wird beim vierten Mal auch dann
   * weggetippt, wenn wirklich etwas drinsteht.
   */
  const vorbelegung = {
    datum: '2026-08-23T00:00:00.000Z',
    uhrzeit: '2026-08-19T08:30:00.000Z',
  };

  it('zählt die vorbelegten Tag und Uhrzeit nicht als Inhalt', () => {
    expect(hatInhalt(entwurf(vorbelegung), vorbelegung)).toBe(false);
  });

  it('erkennt einen verschobenen Tag trotz Vorbelegung', () => {
    // Wer den Sonntag gegen „Heute" tauscht, hat sehr wohl etwas getan.
    const verschoben = entwurf({ ...vorbelegung, datum: '2026-08-19T00:00:00.000Z' });
    expect(hatInhalt(verschoben, vorbelegung)).toBe(true);
  });

  it('erkennt eine geänderte Uhrzeit trotz Vorbelegung', () => {
    const spaeter = entwurf({ ...vorbelegung, uhrzeit: '2026-08-19T15:30:00.000Z' });
    expect(hatInhalt(spaeter, vorbelegung)).toBe(true);
  });

  it('lässt andere Felder unberührt von der Vorbelegung', () => {
    expect(hatInhalt(entwurf({ ...vorbelegung, ort: 'Eisgrund' }), vorbelegung)).toBe(true);
  });

  it('zählt ohne Vorbelegung jeden gesetzten Wert — für alte Entwürfe', () => {
    // Entwürfe von vor der Umstellung kennen keine Vorbelegung. Sie sollen
    // weiter angeboten werden; ihr Tag ist von Hand gesetzt worden.
    expect(hatInhalt(entwurf({ datum: '2026-09-01T00:00:00.000Z' }))).toBe(true);
  });
});

describe('istFrisch', () => {
  it('bietet einen Entwurf von heute an', () => {
    expect(istFrisch(entwurf(), JETZT)).toBe(true);
  });

  it('lässt einen drei Wochen alten liegen', () => {
    // Ein alter Entwurf ist kein Angebot, sondern eine Irritation: Das
    // Training, um das es ging, ist längst gelaufen.
    const alt = entwurf({ standAm: JETZT.getTime() - 21 * 24 * 60 * 60 * 1000 });
    expect(istFrisch(alt, JETZT)).toBe(false);
  });
});

describe('ausJson', () => {
  it('übersteht die Reise durch den Speicher', () => {
    const vorher = entwurf({ ort: 'Eisgrund', plaetze: '8' });
    expect(ausJson(JSON.stringify(vorher))).toEqual(vorher);
  });

  it('verwirft Kaputtes, statt halbe Entwürfe zu bauen', () => {
    // Ein Formular, das befüllt aussieht und sich falsch verhält, wäre
    // schlimmer als ein leeres.
    expect(ausJson(null)).toBeNull();
    expect(ausJson('kein json {')).toBeNull();
    expect(ausJson('{"ort":"Eisgrund"}')).toBeNull();
  });
});

// --- Zähler statt Zahlenfelder (Handoff 11, „11c" vom 16.08.2026) --------
//
// Das Entwurfsformat hält beide Zahlen weiter als Zeichenkette; die
// Übersetzung in die Zähler und zurück muss den Unterschied zwischen
// „unbegrenzt" und „null Plätze" überstehen.

describe('plaetzeAusEntwurf', () => {
  it('liest eine Zahl', () => {
    expect(plaetzeAusEntwurf('12')).toBe(12);
  });

  it('macht aus dem leeren Feld „unbegrenzt", nicht null Plätze', () => {
    // **Der wichtigste Fall.** `null` heißt in der API unbegrenzt, `0`
    // hieße: niemand darf mit. Ein Training, zu dem sich niemand anmelden
    // kann, sähe angelegt aus und wäre nutzlos.
    expect(plaetzeAusEntwurf('')).toBeNull();
    expect(plaetzeAusEntwurf('   ')).toBeNull();
  });

  it('fällt bei Unlesbarem ebenfalls auf „unbegrenzt", nie auf 0', () => {
    expect(plaetzeAusEntwurf('abc')).toBeNull();
    expect(plaetzeAusEntwurf('0')).toBeNull();
    expect(plaetzeAusEntwurf('-3')).toBeNull();
  });
});

describe('guidesAusEntwurf', () => {
  it('liest eine Zahl', () => {
    expect(guidesAusEntwurf('3', 2)).toBe(3);
  });

  it('fällt auf die Voreinstellung zurück, nicht auf null oder NaN', () => {
    // Ein Zähler mit NaN ließe sich nicht mehr bedienen — weder herauf
    // noch herunter.
    expect(guidesAusEntwurf('', 2)).toBe(2);
    expect(guidesAusEntwurf('abc', 2)).toBe(2);
    expect(guidesAusEntwurf('0', 2)).toBe(2);
    expect(Number.isNaN(guidesAusEntwurf('abc', 2))).toBe(false);
  });
});

describe('zahlInEntwurf', () => {
  it('schreibt null als leere Zeichenkette — wie das alte Formular', () => {
    expect(zahlInEntwurf(null)).toBe('');
    expect(zahlInEntwurf(12)).toBe('12');
  });

  it('übersteht den Rundlauf durch den Entwurf', () => {
    // Der Fall aus dem Handoff: Entwurf anfangen, App schließen, wieder
    // öffnen — Zähler müssen zurückkommen, „unbegrenzt" eingeschlossen.
    for (const wert of [null, 1, 12, 99]) {
      expect(plaetzeAusEntwurf(zahlInEntwurf(wert))).toBe(wert);
    }
    expect(guidesAusEntwurf(zahlInEntwurf(3), 2)).toBe(3);
  });
});
