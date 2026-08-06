import { describe, expect, it } from 'vitest';

import { formatiereTrainingszeit } from '../src/features/jugend/format';

const training = {
  id: 'a',
  beginntAm: new Date('2026-08-09T08:30:00Z'), // 10:30 Ortszeit
  endetAm: null,
  ort: 'Kalkofen',
  hinweis: null,
  plaetze: null,
  guidesNoetig: 2,
  zustand: 'veroeffentlicht' as const,
  absagegrund: null,
  belegt: 0,
};

describe('formatiereTrainingszeit', () => {
  it('rechnet in Vereinszeit, nicht in der Zeitzone des Geräts', () => {
    // Ein Telefon, das auf UTC steht, zeigte sonst 08:30 — und ein Kind
    // stünde zwei Stunden zu früh am Parkplatz.
    expect(formatiereTrainingszeit(training)).toBe('Sonntag, 9. August · 10:30 Uhr');
  });

  it('nennt das Ende, wenn es eines gibt', () => {
    const mitEnde = { ...training, endetAm: new Date('2026-08-09T10:30:00Z') };
    expect(formatiereTrainingszeit(mitEnde)).toBe('Sonntag, 9. August · 10:30 – 12:30 Uhr');
  });
});
