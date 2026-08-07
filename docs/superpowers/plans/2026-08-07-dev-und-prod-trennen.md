# Dev und Prod trennen

> **Für agentische Umsetzer:** ERFORDERLICHE UNTERFÄHIGKEIT:
> `superpowers:subagent-driven-development`. Schritte tragen `- [ ]`.

**Ziel:** Zwei getrennte Vereins-APIs — eine zum Entwickeln auf Marcos
Server, eine für den Verein — und eine App, die beim Bauen festlegt, mit
welcher sie spricht.

**Vorgehen:** Der Server ist bereits vollständig über `betrieb/.env`
parametrisiert; ein zweiter Aufbau ist eine zweite Maschine mit einer
zweiten `.env`. Die Arbeit steckt in der App: Sie kennt heute nur
`__DEV__` oder nicht und braucht drei Ziele. Dazu bekommt die dev-Fassung
eine eigene Bündelkennung, damit beide nebeneinander auf einem Telefon
liegen können.

**Werkzeuge:** Expo SDK 57 (dynamische Konfiguration über `app.config.js`),
`EXPO_PUBLIC_*`-Variablen, Caddy mit `{$VAR}`-Platzhaltern.

## Warum überhaupt

Bis heute gibt es einen Server, und der ist zugleich Spielwiese und
Ernstfall. Solange keine echten Mitgliederdaten darin liegen, kostet das
nichts — danach ist jeder Versuch ein Eingriff in Vereinsdaten. Die
Trennung ist genau jetzt billig und wird es nie wieder sein.

Dazu kommt der Besitz: Die Vereinsdaten gehören auf eine Maschine des
Vereins, nicht auf Marcos. Wer ausscheidet, nimmt sonst die
Mitgliederdatenbank mit.

## Projektweite Bedingungen

- Das Repository ist öffentlich — **keine Geheimnisse**, auch keine
  Domainnamen mit Zugangsdaten. `betrieb/.env` bleibt unversioniert.
- Paketversionen ausschließlich über `npx expo install`.
- Code, Kommentare, Texte auf Deutsch.
- Die App muss ohne API vollständig benutzbar bleiben.
- **Prod-Zugangsdaten liegen nie auf Marcos Rechner in einer Datei, die
  ein Bau lesen könnte.** Der prod-Bau bekommt seine Adresse aus einer
  Variablen, nicht aus einer eingecheckten Vorgabe.

## Die drei Ziele

| Ziel | API | Bündelkennung | Name auf dem Telefon |
| --- | --- | --- | --- |
| lokal | `http://localhost` | `de.mtbbielefeld.app.dev` | MTB Bielefeld (dev) |
| dev | `https://api-dev.bockelbrink.net` | `de.mtbbielefeld.app.dev` | MTB Bielefeld (dev) |
| prod | `https://api.mtb-bielefeld.de` | `de.mtbbielefeld.app` | MTB Bielefeld |

Lokal und dev teilen sich die Kennung mit Absicht: Beides ist dieselbe
Fassung, nur mit anderem Gegenüber, und drei Symbole auf dem Startbildschirm
verwirren mehr, als sie helfen.

`api-dev.bockelbrink.net` steht seit dem 07.08.2026 im DNS und zeigt auf
dieselbe Maschine wie `api.bockelbrink.net` (169.58.129.20). Der alte Name
wird damit frei: Bis zur Umstellung tragen beide denselben Aufbau, danach
kann `api.bockelbrink.net` weg. Kein Mitglied hat je einen Link darauf
bekommen, also bricht nichts.

## Dateien

- **Neu** `app.config.js` — ersetzt `app.json`. Liest `APP_UMGEBUNG`
  (`dev` voreingestellt, `prod` ausdrücklich) und setzt daraus
  `bundleIdentifier`, `android.package`, `name` sowie
  `associatedDomains`/`intentFilters`.
- **Ändern** `src/config.ts` — `API_BASE_URL` leitet sich aus
  `EXPO_PUBLIC_API_URL` und der Umgebung ab statt aus `__DEV__` allein.
- **Ändern** `package.json` — benannte Befehle je Ziel.
- **Ändern** `betrieb/Caddyfile` — die `appID` in der
  `apple-app-site-association` kommt aus `{$AASA_APP_ID}`, damit jeder
  Aufbau seine eigene nennt.
- **Ändern** `betrieb/.env.beispiel`, `betrieb/SERVER.md`, `README.md`,
  `docs/ARCHITEKTUR.md`, `CLAUDE.md`.
- **Ändern** `tools/rauchprobe.mts` — der `appID`-Abgleich muss die
  Umgebung berücksichtigen, sonst schlägt er gegen den dev-Server fehl.

## Aufgaben

### Aufgabe 1: `app.config.js` mit zwei Umgebungen

**Dateien:** Neu `app.config.js`, löschen `app.json`, Test
`tests/appKonfiguration.test.ts`.

**Produziert:** `APP_UMGEBUNG=dev|prod`; die dev-Fassung trägt
`de.mtbbielefeld.app.dev`.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

```ts
// tests/appKonfiguration.test.ts
import { describe, expect, it } from 'vitest';

async function konfig(umgebung: string) {
  process.env.APP_UMGEBUNG = umgebung;
  const modul = await import(`../app.config.js?${umgebung}`);
  return modul.default({ config: {} }).expo ?? modul.default({ config: {} });
}

describe('app.config.js', () => {
  it('gibt der dev-Fassung eine eigene Bündelkennung', async () => {
    const dev = await konfig('dev');
    expect(dev.ios.bundleIdentifier).toBe('de.mtbbielefeld.app.dev');
    expect(dev.android.package).toBe('de.mtbbielefeld.app.dev');
    expect(dev.name).toContain('dev');
  });

  it('lässt prod die schlichte Kennung', async () => {
    const prod = await konfig('prod');
    expect(prod.ios.bundleIdentifier).toBe('de.mtbbielefeld.app');
    expect(prod.android.package).toBe('de.mtbbielefeld.app');
    expect(prod.name).toBe('MTB Bielefeld');
  });

  // Der teuerste Fehler wäre eine prod-Fassung, die auf den dev-Server
  // zeigt. Sie darf die dev-Domain gar nicht erst anmelden.
  it('meldet je Umgebung nur die eigene Domain an', async () => {
    const dev = await konfig('dev');
    const prod = await konfig('prod');
    expect(dev.ios.associatedDomains).toEqual(['applinks:api-dev.bockelbrink.net']);
    expect(prod.ios.associatedDomains).toEqual(['applinks:api.mtb-bielefeld.de']);
  });

  // Ohne gesetzte Variable muss dev herauskommen. Wer prod will, sagt es.
  it('nimmt ohne Angabe dev', async () => {
    delete process.env.APP_UMGEBUNG;
    const ohne = await konfig('');
    expect(ohne.ios.bundleIdentifier).toBe('de.mtbbielefeld.app.dev');
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`npx vitest run tests/appKonfiguration.test.ts` — erwartet: scheitert,
`app.config.js` gibt es nicht.

- [ ] **Schritt 3: `app.json` nach `app.config.js` überführen**

Den ganzen bisherigen Inhalt von `app.json` übernehmen und nur die
umgebungsabhängigen Felder ableiten. Der Kopfkommentar muss erklären,
**warum** die Datei jetzt JavaScript ist — sonst schreibt sie jemand
zurück nach JSON:

```js
/**
 * Die App-Konfiguration, umgebungsabhängig.
 *
 * Früher `app.json`. Jetzt JavaScript, weil zwei Dinge sich zwischen dev
 * und prod unterscheiden müssen und in JSON nicht unterscheiden lassen:
 * die Bündelkennung (damit beide Fassungen nebeneinander auf einem
 * Telefon liegen können) und die angemeldete Domain für Universal Links.
 *
 * **Voreinstellung ist `dev`.** Wer prod baut, sagt es ausdrücklich
 * (`APP_UMGEBUNG=prod`). Andersherum wäre ein vergessener Schalter ein
 * Bau, der auf die Vereinsdaten zeigt — und der fällt niemandem auf,
 * weil er ja funktioniert.
 */
const UMGEBUNGEN = {
  dev: {
    kennung: 'de.mtbbielefeld.app.dev',
    name: 'MTB Bielefeld (dev)',
    domain: 'api-dev.bockelbrink.net',
  },
  prod: {
    kennung: 'de.mtbbielefeld.app',
    name: 'MTB Bielefeld',
    domain: 'api.mtb-bielefeld.de',
  },
};

module.exports = () => {
  const u = UMGEBUNGEN[process.env.APP_UMGEBUNG === 'prod' ? 'prod' : 'dev'];
  return {
    expo: {
      // … unverändert aus app.json: slug, version, orientation, icon,
      //    userInterfaceStyle, splash, plugins, scheme, extra, web …
      name: u.name,
      ios: {
        supportsTablet: true,
        bundleIdentifier: u.kennung,
        infoPlist: { ITSAppUsesNonExemptEncryption: false },
        associatedDomains: [`applinks:${u.domain}`],
      },
      android: {
        // … adaptiveIcon unverändert …
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
    },
  };
};
```

**Achtung, `plugins`:** `./plugins/ohne-push-berechtigung.cjs` muss
**erster** Eintrag bleiben — die Modifikationskette läuft von hinten nach
vorn. Steht er woanders, schreibt `expo-notifications` die
Push-Berechtigung zurück und der Gerätebau scheitert.

- [ ] **Schritt 4: Test laufen lassen, grün**

- [ ] **Schritt 5: Prüfen, dass Expo die Datei tatsächlich liest**

```bash
npx expo config --type public | grep -E "bundleIdentifier|associatedDomains"
APP_UMGEBUNG=prod npx expo config --type public | grep -E "bundleIdentifier|associatedDomains"
```

Erwartet: `.dev` und `api-dev.bockelbrink.net` im ersten Fall, ohne `.dev`
und `api.mtb-bielefeld.de` im zweiten. **Das ist der eigentliche
Nachweis** — der Test oben prüft nur die Datei, nicht ob Expo sie
verwendet.

- [ ] **Schritt 6: Festschreiben**

```bash
git add app.config.js tests/appKonfiguration.test.ts && git rm app.json
git commit -m "app.config.js: dev und prod bekommen eigene Bündelkennungen"
```

---

### Aufgabe 2: `API_BASE_URL` je Umgebung

**Dateien:** Ändern `src/config.ts:112-155`, Test `tests/config.test.ts`.

**Verbraucht:** `APP_UMGEBUNG` aus Aufgabe 1.
**Produziert:** `API_BASE_URL` und `TEILEN_BASIS_URL` mit drei Zielen.

- [ ] **Schritt 1: Den scheiternden Test schreiben**

```ts
// in tests/config.test.ts
import { describe, expect, it } from 'vitest';

async function frisch(env: Record<string, string | undefined>, dev: boolean) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
  const modul = await import(`../src/config.ts?${JSON.stringify(env)}${dev}`);
  return modul.API_BASE_URL as string;
}

describe('API_BASE_URL', () => {
  it('zeigt beim Entwickeln auf den örtlichen Aufbau', async () => {
    expect(await frisch({ EXPO_PUBLIC_API_URL: undefined, APP_UMGEBUNG: 'dev' }, true))
      .toBe('http://localhost');
  });

  it('zeigt in der dev-Fassung auf Marcos Server', async () => {
    expect(await frisch({ EXPO_PUBLIC_API_URL: undefined, APP_UMGEBUNG: 'dev' }, false))
      .toBe('https://api-dev.bockelbrink.net');
  });

  it('zeigt in der prod-Fassung auf den Vereinsserver', async () => {
    expect(await frisch({ EXPO_PUBLIC_API_URL: undefined, APP_UMGEBUNG: 'prod' }, false))
      .toBe('https://api.mtb-bielefeld.de');
  });

  // Der Weg fürs echte Telefon im WLAN — dort ist `localhost` das Telefon
  // selbst. Muss alles andere schlagen.
  it('lässt sich mit EXPO_PUBLIC_API_URL überschreiben', async () => {
    expect(await frisch({ EXPO_PUBLIC_API_URL: 'http://192.168.1.5', APP_UMGEBUNG: 'prod' }, true))
      .toBe('http://192.168.1.5');
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

- [ ] **Schritt 3: `API_BASE_URL` umbauen**

```ts
const UMGEBUNG = process.env.APP_UMGEBUNG === 'prod' ? 'prod' : 'dev';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  ((globalThis as { __DEV__?: boolean }).__DEV__ === true
    ? 'http://localhost'
    : UMGEBUNG === 'prod'
      ? 'https://api.mtb-bielefeld.de'
      : 'https://api-dev.bockelbrink.net');
```

Den bestehenden Kommentarblock erweitern: `__DEV__` schlägt die Umgebung,
weil beim Entwickeln immer der örtliche Aufbau gemeint ist — auch in
einem prod-Bau, der gerade über Metro läuft.

- [ ] **Schritt 4: Test laufen lassen, grün**
- [ ] **Schritt 5: Festschreiben**

---

### Aufgabe 3: Benannte Befehle

**Dateien:** Ändern `package.json`.

- [ ] **Schritt 1: Die Befehle eintragen**

```json
"start":        "expo start",
"start:dev":    "EXPO_PUBLIC_API_URL=https://api-dev.bockelbrink.net expo start",
"ios":          "expo run:ios",
"ios:dev":      "EXPO_PUBLIC_API_URL=https://api-dev.bockelbrink.net expo run:ios",
"bau:prod":     "APP_UMGEBUNG=prod expo prebuild --clean -p ios"
```

`start` bleibt der örtliche Aufbau — der häufigste Fall soll der
kürzeste Befehl bleiben.

- [ ] **Schritt 2: Beide prüfen**

```bash
npm run start:dev   # Metro startet, danach Strg+C
npx expo config --type public | grep bundleIdentifier
```

- [ ] **Schritt 3: Festschreiben**

---

### Aufgabe 4: Die `appID` je Aufbau

**Dateien:** Ändern `betrieb/Caddyfile`, `betrieb/.env.beispiel`,
`tools/rauchprobe.mts`.

**Warum:** Die `apple-app-site-association` nennt heute fest
`DH3N3RBQX3.de.mtbbielefeld.app`. Der dev-Server muss aber
`…app.dev` nennen und der Vereinsserver die Team-Kennung des Vereins —
sonst öffnet der geteilte Link genau dort nicht die App, wo es zählt.

- [ ] **Schritt 1: Platzhalter in die Caddy-Datei**

```
respond `{"applinks":{"apps":[],"details":[{"appID":"{$AASA_APP_ID}","paths":["/t/*"]}]}}` 200
```

Dazu in `betrieb/.env.beispiel`:

```bash
# Die App-Kennung für Universal Links: <Apple-Team-ID>.<Bündelkennung>.
# Auf dem dev-Server endet sie auf `.dev`, auf dem Vereinsserver nicht.
# Steht sie falsch, öffnet der geteilte Link stumm den Browser statt der
# App — und keine Prüfung im Projekt merkt es außer der Rauchprobe.
AASA_APP_ID=DH3N3RBQX3.de.mtbbielefeld.app.dev
```

- [ ] **Schritt 2: Prüfen, dass Caddy den Platzhalter füllt**

```bash
docker compose -f betrieb/docker-compose.yml up -d
docker compose -f betrieb/docker-compose.yml restart caddy   # liest die Datei nicht von selbst neu
curl -s http://localhost/.well-known/apple-app-site-association
```

Erwartet: die Kennung aus der `.env`, nicht der Text `{$AASA_APP_ID}`.

- [ ] **Schritt 3: Die Rauchprobe an die Umgebung anpassen**

`tools/rauchprobe.mts:546` liest heute `app.json` — die Datei gibt es
nach Aufgabe 1 nicht mehr, die Rauchprobe bricht also ab. Sie muss
stattdessen `app.config.js` laden, **nicht** die Kennung ein zweites Mal
hinschreiben: Zwei Stellen mit derselben Wahrheit laufen auseinander, und
dieser Prüfstein existiert gerade, um Auseinanderlaufen zu bemerken.

```ts
const appKonfig = (await import('../app.config.js')).default();
const buendel = appKonfig.expo.ios.bundleIdentifier;
```

Damit prüft die Rauchprobe automatisch das Richtige: Läuft sie mit
`APP_UMGEBUNG=prod`, erwartet sie die prod-Kennung.

- [ ] **Schritt 4: `npm run rauchprobe`, grün**
- [ ] **Schritt 5: Festschreiben**

---

### Aufgabe 5: Den dev-Server umstellen und nachweisen

**Dateien:** keine im Repository — `betrieb/.env` auf dem Server
(unversioniert).

**Vorher mit Marco abstimmen:** Das ändert einen laufenden Server.

- [ ] **Schritt 1: `AASA_APP_ID` in der Server-`.env` setzen**

```bash
ssh -i ~/.ssh/mtb-verein verein@169.58.129.20
cd ~/mtb-bielefeld-app && git pull
echo 'AASA_APP_ID=DH3N3RBQX3.de.mtbbielefeld.app.dev' >> betrieb/.env
cd betrieb && docker compose up -d --build && docker compose restart caddy
```

- [ ] **Schritt 2: Von außen nachmessen**

```bash
curl -s https://api-dev.bockelbrink.net/.well-known/apple-app-site-association
```

Erwartet: `…app.dev`.

- [ ] **Schritt 3: Auf dem Simulator nachweisen**

```bash
npm run ios:dev
xcrun simctl openurl booted "https://api-dev.bockelbrink.net/t/<kennung>"
```

**Erwartet: die App öffnet sich beim Training, nicht Safari.** Geht
Safari auf, ist der Nachweis gescheitert — dann wird das so berichtet,
nicht weggeredet. Zwei Fallen dabei stehen in `docs/ARCHITEKTUR.md`
unter „Universal Links"; lies sie vorher.

- [ ] **Schritt 4: Festschreiben** (nur die Dokumentation)

---

### Aufgabe 6: Dokumentation

**Dateien:** `betrieb/SERVER.md`, `README.md`, `docs/ARCHITEKTUR.md`,
`CLAUDE.md`.

- [ ] **Schritt 1: `betrieb/SERVER.md`** um einen Abschnitt „Zwei
  Aufbauten" ergänzen: welche Maschine welche Rolle hat, welche vier
  Werte sich in der `.env` unterscheiden (`API_DOMAIN`, `API_BASIS_URL`,
  `AASA_APP_ID`, die SMTP-Daten), und **dass die Datenbanken getrennt
  bleiben müssen** — ein gemeinsamer Postgres wäre der ganze Sinn der
  Übung verfehlt.

- [ ] **Schritt 2: `CLAUDE.md`** um eine sechste Falle ergänzen: Ein Bau
  ohne `APP_UMGEBUNG` ist ein dev-Bau. Wer eine Fassung für den Verein
  baut und das vergisst, bekommt eine App, die auf Marcos Server zeigt —
  mit grünen Tests, grüner Typprüfung und fehlerfreiem Bündel.

- [ ] **Schritt 3: `README.md`** — Tabelle der drei Ziele.

- [ ] **Schritt 4: Festschreiben**

## Was dieser Plan bewusst nicht tut

- **Kein eigenes Symbol für die dev-Fassung.** Der Name unter dem Symbol
  trägt `(dev)`, das genügt zum Unterscheiden. Ein zweites Symbolset
  hieße `tools/logo-assets.py` umbauen — Aufwand ohne Gegenwert.
- **Kein Umschalter in den Einstellungen.** Ausdrücklich abgewählt: Er
  stünde im ausgelieferten Programm und richtete im Zweifel die App eines
  Mitglieds auf einen fremden Server.
- **Keine automatische Auslieferung.** Erst wenn ein Mensch entscheidet,
  wann der Verein etwas Neues bekommt.

## Was danach noch fehlt — und nicht von uns abhängt

- **Die Maschine des Vereins.** Ohne sie ist prod eine Konfiguration
  ohne Ziel.
- **Ein bezahltes Apple-Entwicklerkonto des Vereins.** Dessen Team-ID
  gehört in `AASA_APP_ID` auf dem Vereinsserver. Bis dahin lässt sich
  prod nicht zu Ende prüfen — dev dagegen vollständig.
- **`api.mtb-bielefeld.de` im DNS.**

## Prüfen

```bash
npm test
npm run typecheck
npx expo install --check
npx expo config --type public                      # dev-Werte
APP_UMGEBUNG=prod npx expo config --type public    # prod-Werte
npm run rauchprobe
```

Dazu der Simulator-Nachweis aus Aufgabe 5. Keine der übrigen Prüfungen
tippt einen Link an — sie können nicht zeigen, ob die Trennung auf einem
Gerät hält.
