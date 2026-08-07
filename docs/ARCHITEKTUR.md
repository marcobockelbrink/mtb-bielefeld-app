# Architektur

Wie dieses Projekt aufgebaut ist und **warum** — die Begründungen sind der
eigentliche Inhalt. Was die App kann, steht im [README](../README.md); die
Fallstricke bei der täglichen Arbeit in [CLAUDE.md](../CLAUDE.md).

Wer das Projekt übernimmt, sollte dieses Dokument einmal ganz lesen. Es ist
kürzer als der Code, und die Entscheidungen darin sind es, die man später
teuer bezahlt, wenn man sie ohne Kenntnis umdreht.

## Die eine Regel

> **Die App muss ohne Server vollständig benutzbar bleiben.**

Das ist keine Vorsichtsmaßnahme, sondern die tragende Entscheidung des
Projekts. Alles Weitere folgt daraus.

Ein Mountainbike-Verein hat kein Rechenzentrum und keinen Bereitschaftsdienst.
Was passiert, wenn der Server ausfällt und niemand Zeit hat? Wenn die
Terminliste dann leer bliebe, wäre die App genau an dem Abend kaputt, an dem
jemand wissen will, wo sich morgen das MittwochsRudel trifft. Also holt die App
Termine und Beiträge **direkt** von Google Calendar und der Vereinswebsite —
ohne Umweg über eigene Technik.

Der Server ist ein **Zusatz** für das, was ohne ihn nicht geht: wissen, wer
mitfährt. Fällt er aus, verschwindet dieser Zusatz, und der Rest bleibt.

Praktisch heißt das drei Dinge:

- Kein Bildschirm wartet beim Start auf eine Antwort des Servers.
- Kein Fehler des Servers leert eine Ansicht oder verdrängt Inhalt.
- Der Mail-Knopf zum Anmelden bleibt **immer** erreichbar. Ohne Netz ist der
  Mail-Entwurf die einzige Anmeldung, die noch geht — im Wald der Normalfall.

Wer eine Änderung plant, prüfe sie an dieser Regel zuerst.

## Die Teile

```
┌─────────────┐   iCal, RSS, HTML   ┌──────────────────────┐
│             │────────────────────▶│ Google Calendar      │
│             │   (direkt, immer)   │ mtb-bielefeld.de     │
│  App        │                     └──────────────────────┘
│  iOS/Android│
│             │   HTTPS + Token     ┌──────────────────────┐
│             │────────────────────▶│ Vereins-API          │
└─────────────┘   (nur Anmeldung    │ Fastify + Postgres   │
                   und Teilnahme)   └──────────────────────┘
                                              │
                                     ┌────────┴────────┐
                                     │ Caddy (TLS,     │
                                     │ Ratenbegrenzung)│
                                     └─────────────────┘
```

Zwei Datenwege, bewusst getrennt:

| | Termine, Beiträge, Vereinstexte | Anmeldung, Teilnahme |
| --- | --- | --- |
| Quelle | Google Calendar, Website | eigene API |
| Braucht Konto | nein | ja |
| Fällt sie aus | die App ist unbrauchbar | ein Zusatz fehlt |
| In der App | `src/data/repository.ts` | `src/data/api.ts` |

`repository.ts` und `api.ts` liegen deshalb nebeneinander und nicht
ineinander. Wer sie zusammenlegt, hängt die Terminliste an einen Server, den
sie nicht braucht — und bricht die eine Regel.

## Die App

```
app/                       Bildschirme (expo-router: Dateiname = Adresse)
  (tabs)/index.tsx           Termine
  (tabs)/news.tsx            Aktuelles
  (tabs)/verein.tsx          Verein & Mitmachen
  (tabs)/jugend.tsx          Jugendtrainings
  einstellungen.tsx          Erinnerungen und Konto — bewusst kein Reiter
  termin/[id].tsx            Termin-Detailansicht
  news/[id].tsx              Beitrag-Detailansicht
  jugend/[id].tsx            ein Training: Belegung, Guides, Kind anmelden
  jugend/neu.tsx             Entwurf anlegen (nur Guides)
  t/[id].tsx                 Ziel eines geteilten Links (Universal Link)
  anmeldung/[token].tsx      Ziel des Links aus der Anmeldemail

src/
  config.ts                Adressen aller Quellen — hier wird getauscht
  brand.ts                 die Vereinsfarbe, an genau einer Stelle
  theme.ts                 Farben, Schriften, Abstände
  domain/
    types.ts                 Datentypen, unabhängig von iCal und RSS
    terminSchluessel.ts      geteilt mit der API (siehe unten)
  data/
    ical/ rss/ parse/        Kalender, Feed und Beschreibungen auswerten
    repository.ts            Abruf + Zwischenspeicher
    api.ts                   Zugang zur Vereins-API
    tokenSpeicher.ts         Schnittstelle + Fassung für Tests
    secureTokenSpeicher.ts   Anbindung an den Schlüsselbund
    jugend.ts                Jugendtrainings holen, anlegen, anmelden
  konto/
    KontoContext.tsx         wer angemeldet ist, und der Magic Link
    magicLink.ts             Token aus der angetippten Adresse ziehen
    einloesenFehler.ts       Fehler → deutscher Satz
    anfordernFehler.ts       Fehler → deutscher Satz
  features/events/         Filter, Aufbereitung, Terminkarte, Teilnahmekarte
  features/jugend/         Trainingskarte, Anmeldeformular, Guide-Ansicht,
                           Teilen-Text, Fehler → deutscher Satz
  notifications/           Erinnerungen
  content/club.ts          Vereinstexte, von Hand gepflegt
  ui/                      wiederverwendete Bausteine
```

### Das durchgehende Muster: Rechenlogik ohne React Native

Jedes Stück Logik, das ohne Gerät auskommt, steht in einer eigenen Datei ohne
React-Native-Import. Die Anbindung ans Betriebssystem liegt daneben:

| Rechenlogik (getestet) | Anbindung (ungetestet) |
| --- | --- |
| `notifications/scheduler.ts` | `notifications/index.ts` |
| `data/backgroundRefresh.ts` | `data/backgroundTask.ts` |
| `data/store.ts` | `data/asyncStorageStore.ts` |
| `data/tokenSpeicher.ts` | `data/secureTokenSpeicher.ts` |

Der Grund ist praktisch: Die 240 Tests laufen in einem Bruchteil einer Sekunde, ohne Simulator
und ohne Gerät. Sobald React Native in einer Datei landet, ist sie für die
Testsuite verloren — `expo-secure-store` zieht React Native nach, dessen
Quelltext Flow-Syntax enthält, an der vitest scheitert. Ein einziger falsch
gesetzter Import kann deshalb eine ganze Testdatei mitreißen.

### Fehler werden übersetzt, nicht durchgereicht

Vier Module machen aus einem Fehler einen Satz, den ein Vereinsmitglied
versteht:

| Modul | Wofür |
| --- | --- |
| `data/api.ts` | Netzfehler und Zeitablauf (Status 0) |
| `konto/anfordernFehler.ts` | Anmeldelink anfordern |
| `konto/einloesenFehler.ts` | Anmeldelink einlösen |
| `features/events/teilnahmeFehler.ts` | zu einer Tour an- und abmelden |

Sie sind **nach Statuscodes sortiert, aber nach Handlung gebaut**: Die Frage
ist nie „welcher Code ist das", sondern „was soll die Person als Nächstes
tun". Deshalb heißt ein 429 überall „warte eine Minute" und nicht „zu viele
Anfragen", und deshalb teilen sich alle vier dieselben Konstanten
(`NICHT_ERREICHBAR`, `ZU_VIELE_VERSUCHE`) — dieselbe Lage soll nicht je nach
Bildschirm anders heißen.

Eine Feinheit, die teuer war: `ApiFehler` merkt sich, **ob sein Text von der
API stammt**. Die Vereins-API schreibt ihre Fehler selbst und für Menschen
(„Die Tour ist voll."); Fastify reicht bei 5xx ohne eigenen Fehlerbehandler
dagegen den rohen Text der Ursache durch. Ohne diese Unterscheidung bliebe nur
die Wahl zwischen „alles durchreichen" — dann liest ein Mitglied „canceling
statement due to statement timeout" — und „nichts durchreichen", womit die
guten Sätze der API verloren gingen.

## Die Vereins-API

Fastify 5 auf Node, Postgres 16 (`pg`, kein ORM), rohes SQL. Kein Framework mehr als
nötig: Der Verein soll das lesen und weiterführen können.

```
api/src/
  app.ts                 alle Routen, Ratenbegrenzung je IP
  server.ts              Netzwerk, Signalbehandlung
  start.ts               erst migrieren, dann starten
  datenbank.ts           Verbindungspool
  anmeldung.ts           Magic Link anfordern
  sitzung.ts             Token einlösen, erneuern, beenden
  konto.ts               Auskunft und Löschung
  einladung.ts           Einladungscodes
  tourenanmeldung.ts     an- und abmelden, Belegung
  termine.ts             Kalender lesen (nutzt src/data/ical/)
  mailer.ts              SMTP, austauschbar
  ipbegrenzung.ts        Notbremse je IP
  aufraeumen.ts          abgelaufene Token und Sitzungen löschen
  migrationen/           nummerierte .sql + ein Läufer in 62 Zeilen
```

### Anmeldung ohne Passwort

Es gibt keine Passwörter. Wer sich anmeldet, bekommt einen Link per Mail.

```
POST /anmeldung/anfordern   { email, einladungscode? }  → 202, immer gleich
   ↓ Mail mit mtbie:///anmeldung/<token>
POST /anmeldung/einloesen   { token }                   → { zugang, erneuerung }
   ↓
GET  /konto                 Authorization: Bearer …
POST /sitzung/erneuern      { erneuerung }              → neues Paar
```

Zwei Token mit verschiedenen Aufgaben:

| | Gültig | Liegt |
| --- | --- | --- |
| **Zugangs-Token** | 15 Minuten | nur im Arbeitsspeicher der App |
| **Erneuerungs-Token** | 60 Tage | im Schlüsselbund (iOS Keychain, Android Keystore) |

Niemals in AsyncStorage — dort liegt alles im Klartext auf dem Gerät. In der
Datenbank stehen ausschließlich SHA-256-Hashes; wer die Datenbank liest, kann
sich damit nicht anmelden.

Beim Erneuern wird das Erneuerungs-Token **rotiert**. Taucht ein bereits
verbrauchtes wieder auf, ist das das Muster eines Diebstahls, und die API
löscht **alle** Sitzungen des Mitglieds. Das hat eine Folge, die man leicht
übersieht: Zwei gleichzeitige Anfragen der App dürfen niemals zwei
Erneuerungen loslösen, sonst meldet sich die App im Normalbetrieb selbst ab.
`api.ts` teilt deshalb eine laufende Erneuerung über ein Promise.

### Warum die API nie verrät, ob eine Adresse bekannt ist

`POST /anmeldung/anfordern` antwortet **immer** gleich — gleicher Statuscode,
gleicher Text, gleiche Laufzeit —, ob die Adresse im Verein bekannt ist oder
nicht. Sonst wäre der Endpunkt ein Auskunftsdienst darüber, wer Mitglied ist.

Dasselbe gilt bei der Gästeanmeldung: Ein 409 „schon angemeldet" für eine
fremde Adresse würde verraten, dass diese Person mitfährt. Die API täuscht
dort einen Erfolg vor — samt hochgezählter Belegung, denn eine halbe Lüge wäre
keine. Der Mailversand läuft aus demselben Grund **nach** der Antwort: Sonst
verriete die Antwortzeit, ob wirklich eine Mail hinausging.

Wer hier etwas ändert, prüfe jede Antwort auf Statuscode, Text, Zahlen **und
Laufzeit**.

### Ratenbegrenzung in drei Schichten

| Schicht | Wogegen | Wo |
| --- | --- | --- |
| je IP, in Caddy | Anfrageflut auf den Server | `betrieb/Caddyfile` |
| je IP, in der API | dieselbe Flut, falls Caddy fehlt | `ipbegrenzung.ts` |
| je Adresse, in der Datenbank | dass ein Postfach geflutet wird | `anmeldung.ts` |

Keine ersetzt die andere: Caddy sieht den Anfragekörper nicht und kann nicht
je Adresse begrenzen; die Adressgrenze schützt nicht vor einer Flut über viele
Adressen.

Die Belegungsabfrage `GET /termine/:schluessel` ist **absichtlich ausgenommen**
— eine App, die eine Terminliste öffnet, stellt je Termin eine solche Anfrage
und risse jede sinnvolle Grenze im Normalbetrieb. Eine Notbremse, die den
Normalfall bremst, ist keine Notbremse mehr, sondern ein Fehler.

### `trustProxy` — die Stelle, an der man alles kaputt machen kann

Hinter Caddy sähe die API sonst für jede Anfrage die Adresse des Proxys: ein
einziger Eimer für den ganzen Verein. `trustProxy` steht deshalb auf den
Adressbereich des Compose-Netzes — **nicht auf `true`**, denn dann glaubte die
API jedem `X-Forwarded-For`, den ein Angreifer selbst mitschickt.

Dass die Fälschung nicht durchkommt, hängt an einer Eigenschaft von Caddy:
Er **ersetzt** ein mitgeschicktes `X-Forwarded-For` durch die echte Adresse,
solange `trusted_proxies` leer bleibt. Wer diese Zeile einträgt — der
naheliegende Handgriff, sobald ein CDN davorsteht —, macht die Begrenzung je
IP wertlos, **ohne dass ein Test rot wird**. `betrieb/pruefe-begrenzung.sh`
prüft beides gegen den laufenden Aufbau.

### Der geteilte Terminschlüssel

App und API müssen sich darüber einig sein, welcher Kalendereintrag gemeint
ist. Bei einem Serientermin genügt die `uid` nicht — sie ist für alle
Wiederholungen dieselbe. Deshalb:

```ts
termin.recurring ? `${termin.uid}~${termin.originalStartInstant}` : termin.uid
```

`src/domain/terminSchluessel.ts` wird von beiden Seiten importiert, damit es
nur eine Rechnung gibt. Der Schlüssel wird **nie zerlegt, nur verglichen**.

Auch die Kalenderauswertung selbst ist geteilt: Die API importiert
`src/data/ical/` und `src/data/parse/` direkt aus dem App-Quelltext. So kann
die Bedeutung eines Termins nicht zwischen App und Server auseinanderlaufen.

## Zeit wird in Ortszeit gerechnet

Serientermine werden in Bielefelder Ortszeit ausgerechnet und **erst danach**
in echte Zeitpunkte umgewandelt (`src/data/ical/`). Nur so bleibt das
MittwochsRudel über die Zeitumstellung hinweg um 18:00 Uhr, statt auf 17:00 zu
wandern. Wer hier mit Millisekunden rechnet, bricht es.

## Betrieb

`betrieb/docker-compose.yml` startet vier Container: Postgres, die API, Caddy
als Proxy davor, Mailpit als Postfach daneben. Postgres und API haben **keine
Portfreigabe** — erreichbar ist die API ausschließlich über Caddy, genau wie
später auf dem Server.

Der Unterschied zwischen diesem Aufbau und einem echten Server ist klein und
aufgezählt: Er steht im Kopf von `betrieb/docker-compose.yml`, damit aus
„Simulation" kein Selbstbetrug wird.

## Wie geprüft wird — und wo jede Stufe blind ist

Vier Stufen, jede sieht etwas, das die davor nicht sehen kann:

| Befehl | Sieht | Ist blind für |
| --- | --- | --- |
| `npm test` | Rechenlogik, 240 Tests in ~0,3 s | alles, was ein Gerät oder einen Server braucht |
| `npm run typecheck` | Typfehler | ob es sich sinnvoll verhält |
| `npm run vorschau` | ob die Oberfläche etwas darstellt | ob sie mit der API zusammenspielt |
| `npm run rauchprobe` | die echten Module gegen die laufende API | React Native, Bildschirme, angetippte Links |

Für jede Stufe gibt es einen Fehler, den nur sie gefunden hat:

- **Die Testsuite** stellt `fetch` selbst — und eine Attrappe antwortet immer
  so, wie der Schreibende es erwartet hat. Der API-Zugang setzte
  `content-type: application/json` auch ohne Anfragekörper; Fastify weist so
  etwas mit 400 ab, noch bevor das Token geprüft wird. Siebzehn grüne Tests,
  und die Tourenanmeldung hätte auf keinem Gerät funktioniert. Gefunden hat es
  erst die **Rauchprobe**.
- **Bündeln beweist nicht, dass die App etwas anzeigt.** `Link asChild`
  ersetzt das äußere Element samt Stil; die Terminkarten standen ohne
  Hintergrund und Rahmen da, Uhrzeit und Titel untereinander. 149 Tests,
  Typprüfung und beide Plattform-Bündel waren durchgehend grün. Gefunden hat
  es die **Vorschau**.
- **Die Vorschau rendert im Browser** — und dort gibt es keinen Schlüsselbund.
  `expo-secure-store` scheiterte mit `getValueWithKeyAsync is not a function`.
  Weder Tests noch Typprüfung sehen das.
- **Keine dieser Stufen tippt einen Link an.** Der Magic Link
  `mtbie:///anmeldung/<token>` landete auf expo-routers englischem
  Notbildschirm „Unmatched Route", weil die Route fehlte. Die Anmeldung gelang
  im Hintergrund — sichtbar war eine Fehlerseite in einer fremden Sprache.
  Gefunden hat es erst der **Simulator**.

Daraus die Lehre, die dieses Projekt am teuersten bezahlt hat: **Ein grüner
Test beweist nur, was er misst.** Wer eine Annahme über die Gegenseite trifft,
prüfe sie gegen die Gegenseite.

### Universal Links, und warum die Prüfung dafür halb im Server liegt

Ein geteilter Link `https://<domain>/t/<id>` öffnet die App nur, wenn drei
Dinge gleichzeitig stimmen — und keine zwei davon liegen an derselben Stelle:

1. **`app.config.js`** meldet die Domain an (`associatedDomains`,
   `intentFilters`). Das Betriebssystem liest sie aus dem fertigen Bündel,
   nicht aus dem Quelltext.
2. **`betrieb/Caddyfile`** liefert `/.well-known/apple-app-site-association`
   aus, mit `application/json` und der passenden `appID`.
3. **`app/t/[id].tsx`** fängt den Pfad in expo-router ab.

Fehlt eines, öffnet sich Safari — und alle Prüfungen bleiben grün, weil keine
von ihnen einen Link antippt. Die Rauchprobe deckt seit dem 07.08.2026
Punkt 2 ab und gleicht die `appID` gegen `app.config.js` ab; Punkt 1 und 3
bleiben Sache des Simulators.

### Drei Ziele, und die Voreinstellung ist die harmlose

Seit dem 07.08.2026 gibt es **dev und prod getrennt**: ein Prüfserver
(`api-dev.bockelbrink.net`) und der Vereinsserver, mit eigener Datenbank
je Seite. Solange beide dieselbe benutzten, war jeder Versuch ein Eingriff
in Vereinsdaten — und ab dem Tag, an dem echte Mitglieder darin stehen,
wäre das nicht mehr einzufangen.

| Ziel | API | Bündelkennung | Name auf dem Telefon |
| --- | --- | --- | --- |
| lokal (`npm start`) | `http://localhost` | `de.mtbbielefeld.app.dev` | MTB Bielefeld (dev) |
| dev (`npm run start:dev`) | `https://api-dev.bockelbrink.net` | `de.mtbbielefeld.app.dev` | MTB Bielefeld (dev) |
| prod (`npm run bau:prod`) | `https://api.mtb-bielefeld.de` | `de.mtbbielefeld.app` | MTB Bielefeld |

Zwei Entscheidungen dahinter, beide bewusst:

- **Beim Bauen festgelegt, nicht zur Laufzeit umschaltbar.** Ein Umschalter
  in den Einstellungen stünde im ausgelieferten Programm; wer ihn findet,
  richtet die App eines Mitglieds auf einen fremden Server.
- **Die Voreinstellung ist `dev`.** Wer für den Verein baut, sagt es
  ausdrücklich (`EXPO_PUBLIC_APP_UMGEBUNG=prod`). Andersherum wäre ein
  vergessener Schalter eine App, die auf echte Mitgliederdaten zeigt — und
  die fiele niemandem auf, weil sie ja funktioniert. Ein dev-Bau dagegen
  fällt sofort auf: Er heißt „MTB Bielefeld (dev)" und liegt als eigenes
  Symbol neben der echten Fassung.

Eine Falle, die dabei zweimal zuschlug und beide Male stumm war: Expo
ersetzt beim Bündeln **nur** Variablen mit dem Präfix `EXPO_PUBLIC_`.
Deshalb heißt die Variable `EXPO_PUBLIC_APP_UMGEBUNG` und nicht
`APP_UMGEBUNG` — sonst stünde in der App zur Laufzeit `undefined`, und sie
fiele auf dev zurück, während die Bündelkennung „prod" sagt. Und die
`appID` in der `apple-app-site-association` kommt aus `AASA_APP_ID`, das
**die Compose-Datei an Caddy durchreichen muss**: Ohne diese Zeile liefert
Caddy die Datei mit leerer `appID` aus, iOS verwirft sie wortlos, und der
geteilte Link öffnet nur den Browser.

**Am 07.08.2026 auf dem Simulator nachgemessen:**
`xcrun simctl openurl booted "https://api.bockelbrink.net/t/<id>"` öffnet die
App beim Training, nicht Safari.

Zwei Fallen dabei, beide teuer bezahlt:

- **`codesign -d --entitlements` lügt bei Simulator-Programmen.** Es meldet
  einen leeren `[Dict]`, obwohl die Berechtigungen im Programm stehen — dort
  liegen sie im Abschnitt `__TEXT,__entitlements`, den man mit `otool -X -s
  __TEXT __entitlements` liest (die Wörter stehen umgedreht). Wer dem
  `codesign` glaubt, signiert von Hand nach und zerstört dabei die App:
  Nachsignieren nur der äußeren Hülle bricht das Siegel der eingebetteten
  Bibliotheken, und danach startet gar nichts mehr.
- **Auf einem echten iPhone ist das ungeprüft.**
  `com.apple.developer.associated-domains` ist wie `aps-environment` eine
  Berechtigung, die ein kostenloses Apple Personal Team nicht ausstellt.
  Behoben ist das erst mit einem bezahlten Entwicklerkonto.

## Was bewusst nicht gebaut wurde

- **Kein ORM.** Rohes SQL, nummerierte Migrationen, ein Läufer in gut sechzig
  Zeilen, den jeder lesen kann.
- **Kein eigener Mailserver.** Zustellbarkeit ist ein Vollzeitproblem.
- **Kein Instagram-Feed.** Meta verlangt ein Token, das in einer öffentlichen
  App nirgends sicher liegen kann. Vertagt, bis das Backend es hält.
- **Keine Push-Benachrichtigungen.** Erinnerungen entstehen auf dem Gerät; es
  wird nichts an den Verein oder an Dritte übertragen. Das erspart der App die
  Push-Berechtigung — `plugins/ohne-push-berechtigung.cjs` entfernt den
  Eintrag wieder, den `expo-notifications` setzt.
- **Keine Anmeldepflicht.** Wer sich nie anmeldet, sieht die App wie bisher.

## Sicherheit in einem öffentlichen Repository

Dieses Repository ist öffentlich und MIT-lizenziert. Daraus folgt:

- **Nie ein Geheimnis im Code.** Zugangsdaten kommen aus einer `.env`, die
  nicht versioniert wird; `betrieb/.env.beispiel` zeigt mit erkennbar
  wertlosen Werten, welche Schlüssel es gibt.
- **Tokens nur als Hash in der Datenbank**, nur im Schlüsselbund auf dem Gerät.
- **Postgres nie über localhost hinaus.**
- **Keine stillen Fehlschläge.** Was schiefgeht, sieht die Person — in ihrer
  Sprache, nicht als Statuscode. Ein `console.warn` sieht auf einem Telefon
  niemand.
