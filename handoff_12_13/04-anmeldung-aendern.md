# 13b — Eine bestehende Anmeldung ändern

Der teuerste Tippfehler der App. Wer sein Kind mit falschem Namen zum
Training angemeldet hat, kann ihn nicht korrigieren: Es gibt nur

- `POST /jugendtraining/:id/kinder` — anmelden
- `DELETE /jugendtraining/:id/kinder/:kindId` — austragen

Austragen und neu anmelden ist kein Ausweg:

- Bei einem vollen Training ist der Platz nach dem Austragen weg
  (`meldeKindAn` prüft `belegt >= plaetze`).
- Die Grenze von zwei Kindern je Konto hängt am Teilindex
  `jugendtraining_kind_hoechstens_zwei`; das Wiedereintragen läuft in
  `'schon-zwei'`, solange die alte Zeile noch nicht storniert ist.

Und dasselbe gilt für die Sichtbarkeit: Wer „Nachname zeigen" versehentlich
angelassen hat, kann es heute nur zurücknehmen, indem er das Kind austrägt.

## Server

### Neu in `api/src/jugendtraining.ts`

```ts
export async function aendereAnmeldung(
  ausfuehrer: pg.Pool | pg.PoolClient,
  trainingId: string,
  mitgliedId: string,
  kindId: string,
  kind: Partial<KindEingabe>,
): Promise<boolean>
```

- Beide Kennungen mit `istKennung` prüfen (sonst 22P02 → 500 statt 404) —
  wie in `meldeKindAb`.
- `mitglied_id` **in der `WHERE`-Bedingung**, nicht in einer Prüfung davor:
  Sonst kann jedes Mitglied fremde Anmeldungen umbenennen. Ebenso
  `storniert_am IS NULL`.
- `COALESCE`/`CASE` je Spalte wie in `aendereTraining` — feste Anweisung,
  „nicht angegeben" heißt „unverändert".
- Namen `trim()`en, wie beim Anlegen.

Ein abgesagtes Training braucht keine Sperre: Dort gibt es nichts zu
korrigieren, aber es schadet auch nichts. Entscheide dich für eine Variante
und schreib sie in den Kommentar.

### Neu in `api/src/app.ts`

`app.patch('/jugendtraining/:id/kinder/:kindId', …)` — angemeldet,
keine Rolle nötig (es sind die eigenen Kinder). 404, wenn nichts geändert
wurde: „Diese Anmeldung gibt es nicht." Kein Orakel darüber, ob sie
jemand anderem gehört.

**Ein Guide darf hier nichts.** Er sieht die vollen Namen, aber Sichtbarkeit
ist nicht Besitz — derselbe Grundsatz wie in `holeKinder`.

### Neu in `src/data/jugend.ts`

```ts
export function aendereAnmeldung(
  api: ApiZugang,
  id: string,
  kindId: string,
  kind: Partial<KindEingabe>,
): Promise<void>
```

## App

`src/features/jugend/KindAnmelden.tsx`, Abschnitt „Meine Anmeldungen" (siehe
`13b` im Entwurf):

Heute steht je eigenem Kind ein Knopf „<Name> austragen". Daraus wird eine
Zeile:

- Avatar + voller Name (den bekommt der Anfragende ungefiltert, siehe
  `holeKinder`)
- darunter klein: „Andere sehen: Mika" — die Freigabe im Klartext, nicht als
  zwei Schalterzustände, die man sich zusammenreimen muss
- rechts „Ändern"

„Ändern" öffnet ein Blatt mit Vorname, Nachname, den beiden Schaltern und
„Speichern". **Austragen wandert in dieses Blatt** — als letzte Zeile, in
`palette.danger`. Damit steht die zerstörerische Aktion nicht mehr als
einziger Knopf da, wo eigentlich eine Korrektur gebraucht wird.

Satz unter den Feldern: „Der Platz bleibt bestehen — geändert wird die
Anmeldung, nicht neu angemeldet." Das ist die Frage, die sich in dem Moment
stellt.

## Akzeptanzkriterien

- Name einer bestehenden Anmeldung ändern: Der Platz bleibt, `belegt` ändert
  sich nicht, die Teilnehmerliste zeigt den neuen Namen.
- Das geht auch bei einem **vollen** Training — Test.
- Sichtbarkeit umschalten wirkt sofort auf `anzeige` für andere Mitglieder.
- Ein zweites Konto kann eine fremde Anmeldung nicht ändern (404) — Test.
- Ein Guide kann fremde Anmeldungen nicht ändern, obwohl er die Namen sieht
  — Test.
- Eine bereits stornierte Anmeldung ist nicht änderbar.
