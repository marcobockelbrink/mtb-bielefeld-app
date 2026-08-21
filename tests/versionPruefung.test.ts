import { describe, expect, it } from 'vitest';

import {
  istAelterAls,
  liesFassung,
  vergleicheFassungen,
} from '../src/domain/fassung';
import {
  beurteile,
  zeigeHinweis,
  type Versionsauskunft,
} from '../src/features/version/pruefung';

function auskunft(teil: Partial<Versionsauskunft> = {}): Versionsauskunft {
  return { mindestVersion: '1.0.0', aktuelleVersion: '1.6.0', hinweis: null, ...teil };
}

describe('liesFassung', () => {
  it('zerlegt eine Fassung in drei Zahlen', () => {
    expect(liesFassung('1.10.0')).toEqual([1, 10, 0]);
  });

  it('schneidet ein Anhängsel ab, statt es abzulehnen', () => {
    // Ein Vorabbau soll sich verhalten wie seine Fassung.
    expect(liesFassung('0.12.4-beta.2')).toEqual([0, 12, 4]);
  });

  it('lehnt alles ab, was nicht mit drei Zahlen beginnt', () => {
    // Ein halb verstandener Wert wäre schlimmer als keiner: Er ergäbe
    // einen Vergleich, der irgendetwas liefert.
    for (const kaputt of ['1.2', 'v1.2.3', '', 'neueste', undefined, null]) {
      expect(liesFassung(kaputt)).toBeNull();
    }
  });
});

describe('vergleicheFassungen', () => {
  it('rechnet zahlweise und nicht als Zeichenkette', () => {
    // **Der Test, an dem solche Prüfungen sonst scheitern.** Als Text ist
    // "1.10.0" < "1.9.0" wahr — und das fällt erst beim zehnten
    // Nebenversionssprung auf, wenn niemand mehr daran denkt.
    expect(vergleicheFassungen([1, 10, 0], [1, 9, 0])).toBeGreaterThan(0);
  });

  it('vergleicht über alle drei Stellen', () => {
    expect(vergleicheFassungen([2, 0, 0], [1, 99, 99])).toBeGreaterThan(0);
    expect(vergleicheFassungen([0, 12, 3], [0, 12, 4])).toBeLessThan(0);
    expect(vergleicheFassungen([0, 12, 4], [0, 12, 4])).toBe(0);
  });
});

describe('istAelterAls', () => {
  it('erkennt eine ältere Fassung', () => {
    expect(istAelterAls('1.4.2', '1.5.0')).toBe(true);
    expect(istAelterAls('1.5.0', '1.5.0')).toBe(false);
  });

  it('hält eine unlesbare Angabe für in Ordnung', () => {
    // Auf dem Server heißt das: Wer den Kopf `X-App-Version` nicht
    // schickt, wird nicht ausgesperrt. Ältere Fassungen kennen ihn gar
    // nicht — sie mit der Einführung dieser Prüfung rückwirkend
    // abzuschalten wäre das Gegenteil dessen, was sie soll.
    expect(istAelterAls(undefined, '1.5.0')).toBe(false);
    expect(istAelterAls('kaputt', '1.5.0')).toBe(false);
    expect(istAelterAls('1.4.2', undefined)).toBe(false);
  });
});

describe('beurteile', () => {
  it('sperrt unterhalb der Mindestversion', () => {
    expect(beurteile('1.4.2', auskunft({ mindestVersion: '1.5.0' }))).toBe('gesperrt');
  });

  it('weist auf ein Update hin, solange die App noch läuft', () => {
    expect(beurteile('1.5.0', auskunft({ mindestVersion: '1.5.0', aktuelleVersion: '1.6.0' }))).toBe(
      'hinweis',
    );
  });

  it('sagt bei der neuesten Fassung nichts', () => {
    expect(beurteile('1.6.0', auskunft({ aktuelleVersion: '1.6.0' }))).toBe('aktuell');
  });

  it('sagt auch bei einer neueren Fassung nichts', () => {
    // Ein Entwicklungsbau ist der Auskunft manchmal voraus. Ihn zu
    // behelligen wäre Unsinn.
    expect(beurteile('1.7.0', auskunft({ aktuelleVersion: '1.6.0' }))).toBe('aktuell');
  });

  it('sperrt **nicht**, wenn gar keine Auskunft vorliegt', () => {
    /**
     * **Tragend.** Ein Telefon im Funkloch bekommt keine Antwort, und eine
     * App, die sich daraufhin selbst sperrt, wäre im Wald unbenutzbar —
     * genau dort steht sie am häufigsten. Die Sperre ist eine Aussage des
     * Servers, kein Zustand, in den man aus Unwissen fällt.
     */
    expect(beurteile('0.0.1', null)).toBe('aktuell');
  });
});

describe('zeigeHinweis', () => {
  it('zeigt die Karte, solange nichts weggewischt wurde', () => {
    expect(zeigeHinweis('hinweis', auskunft(), null)).toBe(true);
  });

  it('schweigt nach dem Wegwischen derselben Fassung', () => {
    expect(zeigeHinweis('hinweis', auskunft({ aktuelleVersion: '1.6.0' }), '1.6.0')).toBe(false);
  });

  it('meldet sich bei der nächsten Fassung wieder', () => {
    // Verglichen wird gegen die neueste Fassung, nicht gegen die eigene:
    // Wer 1.6.0 weggewischt hat, soll bei 1.7.0 wieder etwas sehen, ohne
    // selbst etwas getan zu haben.
    expect(zeigeHinweis('hinweis', auskunft({ aktuelleVersion: '1.7.0' }), '1.6.0')).toBe(true);
  });

  it('zeigt neben der Sperre keine Karte', () => {
    // Auf dem Sperrbildschirm gibt es kein „Aktuelles" — und ein zweiter
    // Hinweis auf dasselbe wäre auch dort nur Rauschen.
    expect(zeigeHinweis('gesperrt', auskunft(), null)).toBe(false);
    expect(zeigeHinweis('aktuell', auskunft(), null)).toBe(false);
  });

  it('zeigt ohne Auskunft nichts', () => {
    expect(zeigeHinweis('hinweis', null, null)).toBe(false);
  });
});
