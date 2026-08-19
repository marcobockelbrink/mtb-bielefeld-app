/**
 * Was `app.config.js` je Umgebung liefert.
 *
 * Diese Datei prüft die Konfiguration, **nicht** ob Expo sie verwendet —
 * das kann nur `npx expo config --type public` zeigen, und der Befehl steht
 * im Plan als eigener Schritt. Ein grüner Test hier beweist die Rechnung,
 * nicht die Verdrahtung.
 */

import { describe, expect, it } from 'vitest';

import { baueKonfiguration } from '../app.config.js';
import { waehleApiAdresse } from '../src/config';

describe('app.config.js', () => {
  it('gibt der dev-Fassung eine eigene Bündelkennung', () => {
    const dev = baueKonfiguration('dev').expo;
    expect(dev.ios.bundleIdentifier).toBe('de.mtbbielefeld.app.dev');
    expect(dev.android.package).toBe('de.mtbbielefeld.app.dev');
    expect(dev.name).toBe('MTB BI (dev)');
  });

  it('lässt prod die schlichte Kennung', () => {
    const prod = baueKonfiguration('prod').expo;
    expect(prod.ios.bundleIdentifier).toBe('de.mtbbielefeld.app');
    expect(prod.android.package).toBe('de.mtbbielefeld.app');
    expect(prod.name).toBe('MTB Bielefeld');
  });

  // Die eigene Adresse zuerst, dahinter die alten Namen desselben Standes.
  // Ohne die alten öffnete ein Teilen-Link aus einer älteren Fassung den
  // Browser statt der App — der Link trägt die Adresse, die beim Bauen der
  // **sendenden** Fassung galt, und im Verein laufen mehrere nebeneinander.
  it('meldet die eigene Domain und die früheren Namen an', () => {
    expect(baueKonfiguration('dev').expo.ios.associatedDomains).toEqual([
      'applinks:app-dev.mtb-bielefeld.de',
      'applinks:api-dev.bockelbrink.net',
      'applinks:api.bockelbrink.net',
    ]);
    // Von der Vereinsfassung war nie eine im Umlauf — nichts einzusammeln.
    expect(baueKonfiguration('prod').expo.ios.associatedDomains).toEqual([
      'applinks:app.mtb-bielefeld.de',
    ]);
  });

  /**
   * **Der teuerste Fehler dieser Datei**, und der einzige, den die Liste
   * oben überhaupt möglich macht: ein `bockelbrink`-Name in der
   * Vereinsfassung. Die alten Namen zeigen auf den Prüfstand; stünde einer
   * davon in prod, öffnete ein geteilter Link die Vereinsfassung auf
   * Prüfdaten — und niemand merkte es, weil es ja funktioniert.
   */
  it('lässt keine Domain der einen Umgebung in die andere', () => {
    const domains = (u: 'dev' | 'prod') =>
      baueKonfiguration(u).expo.ios.associatedDomains.join(' ');

    expect(domains('prod')).not.toContain('bockelbrink');
    expect(domains('prod')).not.toContain('-dev');
    expect(domains('dev')).not.toContain('applinks:app.mtb-bielefeld.de');
  });

  it('hält Android auf denselben Domains wie iOS', () => {
    for (const umgebung of ['dev', 'prod'] as const) {
      const konfig = baueKonfiguration(umgebung).expo;
      const hosts = konfig.ios.associatedDomains.map((d: string) => d.replace('applinks:', ''));
      expect(konfig.android.intentFilters[0].data).toEqual(
        hosts.flatMap((host: string) => [
          { scheme: 'https', host, pathPrefix: '/t' },
          { scheme: 'https', host, pathPrefix: '/e' },
        ]),
      );
    }
  });

  // Ohne Angabe muss dev herauskommen. Andersherum wäre ein vergessener
  // Schalter ein Bau, der auf die Vereinsdaten zeigt — und der fällt
  // niemandem auf, weil er ja funktioniert.
  it('nimmt alles außer dem ausdrücklichen „prod" als dev', () => {
    for (const eingabe of [undefined, '', 'produktion', 'PROD', 'dev']) {
      expect(baueKonfiguration(eingabe).expo.ios.bundleIdentifier).toBe('de.mtbbielefeld.app.dev');
    }
  });

  /**
   * Die Reihenfolge der Plugins ist tragend, nicht Geschmack: Die
   * Modifikationskette läuft von hinten nach vorn, und
   * `ohne-push-berechtigung` muss als Letztes greifen, um die Berechtigung
   * zu entfernen, die `expo-notifications` davor einträgt. Steht es
   * woanders, scheitert der Gerätebau mit „Personal development teams do
   * not support the Push Notifications capability" — und zwar erst dort,
   * nicht hier.
   */
  /**
   * **Der wichtigste Prüfstein dieser Datei.** Die Domain steht an zwei
   * Stellen: hier für das Betriebssystem und in `src/config.ts` für die
   * App. Laufen sie auseinander, öffnet ein geteilter Link den Browser
   * statt der App — und keine andere Prüfung im Projekt sieht das, auch
   * die Rauchprobe nicht: Die kennt nur `RAUCHPROBE_BASIS` und vergleicht
   * die ausgelieferte `appID`, nie die Adresse aus `waehleApiAdresse`.
   *
   * Geprüft wird die **erste** Adresse. Die dahinter sind alte Namen, die
   * nur noch entgegennehmen, was ältere Fassungen verschickt haben; die
   * App selbst spricht ausschließlich die erste an.
   */
  it('nennt an erster Stelle dieselbe Domain wie src/config.ts', () => {
    for (const umgebung of ['dev', 'prod'] as const) {
      const konfig = baueKonfiguration(umgebung).expo;
      const ausConfig = new URL(
        waehleApiAdresse({ ueberschrieben: undefined, umgebung, imEntwicklungsbau: false }),
      ).host;

      expect(konfig.ios.associatedDomains[0]).toBe(`applinks:${ausConfig}`);
      expect(konfig.android.intentFilters[0].data.slice(0, 2)).toEqual([
        { scheme: 'https', host: ausConfig, pathPrefix: '/t' },
        { scheme: 'https', host: ausConfig, pathPrefix: '/e' },
      ]);
    }
  });

  it('lässt ohne-push-berechtigung an erster Stelle', () => {
    for (const umgebung of ['dev', 'prod'] as const) {
      expect(baueKonfiguration(umgebung).expo.plugins[0]).toBe(
        './plugins/ohne-push-berechtigung.cjs',
      );
    }
  });

  /**
   * Ein eigenes Schema je Fassung, nicht nur eine eigene Bündelkennung.
   *
   * Der Anmeldelink läuft über das Schema, nicht über Universal Links. Zwei
   * Apps mit `mtbie` — und beide gleichzeitig installiert zu haben ist der
   * Zweck der eigenen Kennung — stritten sich um denselben Link, und iOS
   * entschiede unbestimmt.
   */
  it('gibt jeder Fassung ein eigenes Schema', () => {
    expect(baueKonfiguration('dev').expo.scheme).toBe('mtbie-dev');
    expect(baueKonfiguration('prod').expo.scheme).toBe('mtbie');
  });

  it('ändert nichts, was nicht von der Umgebung abhängt', () => {
    const dev = baueKonfiguration('dev').expo;
    const prod = baueKonfiguration('prod').expo;
    // `slug` muss gleich bleiben: Er ordnet beide Fassungen demselben
    // Expo-Projekt zu. Ein umgebungsabhängiger `slug` bräche das, und zwar
    // erst beim Veröffentlichen.
    expect(dev.slug).toBe(prod.slug);
    expect(dev.version).toBe(prod.version);
    expect(dev.plugins).toEqual(prod.plugins);
  });
});
