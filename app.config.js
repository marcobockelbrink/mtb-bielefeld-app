/**
 * Die App-Konfiguration — umgebungsabhängig.
 *
 * **Warum diese Datei JavaScript ist und nicht mehr `app.json`.** Zwei
 * Angaben müssen sich zwischen dev und prod unterscheiden, und in JSON
 * lassen sie sich nicht unterscheiden:
 *
 * 1. die **Bündelkennung**, damit beide Fassungen nebeneinander auf einem
 *    Telefon liegen können, statt einander zu überschreiben;
 * 2. die **angemeldete Domain** für Universal Links, die das Betriebssystem
 *    aus dem fertigen Bündel liest.
 *
 * Wer die Datei nach JSON zurückschreibt, verliert beides.
 *
 * **Die Variable heißt `EXPO_PUBLIC_APP_UMGEBUNG` und nicht `APP_UMGEBUNG`.**
 * Diese Datei läuft unter Node und könnte jeden Namen lesen — `src/config.ts`
 * dagegen landet im Bündel, und dort ersetzt Expo ausschließlich Variablen
 * mit dem Präfix `EXPO_PUBLIC_` durch ihren Wert. Ohne das Präfix stünde
 * dort zur Laufzeit `undefined`, und die App fiele stumm auf dev zurück,
 * während die Bündelkennung „prod" sagt. Ein Name für beide Seiten, damit
 * genau das nicht passieren kann.
 *
 * **Voreinstellung ist `dev`, und das ist die eigentliche Sicherung.** Wer
 * für den Verein baut, sagt es ausdrücklich (`EXPO_PUBLIC_APP_UMGEBUNG=prod`).
 * Andersherum wäre ein vergessener Schalter eine App, die auf die echten
 * Mitgliederdaten zeigt — und die fiele niemandem auf, weil sie ja
 * funktioniert. Ein dev-Bau, der versehentlich auf dem Prüfserver landet,
 * fällt dagegen sofort auf: Er heißt „MTB Bielefeld (dev)".
 *
 * Die Adressen stehen hier **und** in `src/config.ts` — hier für das
 * Betriebssystem, dort für die App selbst. Beide Stellen müssen dieselbe
 * Domain nennen; laufen sie auseinander, öffnet ein geteilter Link den
 * Browser statt der App, und keine Prüfung im Projekt merkt es außer der
 * Rauchprobe.
 */

// ESM und nicht CommonJS: `package.json` trägt `"type": "module"`, damit ist
// `.js` in diesem Projekt ESM. (Aus demselben Grund heißt das Config-Plugin
// daneben `ohne-push-berechtigung.cjs`.)
const UMGEBUNGEN = {
  dev: {
    kennung: 'de.mtbbielefeld.app.dev',
    name: 'MTB Bielefeld (dev)',
    domain: 'api-dev.bockelbrink.net',
    schema: 'mtbie-dev',
  },
  prod: {
    kennung: 'de.mtbbielefeld.app',
    name: 'MTB Bielefeld',
    domain: 'api.mtb-bielefeld.de',
    schema: 'mtbie',
  },
};

/**
 * Alles außer dem ausdrücklichen `'prod'` gilt als dev — auch ein Vertipper.
 * Die riskante Richtung braucht das genaue Wort.
 */
export function baueKonfiguration(umgebung) {
  const u = UMGEBUNGEN[umgebung === 'prod' ? 'prod' : 'dev'];

  return {
    expo: {
      name: u.name,
      slug: 'mtb-bielefeld-app',
      version: '0.8.0',
      orientation: 'portrait',
      icon: './assets/icon.png',
      userInterfaceStyle: 'automatic',
      ios: {
        supportsTablet: true,
        bundleIdentifier: u.kennung,
        infoPlist: {
          ITSAppUsesNonExemptEncryption: false,
        },
        associatedDomains: [`applinks:${u.domain}`],
      },
      android: {
        adaptiveIcon: {
          backgroundColor: '#25749E',
          foregroundImage: './assets/android-icon-foreground.png',
          backgroundImage: './assets/android-icon-background.png',
          monochromeImage: './assets/android-icon-monochrome.png',
        },
        package: u.kennung,
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: [{ scheme: 'https', host: u.domain, pathPrefix: '/t' }],
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
      web: {
        favicon: './assets/favicon.png',
      },
      // `./plugins/ohne-push-berechtigung.cjs` muss **erster** Eintrag
      // bleiben: Die Modifikationskette läuft von hinten nach vorn, das
      // Plugin greift also zuletzt und entfernt die Berechtigung, die
      // `expo-notifications` davor eingetragen hat. Steht es woanders,
      // scheitert der Gerätebau — und zwar erst dort, nicht in Tests.
      plugins: [
        './plugins/ohne-push-berechtigung.cjs',
        'expo-router',
        'expo-web-browser',
        'expo-background-task',
        ['expo-notifications', { color: '#25749E' }],
        'expo-system-ui',
        [
          'expo-splash-screen',
          {
            image: './assets/splash-icon.png',
            imageWidth: 280,
            resizeMode: 'contain',
            backgroundColor: '#ffffff',
            dark: {
              image: './assets/splash-icon-dark.png',
              backgroundColor: '#0f1519',
            },
          },
        ],
        'expo-image',
        'expo-secure-store',
      ],
      // **Auch das Schema unterscheidet sich, nicht nur die Bündelkennung.**
      // Der Anmeldelink läuft nicht über Universal Links, sondern über das
      // eigene Schema (`mtbie:///anmeldung/<token>`, siehe `APP_BASIS_URL`
      // in `betrieb/.env`). Trügen beide Fassungen `mtbie`, registrierten
      // zwei Apps dasselbe Schema — und genau das ist der Normalfall, denn
      // nebeneinander installierbar zu sein ist der Zweck der eigenen
      // Kennung. iOS entschiede dann unbestimmt, welche App den Link
      // bekommt; träfe es die falsche, schickte sie das Token an den
      // falschen Server und meldete einen ungültigen Link. Android zeigte
      // eine Auswahl mit zwei gleich aussehenden Einträgen.
      //
      // **Beim Umstellen zieht `APP_BASIS_URL` in der `.env` des
      // Prüfservers mit** (`mtbie-dev://`), sonst verschickt er Links, die
      // niemand einlösen kann.
      scheme: u.schema,
    },
  };
}

// Expo ruft die Vorgabe auf und liest die Umgebung aus dem Prozess; Tests
// und `tools/rauchprobe.mts` rufen `baueKonfiguration` mit einem Wert auf,
// statt am globalen Zustand zu drehen.
export default () => baueKonfiguration(process.env.EXPO_PUBLIC_APP_UMGEBUNG);
