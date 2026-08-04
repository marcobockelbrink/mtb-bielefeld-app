import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeEinloesenFehler } from '../src/konto/einloesenFehler';

describe('beschreibeEinloesenFehler', () => {
  it('erklärt einen verbrauchten oder abgelaufenen Link (Status 401)', () => {
    expect(beschreibeEinloesenFehler(new ApiFehler(401, 'Der Link gilt nicht mehr.'))).toBe(
      'Dieser Anmeldelink gilt nicht mehr. Fordere einen neuen an.',
    );
  });

  it('erklärt einen Netzfehler (Status 0) als vorübergehend', () => {
    expect(
      beschreibeEinloesenFehler(new ApiFehler(0, 'Keine Verbindung zum Server.')),
    ).toBe('Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.');
  });

  it('erklärt einen Serverfehler (Status 500) als vorübergehend, nicht als toten Link', () => {
    expect(beschreibeEinloesenFehler(new ApiFehler(500, 'Da ist etwas schiefgegangen.'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });

  it('rät bei einer Ratenbegrenzung zum Warten — mit demselben Satz wie überall sonst', () => {
    // Vorher fiel dieser Fall auf den allgemeinen Text zurück. Dieselbe Lage
    // hieß dadurch je nach Bildschirm etwas anderes, und ausgerechnet der
    // Rat, der hier hilft — eine Minute warten —, fehlte.
    expect(beschreibeEinloesenFehler(new ApiFehler(429, 'Zu viele Versuche.'))).toBe(
      'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.',
    );
  });

  it('fällt bei einem unerwarteten Fehlertyp auf den vorübergehenden Text zurück', () => {
    expect(beschreibeEinloesenFehler(new Error('irgendwas'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });
});
