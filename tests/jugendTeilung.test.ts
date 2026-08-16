import { describe, expect, it } from 'vitest';

import { teileNachZeit } from '../src/features/jugend/format';

function t(id: string, beginn: string, ende: string | null = null) {
  return { id, beginntAm: new Date(beginn), endetAm: ende ? new Date(ende) : null };
}

const JETZT = new Date('2026-08-16T12:00:00Z');

describe('teileNachZeit', () => {
  it('trennt Kommendes von Vorbeiem', () => {
    const { kommend, vorbei } = teileNachZeit(
      [t('alt', '2026-08-10T10:00:00Z'), t('neu', '2026-08-20T10:00:00Z')],
      JETZT,
    );
    expect(kommend.map((x) => x.id)).toEqual(['neu']);
    expect(vorbei.map((x) => x.id)).toEqual(['alt']);
  });

  it('zählt ein laufendes Training als kommend, solange es nicht vorbei ist', () => {
    // Wer mitten im Training nachsieht, soll es nicht unter „Vorbei" suchen.
    const { kommend } = teileNachZeit(
      [t('laeuft', '2026-08-16T11:00:00Z', '2026-08-16T13:00:00Z')],
      JETZT,
    );
    expect(kommend).toHaveLength(1);
  });

  it('behandelt ein Training ohne Ende an seinem Beginn als vorbei', () => {
    // Dieselbe Regel wie beim Aufräumen und beim Lesen — drei Stellen, eine
    // Auslegung.
    const { vorbei } = teileNachZeit([t('ohneEnde', '2026-08-16T11:59:00Z')], JETZT);
    expect(vorbei).toHaveLength(1);
  });

  it('sortiert Vorbeies rückwärts — das zuletzt Gelaufene zuerst', () => {
    const { vorbei } = teileNachZeit(
      [t('frueh', '2026-08-01T10:00:00Z'), t('spaet', '2026-08-14T10:00:00Z')],
      JETZT,
    );
    expect(vorbei.map((x) => x.id)).toEqual(['spaet', 'frueh']);
  });
});
