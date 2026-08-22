import { describe, expect, it } from 'vitest';

import type { Einwilligung } from '../src/data/bildrechte';
import { beschreibe, passtZuFilter } from '../src/features/bildrechte/status';

function einwilligung(teil: Partial<Einwilligung> = {}): Einwilligung {
  return {
    status: 'offen',
    textVersion: null,
    bestaetigtVon: null,
    zeitpunkt: null,
    jugendBestaetigt: null,
    quelle: null,
    vollstaendig: false,
    ...teil,
  };
}

describe('beschreibe', () => {
  it('nennt eine vollständige Zustimmung „erteilt"', () => {
    const b = beschreibe(einwilligung({ status: 'erteilt', vollstaendig: true }), 'Finn');
    expect(b).toEqual({ wort: 'erteilt', ton: 'gut', zusatz: null });
  });

  it('sagt bei fehlender zweiter Stimme, wer noch dran ist', () => {
    /**
     * **Sonst entsteht ein unsichtbarer Widerspruch.** Für die Eltern sähe
     * die Sache erledigt aus („erteilt"), während für die Guides weiter
     * „keine Fotos" gilt — und niemand könnte das auflösen, weil der Grund
     * nirgends steht.
     */
    const b = beschreibe(
      einwilligung({ status: 'erteilt', vollstaendig: false, jugendBestaetigt: false }),
      'Ben Meyer',
    );
    expect(b.ton).toBe('offen');
    expect(b.zusatz).toBe('Ben Meyer muss noch selbst zustimmen.');
  });

  it('kommt ohne Namen aus', () => {
    const b = beschreibe(einwilligung({ status: 'erteilt', vollstaendig: false }), null);
    expect(b.zusatz).toBe('das Kind muss noch selbst zustimmen.');
  });

  it('nennt Nein und Widerruf beim Wort und weist auf den Verein', () => {
    // In der App gibt es dafür keinen Weg — dann muss wenigstens dastehen,
    // wo es herkommt.
    expect(beschreibe(einwilligung({ status: 'abgelehnt' }), 'Finn')).toEqual({
      wort: 'nein',
      ton: 'nein',
      zusatz: 'Vom Verein erfasst.',
    });
    expect(beschreibe(einwilligung({ status: 'widerrufen' }), 'Finn').wort).toBe('widerrufen');
  });

  it('nennt eine fehlende Antwort „offen"', () => {
    expect(beschreibe(einwilligung(), 'Finn')).toEqual({ wort: 'offen', ton: 'offen', zusatz: null });
  });
});

describe('passtZuFilter', () => {
  it('zählt eine unvollständige Zustimmung zu „Fehlt"', () => {
    // Für die Guides heißt sie dasselbe wie gar keine Antwort, und sie
    // braucht dieselbe Handlung: einmal nachfragen.
    const halb = einwilligung({ status: 'erteilt', vollstaendig: false });
    expect(passtZuFilter(halb, 'fehlt')).toBe(true);
    expect(passtZuFilter(einwilligung(), 'fehlt')).toBe(true);
  });

  it('lässt eine vollständige Zustimmung aus „Fehlt" heraus', () => {
    const ganz = einwilligung({ status: 'erteilt', vollstaendig: true });
    expect(passtZuFilter(ganz, 'fehlt')).toBe(false);
  });

  it('fasst unter „Nein" Ablehnung und Widerruf zusammen', () => {
    expect(passtZuFilter(einwilligung({ status: 'abgelehnt' }), 'nein')).toBe(true);
    expect(passtZuFilter(einwilligung({ status: 'widerrufen' }), 'nein')).toBe(true);
    expect(passtZuFilter(einwilligung(), 'nein')).toBe(false);
  });

  it('lässt unter „Alle" alles durch', () => {
    for (const status of ['offen', 'erteilt', 'abgelehnt', 'widerrufen'] as const) {
      expect(passtZuFilter(einwilligung({ status }), 'alle')).toBe(true);
    }
  });
});
