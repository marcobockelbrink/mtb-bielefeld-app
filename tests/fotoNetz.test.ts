import { describe, expect, it } from 'vitest';

import { darfJetztHochladen, grenzeInBytes, type UploadRegel } from '../src/features/fotos/netz';

function regel(teil: Partial<UploadRegel> = {}): UploadRegel {
  return { nurUeberWlan: true, freigrenze: '5mb', imWlan: false, mobilfunkErlaubt: false, ...teil };
}

const ZWEI_MB = 2 * 1024 * 1024;
const ZEHN_MB = 10 * 1024 * 1024;

describe('darfJetztHochladen', () => {
  it('lässt alles durch, wenn die Regel aus ist', () => {
    expect(darfJetztHochladen(regel({ nurUeberWlan: false }), ZEHN_MB)).toBe(true);
  });

  it('lässt alles durch im WLAN', () => {
    expect(darfJetztHochladen(regel({ imWlan: true }), ZEHN_MB)).toBe(true);
  });

  it('hält große Bilder über Mobilfunk zurück', () => {
    expect(darfJetztHochladen(regel(), ZEHN_MB)).toBe(false);
  });

  it('lässt kleine Bilder auch über Mobilfunk durch', () => {
    // „Kleine Bilder gehen sofort raus, große warten aufs WLAN."
    expect(darfJetztHochladen(regel(), ZWEI_MB)).toBe(true);
  });

  it('hält bei „Nie" auch kleine zurück', () => {
    expect(darfJetztHochladen(regel({ freigrenze: 'nie' }), 1024)).toBe(false);
  });

  it('lässt den einmaligen Mobilfunk-Ausweg gelten', () => {
    // Der Knopf im Album — ohne ihn sitzt jemand am Ende einer Tour fest.
    expect(darfJetztHochladen(regel({ mobilfunkErlaubt: true }), ZEHN_MB)).toBe(true);
  });

  it('lädt hoch, solange der Netzzustand unbekannt ist', () => {
    // Ein Upload, der wegen einer unklaren Messung stillsteht, wäre genau
    // der Fehler aus dem Bericht — nur mit anderer Begründung.
    expect(darfJetztHochladen(regel({ imWlan: null }), ZEHN_MB)).toBe(true);
  });

  it('kennt die drei Grenzen', () => {
    expect(grenzeInBytes('nie')).toBe(0);
    expect(grenzeInBytes('5mb')).toBe(5 * 1024 * 1024);
    expect(grenzeInBytes('20mb')).toBe(20 * 1024 * 1024);
  });
});
