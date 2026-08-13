import { describe, expect, it } from 'vitest';

import {
  darfAlbumAnlegen,
  darfFassungSehen,
  darfHochladen,
  darfLoeschen,
  darfSehen,
  darfSichten,
  istKennung,
  type Betrachter,
} from '../src/fotoalbum.ts';

// Keine Datenbank in dieser Datei: Das hier ist die Rechenlogik, und sie
// bleibt bewusst ohne Postgres prüfbar. Die Endpunkte kommen getrennt dran.

const ANNA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const BERND = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

function betrachter(teil: Partial<Betrachter> = {}): Betrachter {
  return { id: ANNA, rolle: 'mitglied', gehoertZurJugend: false, ...teil };
}

describe('darfSehen', () => {
  it('zeigt der Verwaltung auch neue und abgelehnte Bilder', () => {
    // Sie muss sichten können — und was sie nicht sieht, kann sie nicht
    // löschen. Das ist ausdrückliche Anforderung des Vereins.
    const chef = betrachter({ rolle: 'verwaltung' });

    for (const zustand of ['neu', 'freigegeben', 'abgelehnt'] as const) {
      expect(
        darfSehen(chef, { sichtbarkeit: 'mitglieder' }, { hochgeladenVon: BERND, zustand }),
      ).toBe(true);
    }
  });

  it('zeigt jedem sein eigenes Bild, auch unfreigegeben', () => {
    // Sonst lädt jemand zehn Bilder hoch, sieht nichts und lädt sie noch
    // einmal hoch. Genau so entstehen die Doppelten, die wir an anderer
    // Stelle mit einer Prüfsumme wieder einfangen.
    expect(
      darfSehen(betrachter(), { sichtbarkeit: 'mitglieder' }, { hochgeladenVon: ANNA, zustand: 'neu' }),
    ).toBe(true);
  });

  it('verbirgt fremde Bilder, solange sie nicht freigegeben sind', () => {
    for (const zustand of ['neu', 'abgelehnt'] as const) {
      expect(
        darfSehen(betrachter(), { sichtbarkeit: 'mitglieder' }, { hochgeladenVon: BERND, zustand }),
      ).toBe(false);
    }
  });

  it('zeigt freigegebene Bilder allen, wenn das Album auf „mitglieder" steht', () => {
    expect(
      darfSehen(
        betrachter(),
        { sichtbarkeit: 'mitglieder' },
        { hochgeladenVon: BERND, zustand: 'freigegeben' },
      ),
    ).toBe(true);
  });

  it('verbirgt ein Jugend-Album vor Mitgliedern ohne Jugendbezug', () => {
    expect(
      darfSehen(
        betrachter(),
        { sichtbarkeit: 'jugend' },
        { hochgeladenVon: BERND, zustand: 'freigegeben' },
      ),
    ).toBe(false);
  });

  it('zeigt ein Jugend-Album denen mit Jugendbezug', () => {
    expect(
      darfSehen(
        betrachter({ gehoertZurJugend: true }),
        { sichtbarkeit: 'jugend' },
        { hochgeladenVon: BERND, zustand: 'freigegeben' },
      ),
    ).toBe(true);
  });

  it('zeigt ein Jugend-Album auch Guides', () => {
    // Sie leiten die Trainings, aus denen die Bilder stammen. Ein Guide, der
    // die Fotos seines eigenen Trainings nicht öffnen kann, hielte das zu
    // Recht für einen Fehler.
    expect(
      darfSehen(
        betrachter({ rolle: 'guide' }),
        { sichtbarkeit: 'jugend' },
        { hochgeladenVon: BERND, zustand: 'freigegeben' },
      ),
    ).toBe(true);
  });

  it('lässt einen Guide trotzdem nicht in fremde unfreigegebene Bilder', () => {
    // Die Rolle öffnet das Jugend-Album, nicht die Sichtung. Sonst wäre
    // „Guide" stillschweigend zur zweiten Verwaltung geworden.
    expect(
      darfSehen(
        betrachter({ rolle: 'guide' }),
        { sichtbarkeit: 'jugend' },
        { hochgeladenVon: BERND, zustand: 'neu' },
      ),
    ).toBe(false);
  });
});

describe('darfHochladen', () => {
  const jetzt = new Date('2026-08-11T12:00:00Z');

  it('nimmt Bilder an, solange das Album offen und das Fenster nicht zu ist', () => {
    expect(
      darfHochladen({ zustand: 'offen', hochladenBis: new Date('2026-08-25T00:00:00Z') }, jetzt),
    ).toBe(true);
  });

  it('nimmt nichts an, wenn das Album geschlossen ist', () => {
    expect(
      darfHochladen({ zustand: 'geschlossen', hochladenBis: new Date('2026-08-25T00:00:00Z') }, jetzt),
    ).toBe(false);
  });

  it('nimmt nichts an, wenn das Fenster abgelaufen ist', () => {
    expect(
      darfHochladen({ zustand: 'offen', hochladenBis: new Date('2026-08-01T00:00:00Z') }, jetzt),
    ).toBe(false);
  });

  it('nimmt an, wenn es gar kein Fenster gibt', () => {
    // Der Normalfall für freie Alben: Bei einem Rennen, das nicht im
    // Vereinskalender steht, hat niemand ein Ereignisdatum als Bezugspunkt.
    expect(darfHochladen({ zustand: 'offen', hochladenBis: null }, jetzt)).toBe(true);
  });

  it('lässt den letzten Augenblick des Fensters noch durch', () => {
    // Grenzen gehören geprüft: `<` statt `<=` wäre hier eine Minute
    // Unterschied, die niemandem auffällt und trotzdem falsch ist.
    expect(darfHochladen({ zustand: 'offen', hochladenBis: jetzt }, jetzt)).toBe(true);
  });
});

describe('darfLoeschen', () => {
  it('lässt die Verwaltung jedes Bild löschen, in jedem Zustand', () => {
    const chef = betrachter({ rolle: 'verwaltung' });

    for (const zustand of ['neu', 'freigegeben', 'abgelehnt'] as const) {
      expect(darfLoeschen(chef, { hochgeladenVon: BERND, zustand })).toBe(true);
    }
  });

  it('lässt den Hochladenden sein eigenes Bild zurückziehen, solange es neu ist', () => {
    expect(darfLoeschen(betrachter(), { hochgeladenVon: ANNA, zustand: 'neu' })).toBe(true);
  });

  it('lässt ihn nicht mehr löschen, sobald darüber entschieden wurde', () => {
    // Danach steht das Bild womöglich schon auf der Vereinsseite. Wer es
    // trotzdem weg haben will, nimmt den Melden-Knopf — das ist der Weg,
    // der eine Spur hinterlässt.
    for (const zustand of ['freigegeben', 'abgelehnt'] as const) {
      expect(darfLoeschen(betrachter(), { hochgeladenVon: ANNA, zustand })).toBe(false);
    }
  });

  it('lässt niemanden fremde Bilder löschen', () => {
    expect(darfLoeschen(betrachter(), { hochgeladenVon: BERND, zustand: 'neu' })).toBe(false);
  });
});

describe('die kleineren Regeln', () => {
  it('lässt jedes Mitglied Alben anlegen — seit dem 13.08.2026', () => {
    // Der Mitfahrer beim Rennen ist kein Guide; gegen Wildwuchs schützt
    // das Löschrecht der Verwaltung, nicht eine Hürde beim Anlegen.
    expect(darfAlbumAnlegen('guide')).toBe(true);
    expect(darfAlbumAnlegen('verwaltung')).toBe(true);
    expect(darfAlbumAnlegen('mitglied')).toBe(true);
  });

  it('lässt nur die Verwaltung sichten', () => {
    expect(darfSichten('verwaltung')).toBe(true);
    expect(darfSichten('guide')).toBe(false);
    expect(darfSichten('mitglied')).toBe(false);
  });

  it('gibt das Original nur der Verwaltung', () => {
    // Die App zeigt `anzeige`. Das Original allen zu geben hieße, jedem
    // Mitglied eine Kopiervorlage in voller Auflösung zu reichen.
    expect(darfFassungSehen('mitglied', 'vorschau')).toBe(true);
    expect(darfFassungSehen('mitglied', 'anzeige')).toBe(true);
    expect(darfFassungSehen('mitglied', 'original')).toBe(false);
    expect(darfFassungSehen('guide', 'original')).toBe(false);
    expect(darfFassungSehen('verwaltung', 'original')).toBe(true);
  });
});

describe('istKennung', () => {
  it('nimmt eine UUID an und weist alles andere ab', () => {
    // Der frühere Ausdruck `/^[0-9a-f-]{36}$/i` ließ sechsunddreißig
    // Bindestriche durch — also genau das, wovor er schützen sollte.
    expect(istKennung(ANNA)).toBe(true);
    expect(istKennung('------------------------------------')).toBe(false);
    expect(istKennung('keine-kennung')).toBe(false);
    expect(istKennung('')).toBe(false);
  });
});
