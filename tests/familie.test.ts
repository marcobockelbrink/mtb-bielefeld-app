import { describe, expect, it } from 'vitest';

import { altersTag, statusZeile, type Profil } from '../src/data/familie';

function profil(teil: Partial<Profil> = {}): Profil {
  return {
    id: 'p1',
    name: 'Mika',
    email: 'mika@example.org',
    geburtsjahr: 2015,
    kannBilderHochladen: false,
    avatarUrl: null,
    status: 'aktiv',
    einwilligung: {
      status: 'offen',
      textVersion: null,
      bestaetigtVon: null,
      zeitpunkt: null,
      jugendBestaetigt: null,
      quelle: null,
      vollstaendig: false,
    },
    ...teil,
  };
}

describe('altersTag', () => {
  it('rechnet das Alter aus dem Geburtsjahr', () => {
    expect(altersTag(profil({ geburtsjahr: 2015 }), new Date('2026-08-15'))).toBe('Kind · 11');
  });

  it('lässt das Alter weg, wenn kein Jahr da ist', () => {
    // Ein erfundenes Alter wäre schlimmer als keines.
    expect(altersTag(profil({ geburtsjahr: null }), new Date('2026-08-15'))).toBe('Kind');
  });
});

describe('statusZeile', () => {
  it('nennt bei offener Einladung den Empfänger', () => {
    // Der Empfänger ist die Frage, die sich Eltern stellen: „Wo liegt die
    // Mail jetzt?"
    expect(statusZeile(profil({ status: 'einladung_offen', email: 'eltern@example.org' }))).toBe(
      'Bestätigung an eltern@example.org gesendet',
    );
  });

  it('sagt bei aktiven Profilen, ob sie hochladen dürfen', () => {
    expect(statusZeile(profil({ kannBilderHochladen: false }))).toBe(
      'Aktiv · kann keine Bilder hochladen',
    );
    expect(statusZeile(profil({ kannBilderHochladen: true }))).toBe('Aktiv');
  });
});
