/**
 * Auf welchen Server die App zeigt — die Rechnung dahinter.
 *
 * Der Wert entsteht aus drei Angaben, und die Reihenfolge ist tragend. Ein
 * Fehler hier ist teuer und leise: Eine Fassung, die auf den falschen
 * Server zeigt, funktioniert ja — sie schreibt nur in die falsche
 * Datenbank.
 */

import { describe, expect, it } from 'vitest';

import { waehleApiAdresse } from '../src/config';

describe('waehleApiAdresse', () => {
  it('zeigt beim Entwickeln auf den örtlichen Aufbau', () => {
    expect(waehleApiAdresse({ ueberschrieben: undefined, umgebung: 'dev', imEntwicklungsbau: true })).toBe(
      'http://localhost',
    );
  });

  it('zeigt in der dev-Fassung auf den Prüfserver', () => {
    expect(waehleApiAdresse({ ueberschrieben: undefined, umgebung: 'dev', imEntwicklungsbau: false })).toBe(
      'https://app-dev.mtb-bielefeld.de',
    );
  });

  it('zeigt in der prod-Fassung auf den Vereinsserver', () => {
    expect(waehleApiAdresse({ ueberschrieben: undefined, umgebung: 'prod', imEntwicklungsbau: false })).toBe(
      'https://app.mtb-bielefeld.de',
    );
  });

  // Der Weg fürs echte Telefon im WLAN: Dort ist `localhost` das Telefon
  // selbst, nicht der Entwicklungsrechner. Muss alles andere schlagen,
  // sonst braucht dieser Fall wieder eine Codeänderung.
  it('lässt sich mit EXPO_PUBLIC_API_URL überschreiben — auch in prod', () => {
    expect(
      waehleApiAdresse({ ueberschrieben: 'http://192.168.1.5', umgebung: 'prod', imEntwicklungsbau: false }),
    ).toBe('http://192.168.1.5');
  });

  /**
   * `__DEV__` schlägt die Umgebung, und das ist Absicht: Wer über Metro
   * entwickelt, meint den Aufbau vor sich — auch wenn er zufällig einen
   * prod-Bau gestartet hat. Andersherum schriebe ein Tippfehler beim
   * Ausprobieren in die echten Mitgliederdaten.
   */
  it('bleibt im Entwicklungsbau örtlich, selbst wenn prod gesetzt ist', () => {
    expect(waehleApiAdresse({ ueberschrieben: undefined, umgebung: 'prod', imEntwicklungsbau: true })).toBe(
      'http://localhost',
    );
  });

  // Dieselbe Vorsicht wie in `app.config.js`: Nur das genaue Wort führt
  // nach prod. Ein Vertipper landet auf dem Prüfserver, nicht in den
  // Vereinsdaten.
  it('nimmt alles außer dem ausdrücklichen „prod" als dev', () => {
    for (const eingabe of [undefined, '', 'produktion', 'PROD']) {
      expect(waehleApiAdresse({ ueberschrieben: undefined, umgebung: eingabe, imEntwicklungsbau: false })).toBe(
        'https://app-dev.mtb-bielefeld.de',
      );
    }
  });
});
