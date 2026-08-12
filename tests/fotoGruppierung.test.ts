import { describe, expect, it } from 'vitest';

import type { Foto } from '../src/data/fotos';
import { brauchtUeberschriften, gruppiereNachTagen } from '../src/features/fotos/gruppierung';

function foto(id: string, aufgenommenAm: string | null): Foto {
  return {
    id,
    albumId: 'a',
    hochgeladenVon: 'm',
    aufgenommenAm: aufgenommenAm ? new Date(aufgenommenAm) : null,
    hochgeladenAm: new Date('2026-07-20T10:00:00'),
    zustand: 'freigegeben',
    fuerHomepage: false,
    breite: null,
    hoehe: null,
  };
}

describe('gruppiereNachTagen', () => {
  it('verteilt eine Wochentour auf ihre Tage, in der Reihenfolge der Eingabe', () => {
    const gruppen = gruppiereNachTagen([
      foto('1', '2026-07-12T09:00:00'),
      foto('2', '2026-07-12T15:30:00'),
      foto('3', '2026-07-13T08:00:00'),
    ]);

    expect(gruppen).toHaveLength(2);
    expect(gruppen[0]?.ueberschrift).toBe('Sonntag, 12. Juli');
    expect(gruppen[0]?.fotos.map((f) => f.id)).toEqual(['1', '2']);
    expect(gruppen[1]?.ueberschrift).toBe('Montag, 13. Juli');
  });

  it('sammelt Bilder ohne Aufnahmezeit unter „Ohne Datum" am Ende', () => {
    // Ein Album, das mit den datenlosen beginnt, sähe nach einem Fehler aus.
    const gruppen = gruppiereNachTagen([
      foto('ohne', null),
      foto('mit', '2026-07-12T09:00:00'),
    ]);

    expect(gruppen[gruppen.length - 1]?.ueberschrift).toBe('Ohne Datum');
    expect(gruppen[gruppen.length - 1]?.fotos.map((f) => f.id)).toEqual(['ohne']);
  });

  it('trennt Tage über Monatsgrenzen, statt nur den Tag im Monat zu vergleichen', () => {
    // Der 12. Juli und der 12. August sind zwei Tage — ein Schlüssel, der
    // nur `getDate()` ansieht, würfe sie zusammen.
    const gruppen = gruppiereNachTagen([
      foto('juli', '2026-07-12T09:00:00'),
      foto('august', '2026-08-12T09:00:00'),
    ]);

    expect(gruppen).toHaveLength(2);
  });

  it('kommt mit einem leeren Album zurecht', () => {
    expect(gruppiereNachTagen([])).toEqual([]);
  });
});

describe('brauchtUeberschriften', () => {
  it('verzichtet auf die Zwischenzeile, wenn alles vom selben Tag stammt', () => {
    const einTag = gruppiereNachTagen([
      foto('1', '2026-07-12T09:00:00'),
      foto('2', '2026-07-12T10:00:00'),
    ]);
    expect(brauchtUeberschriften(einTag)).toBe(false);

    const zweiTage = gruppiereNachTagen([
      foto('1', '2026-07-12T09:00:00'),
      foto('2', '2026-07-13T09:00:00'),
    ]);
    expect(brauchtUeberschriften(zweiTage)).toBe(true);
  });
});
