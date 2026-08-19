import { describe, expect, it } from 'vitest';

import { maskiereAnfrageUrl, serialisiereAnfrage } from '../src/app.ts';

/**
 * Der Serialisierer wird direkt geprüft, nicht über einen laufenden Logger:
 * Im Test ist das Protokoll bewusst aus (`NODE_ENV=test`, siehe `app.ts`),
 * und was pino auf welchen Strom schreibt, ist hier gar nicht die Frage —
 * die Frage ist, was der Serialisierer aus einer Anfrage macht.
 */
describe('maskiereAnfrageUrl', () => {
  it('maskiert den Gast-Storno-Token', () => {
    expect(maskiereAnfrageUrl('/gast/storno/geheim-abc123')).toBe('/gast/storno/[maskiert]');
  });

  it('lässt jede andere URL unverändert', () => {
    for (const url of [
      '/gesundheit',
      '/anmeldung/anfordern',
      '/anmeldung/einloesen',
      '/sitzung/erneuern',
      '/konto',
      '/termine/tour@test',
      '/termine/tour@test/ich',
      // Ähnlich, aber nicht die Route: kein Grund, hier etwas wegzunehmen.
      '/gast/etwas-anderes',
    ]) {
      expect(maskiereAnfrageUrl(url)).toBe(url);
    }
  });
});

describe('serialisiereAnfrage', () => {
  it('schreibt statt des Tokens die Maskierung — und sonst alles wie gehabt', () => {
    const serialisiert = serialisiereAnfrage({
      method: 'GET',
      url: '/gast/storno/geheim-abc123',
      headers: { 'accept-version': '1.x' },
      host: 'app.mtb-bielefeld.de',
      ip: '9.9.9.9',
      socket: { remotePort: 51234 },
    });

    expect(serialisiert).toEqual({
      method: 'GET',
      url: '/gast/storno/[maskiert]',
      version: '1.x',
      host: 'app.mtb-bielefeld.de',
      remoteAddress: '9.9.9.9',
      remotePort: 51234,
    });
    // Nirgendwo im Eintrag darf der Klartext noch auftauchen.
    expect(JSON.stringify(serialisiert)).not.toContain('geheim-abc123');
  });

  it('reicht eine unverfängliche URL unverfälscht durch', () => {
    const serialisiert = serialisiereAnfrage({
      method: 'POST',
      url: '/anmeldung/anfordern',
      headers: {},
      host: 'app.mtb-bielefeld.de',
      ip: '9.9.9.9',
      socket: { remotePort: 51234 },
    });

    expect(serialisiert.url).toBe('/anmeldung/anfordern');
  });
});
