import { describe, expect, it } from 'vitest';

import {
  aktiveFilterMarken,
  emptyFilter,
  entferneFilter,
  isFilterActive,
  type EventFilter,
  type MarkenTexte,
} from '../src/features/events/filter';

// Beschriftungen kommen sonst aus `theme.ts`; hier reichen erkennbare
// Platzhalter — geprüft wird die Auswahl, nicht die Übersetzung.
const TEXTE: MarkenTexte = {
  kategorie: (k) => `Art-${k}`,
  stufe: (s) => `Stufe-${s}`,
};

function filter(teil: Partial<EventFilter> = {}): EventFilter {
  return { ...emptyFilter, ...teil };
}

describe('aktiveFilterMarken', () => {
  it('gibt für den leeren Filter nichts aus', () => {
    // Sonst stünde über einer vollständigen Liste eine Zeile, die etwas
    // erklärt, das gar nicht passiert.
    expect(aktiveFilterMarken(emptyFilter, TEXTE)).toEqual([]);
  });

  it('zählt die Voreinstellung „Abgesagte ausblenden" nicht mit', () => {
    // `hideCancelled` ist im leeren Filter bereits `true`. Eine Marke dafür
    // stünde dauerhaft da und erklärte nie etwas — genau das Rauschen, das
    // D2 vermeiden will. `isFilterActive` sieht es aus demselben Grund nicht.
    expect(emptyFilter.hideCancelled).toBe(true);
    expect(isFilterActive(emptyFilter)).toBe(false);
    expect(aktiveFilterMarken(filter({ hideCancelled: false }), TEXTE)).toEqual([]);
  });

  it('stellt die Suche voran und zeigt sie in Anführungszeichen', () => {
    // Voran, weil sie die Liste am stärksten kürzt.
    const marken = aktiveFilterMarken(filter({ search: 'teuto', categories: ['tour'] }), TEXTE);
    expect(marken[0]).toEqual({ schluessel: 'suche', label: '„teuto"' });
    expect(marken).toHaveLength(2);
  });

  it('lässt eine Suche aus lauter Leerzeichen weg', () => {
    expect(aktiveFilterMarken(filter({ search: '   ' }), TEXTE)).toEqual([]);
  });

  it('schreibt bei den Sternen „höchstens" mit', () => {
    // Ohne das Wort läse sich „Fahrtechnik 2" wie genau diese Stufe — der
    // Filter meint aber eine Obergrenze.
    const marken = aktiveFilterMarken(filter({ maxTechniqueStars: 2, maxEnduranceStars: 1 }), TEXTE);
    expect(marken.map((m) => m.label)).toEqual([
      'Fahrtechnik höchstens 2',
      'Ausdauer höchstens 1',
    ]);
  });

  it('nimmt eine Obergrenze von 0 ernst', () => {
    // `undefined` heißt „nicht gesetzt", `0` ist ein Wert. Eine Prüfung auf
    // Wahrheitswert statt auf `undefined` verlöre ihn stillschweigend.
    expect(aktiveFilterMarken(filter({ maxTechniqueStars: 0 }), TEXTE)).toEqual([
      { schluessel: 'fahrtechnik', label: 'Fahrtechnik höchstens 0' },
    ]);
  });

  it('gibt je Kategorie und Stufe eine eigene Marke aus', () => {
    const marken = aktiveFilterMarken(
      filter({ categories: ['tour', 'jugend'], levels: ['einsteiger'] }),
      TEXTE,
    );
    expect(marken.map((m) => m.schluessel)).toEqual([
      'kategorie:tour',
      'kategorie:jugend',
      'stufe:einsteiger',
    ]);
  });

  it('vergibt keinen Schlüssel zweimal', () => {
    // Doppelte Schlüssel wären in React doppelte `key`-Werte — und ein
    // Abwerfen träfe womöglich die falsche Marke.
    const marken = aktiveFilterMarken(
      filter({
        search: 'x',
        categories: ['tour', 'jugend'],
        levels: ['einsteiger', 'koenner'],
        maxTechniqueStars: 2,
        maxEnduranceStars: 2,
        ladiesOnly: true,
      }),
      TEXTE,
    );
    expect(new Set(marken.map((m) => m.schluessel)).size).toBe(marken.length);
  });
});

describe('entferneFilter', () => {
  it('wirft genau eine Kategorie ab und lässt die andere stehen', () => {
    const vorher = filter({ categories: ['tour', 'jugend'] });
    expect(entferneFilter(vorher, 'kategorie:tour').categories).toEqual(['jugend']);
  });

  it('wirft eine Stufe ab', () => {
    const vorher = filter({ levels: ['einsteiger', 'koenner'] });
    expect(entferneFilter(vorher, 'stufe:koenner').levels).toEqual(['einsteiger']);
  });

  it('setzt die Sterne auf „nicht gesetzt", nicht auf 0', () => {
    // 0 wäre „höchstens null Sterne" und filterte fast alles weg.
    const vorher = filter({ maxTechniqueStars: 2, maxEnduranceStars: 3 });
    expect(entferneFilter(vorher, 'fahrtechnik').maxTechniqueStars).toBeUndefined();
    expect(entferneFilter(vorher, 'fahrtechnik').maxEnduranceStars).toBe(3);
  });

  it('leert die Suche und schaltet Ladies only ab', () => {
    expect(entferneFilter(filter({ search: 'teuto' }), 'suche').search).toBe('');
    expect(entferneFilter(filter({ ladiesOnly: true }), 'ladiesOnly').ladiesOnly).toBe(false);
  });

  it('lässt einen unbekannten Schlüssel den Filter unverändert', () => {
    const vorher = filter({ categories: ['tour'] });
    expect(entferneFilter(vorher, 'gibtsnicht')).toEqual(vorher);
  });

  it('rührt „Abgesagte anzeigen" nicht an', () => {
    // Es hat keine Marke, also darf es auch durch kein Abwerfen umkippen.
    const vorher = filter({ hideCancelled: false, search: 'x' });
    expect(entferneFilter(vorher, 'suche').hideCancelled).toBe(false);
  });

  it('führt Marke für Marke zurück auf den leeren Filter', () => {
    // Die eigentliche Zusage an den Nutzer: Wer alles abwirft, sieht wieder
    // alles. Ein vergessenes Feld fiele genau hier auf.
    let laufend = filter({
      search: 'teuto',
      categories: ['tour', 'jugend'],
      levels: ['einsteiger'],
      maxTechniqueStars: 2,
      maxEnduranceStars: 1,
      ladiesOnly: true,
    });

    for (const marke of aktiveFilterMarken(laufend, TEXTE)) {
      laufend = entferneFilter(laufend, marke.schluessel);
    }

    expect(laufend).toEqual(emptyFilter);
    expect(isFilterActive(laufend)).toBe(false);
  });
});
