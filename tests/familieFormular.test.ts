import { describe, expect, it } from 'vitest';

import {
  AELTESTES_ALTER,
  altersHinweis,
  bestaetigungGehtAn,
  geburtsjahrVorschlaege,
  istPlausiblesJahr,
  JUENGSTES_ALTER,
  kannAnlegen,
} from '../src/features/familie/formular';

const HEUTE = new Date(2026, 7, 16);

describe('kannAnlegen', () => {
  it('verlangt immer einen Namen', () => {
    expect(kannAnlegen('kind', '', '')).toBe(false);
    expect(kannAnlegen('kind', '   ', '')).toBe(false);
    expect(kannAnlegen('erwachsen', '', 'anna@example.org')).toBe(false);
  });

  it('lässt ein Kind ohne Adresse zu', () => {
    // Viele Kinder haben kein eigenes Postfach — das ist eine bewusste
    // Entscheidung des Vereins und keine Lücke.
    expect(kannAnlegen('kind', 'Mika', '')).toBe(true);
  });

  it('verlangt beim Erwachsenen eine Adresse', () => {
    // **Der Regressionstest aus dem Handoff.** Die Regel stand vorher als
    // ein Ausdruck mitten in `FamilienGruppe.tsx`; beim Umzug auf eine
    // eigene Seite ist sie genau das, was still verlorengehen kann. Ein
    // Erwachsener bekommt ein eigenständiges Konto, und die Adresse ist
    // der einzige Weg hinein.
    expect(kannAnlegen('erwachsen', 'Bernd', '')).toBe(false);
    expect(kannAnlegen('erwachsen', 'Bernd', '   ')).toBe(false);
    expect(kannAnlegen('erwachsen', 'Bernd', 'bernd@example.org')).toBe(true);
  });
});

describe('bestaetigungGehtAn', () => {
  it('nennt die eingetragene Adresse', () => {
    expect(bestaetigungGehtAn('mika@example.org', 'anna@example.org')).toBe('mika@example.org');
  });

  it('nennt bei leerem Feld die eigene Adresse', () => {
    // Genau die Frage, die sich jemand stellt, der das Feld leer lässt.
    expect(bestaetigungGehtAn('', 'anna@example.org')).toBe('anna@example.org');
    expect(bestaetigungGehtAn('   ', 'anna@example.org')).toBe('anna@example.org');
  });

  it('kommt ohne eigene Adresse zurecht', () => {
    expect(bestaetigungGehtAn('', null)).toBe('deine Adresse');
  });

  it('schneidet Leerzeichen ab', () => {
    expect(bestaetigungGehtAn('  mika@example.org  ', null)).toBe('mika@example.org');
  });
});

describe('geburtsjahrVorschlaege', () => {
  it('deckt die Spanne des Jugendtrainings ab, jüngster zuerst', () => {
    const jahre = geburtsjahrVorschlaege(HEUTE);
    expect(jahre[0]).toBe(2026 - JUENGSTES_ALTER);
    expect(jahre[jahre.length - 1]).toBe(2026 - AELTESTES_ALTER);
    expect(jahre).toHaveLength(AELTESTES_ALTER - JUENGSTES_ALTER + 1);
  });

  it('wandert mit dem Kalender mit', () => {
    // Fest eingetragene Jahrgänge wären in zwei Jahren falsch, und
    // niemandem fiele auf, warum.
    expect(geburtsjahrVorschlaege(new Date(2030, 0, 1))[0]).toBe(2030 - JUENGSTES_ALTER);
  });
});

describe('altersHinweis', () => {
  it('sagt, was aus der Wahl folgt', () => {
    expect(altersHinweis('Mika', 2014, HEUTE)).toBe('Mika ist dieses Jahr 12 Jahre alt.');
  });

  it('bleibt allgemein, solange kein Name dasteht', () => {
    // Wer das Jahr vor dem Namen antippt, soll keinen Satz mit einer
    // Lücke lesen.
    expect(altersHinweis('', 2014, HEUTE)).toBe('Das Kind ist dieses Jahr 12 Jahre alt.');
  });

  it('schweigt ohne Jahrgang', () => {
    expect(altersHinweis('Mika', null, HEUTE)).toBeNull();
  });
});

describe('istPlausiblesJahr', () => {
  it('nimmt eine vierstellige Jahreszahl an', () => {
    expect(istPlausiblesJahr('2014', HEUTE)).toBe(true);
    expect(istPlausiblesJahr('  2014  ', HEUTE)).toBe(true);
  });

  it('fängt Vertipper ab', () => {
    expect(istPlausiblesJahr('202', HEUTE)).toBe(false);
    expect(istPlausiblesJahr('20140', HEUTE)).toBe(false);
    expect(istPlausiblesJahr('abc', HEUTE)).toBe(false);
    expect(istPlausiblesJahr('', HEUTE)).toBe(false);
  });

  it('lässt keine Zukunft zu', () => {
    expect(istPlausiblesJahr('2027', HEUTE)).toBe(false);
    expect(istPlausiblesJahr('2026', HEUTE)).toBe(true);
  });

  it('urteilt nicht darüber, wer mitfahren darf', () => {
    // Ein Erwachsenenjahrgang ist plausibel — ob jemand ins
    // Jugendtraining passt, entscheidet der Verein, nicht das Formular.
    expect(istPlausiblesJahr('1985', HEUTE)).toBe(true);
  });

  it('weist Zahlen mit Beiwerk ab', () => {
    // `Number.parseInt('2014abc')` ergäbe 2014 — der Vergleich mit dem
    // Ursprungstext fängt das ab.
    expect(istPlausiblesJahr('2014abc', HEUTE)).toBe(false);
    expect(istPlausiblesJahr('20.14', HEUTE)).toBe(false);
  });
});
