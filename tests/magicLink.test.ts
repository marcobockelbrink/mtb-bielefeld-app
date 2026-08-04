import { describe, expect, it } from 'vitest';

import { extrahiereMagicToken } from '../src/konto/magicLink';

describe('extrahiereMagicToken', () => {
  it('liest den Token aus einer Anmeldeadresse', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/abc-123_XYZ')).toBe('abc-123_XYZ');
  });

  it('versteht auch die Web-Adresse', () => {
    expect(extrahiereMagicToken('https://app.mtb-bielefeld.de/anmeldung/abc-123')).toBe(
      'abc-123',
    );
  });

  it('ignoriert andere Adressen', () => {
    expect(extrahiereMagicToken('mtbie://termin/xyz')).toBeNull();
    expect(extrahiereMagicToken('https://mtb-bielefeld.de/')).toBeNull();
    expect(extrahiereMagicToken('')).toBeNull();
  });

  it('ignoriert eine Adresse ohne Token', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/')).toBeNull();
    expect(extrahiereMagicToken('mtbie://anmeldung')).toBeNull();
  });

  it('lässt einen angehängten Fragezeichenteil weg', () => {
    expect(extrahiereMagicToken('mtbie://anmeldung/abc?quelle=mail')).toBe('abc');
  });

  it('nimmt auch die Form mit drei Schrägstrichen, die die API tatsächlich verschickt', () => {
    expect(extrahiereMagicToken('mtbie:///anmeldung/wt_1R9dH1Iz-Nw6b6HUEnFvA25tO')).toBe(
      'wt_1R9dH1Iz-Nw6b6HUEnFvA25tO',
    );
  });
});
