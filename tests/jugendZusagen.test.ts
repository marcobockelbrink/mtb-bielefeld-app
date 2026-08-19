import { describe, expect, it } from 'vitest';

import {
  beschreibeGuide,
  beschreibeStand,
  eigeneZusage,
  type GuideAntwort,
} from '../src/features/jugend/zusagen';

function guide(teil: Partial<GuideAntwort> = {}): GuideAntwort {
  return {
    mitgliedId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    email: 't.mueller82@gmx.de',
    name: null,
    zusage: null,
    ...teil,
  };
}

const ICH = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

describe('eigeneZusage', () => {
  /**
   * **Der Kern von Handoff 14.** Die eigene Antwort stand vorher nirgends
   * auf der Seite — „Du hast zugesagt." war eine Meldung unmittelbar nach
   * dem Tippen. Wer die Seite neu öffnete, musste raten, ob der Tipp
   * gezählt hat. Genau das kam aus der Beta zurück.
   */
  it('findet die eigene Zusage in der Liste', () => {
    const liste = [guide(), guide({ mitgliedId: ICH, zusage: true })];
    expect(eigeneZusage(liste, ICH)).toBe(true);
  });

  it('unterscheidet eine Absage von keiner Antwort', () => {
    // `false` und `null` gleichzusetzen hieße, eine bewusste Absage als
    // „noch nicht beantwortet" auszuweisen — und der Guide tippte ein
    // zweites Mal auf etwas, das er schon entschieden hat.
    expect(eigeneZusage([guide({ mitgliedId: ICH, zusage: false })], ICH)).toBe(false);
    expect(eigeneZusage([guide({ mitgliedId: ICH, zusage: null })], ICH)).toBeNull();
  });

  it('meldet null, wenn die eigene Zeile fehlt', () => {
    expect(eigeneZusage([guide()], ICH)).toBeNull();
  });

  it('gibt ohne bekannte Kennung nicht die Antwort eines Fremden zurück', () => {
    // Solange die Kontoauskunft lädt, ist `mitgliedId` null. Ohne diese
    // Bremse fiele die Wahl auf `undefined` und damit auf niemanden — aber
    // ein späterer Umbau, der `find` ohne Vergleich benutzt, träfe die
    // erste Zeile. Der Test hält die Absicht fest.
    expect(eigeneZusage([guide({ zusage: true })], null)).toBeNull();
  });
});

describe('beschreibeStand', () => {
  it('nennt alle drei Zustände beim Wort', () => {
    // Farbe allein trüge die Aussage sonst allein — in der Sonne und bei
    // Rot-Grün-Schwäche wäre sie dann gar keine.
    expect(beschreibeStand(true)).toBe('zugesagt');
    expect(beschreibeStand(false)).toBe('kann nicht');
    expect(beschreibeStand(null)).toBe('offen');
  });
});

describe('beschreibeGuide', () => {
  it('zeigt den Namen, wo einer hinterlegt ist', () => {
    expect(beschreibeGuide(guide({ name: 'Thomas' }), null)).toBe('Thomas');
  });

  it('fällt ohne Namen auf die Adresse zurück', () => {
    expect(beschreibeGuide(guide(), null)).toBe('t.mueller82@gmx.de');
  });

  it('hält einen leeren Namen nicht für einen', () => {
    // Eine Zeile mit einem Leerzeichen darin sähe aus wie ein Fehler —
    // und wäre einer, nur nicht der offensichtliche.
    expect(beschreibeGuide(guide({ name: '   ' }), null)).toBe('t.mueller82@gmx.de');
  });

  it('markiert die eigene Zeile', () => {
    // In einer Liste aus fünf Namen ist das die Zeile, die man sucht.
    expect(beschreibeGuide(guide({ mitgliedId: ICH, name: 'Marco' }), ICH)).toBe('Marco (du)');
  });
});
