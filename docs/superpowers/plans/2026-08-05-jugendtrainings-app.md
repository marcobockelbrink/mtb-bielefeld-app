# Plan 6 — Jugendtrainings in der App

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` oder `superpowers:executing-plans`. Die Schritte nutzen Kästchen (`- [ ]`) zur Nachverfolgung.

**Ziel:** Ein Bereich „Jugend" in der App: Eltern sehen kommende Trainings und melden ein bis zwei Kinder an, Guides legen Entwürfe an, sagen zu und veröffentlichen. Dazu ein Teilen-Knopf für die WhatsApp-Gruppe.

**Architektur:** Ein neues Modul `src/data/jugend.ts` spricht die Endpunkte aus Plan 5 über den bestehenden `ApiZugang` — es baut keinen eigenen Zugang auf. Die Bildschirme liegen unter `app/jugend/`. Die Terminliste bleibt **unangetastet**.

**Technik:** Expo SDK 57 · React Native · expo-router · expo-linking · Vitest

**Vorlage:** `docs/superpowers/specs/2026-08-05-jugendtrainings-design.md`
**Voraussetzung:** Plan 5 ist umgesetzt und läuft auf dem Server.

## Übergreifende Vorgaben

Diese gelten für **jede** Aufgabe:

- **Sprache:** Code, Kommentare, sichtbare Texte und Commit-Nachrichten auf Deutsch.
- **Die App muss ohne API vollständig benutzbar bleiben.** Termine, Filter, Aktuelles, Verein, Erinnerungen wie heute. Der Jugendbereich ist ein Zusatz: Ohne Netz ist er leer und **sagt das auch**. Er darf keinen anderen Bildschirm verzögern oder leeren.
- **Keine stillen Fehlschläge.** Was schiefgeht, sieht die Person — in ihrer Sprache, nicht als Statuscode. Fehler laufen über `jugendFehler.ts`, nach dem Muster von `teilnahmeFehler.ts`, und teilen sich `NICHT_ERREICHBAR` und `ZU_VIELE_VERSUCHE`.
- **Kein Farbwert außerhalb von `src/theme.ts`.** `grade` bleibt den Fahrtechnik-Balken vorbehalten.
- **`fontFamily` nie mit `fontWeight`** — Android setzt sonst eine unechte Fettung obendrauf.
- **Rechenlogik ohne React Native**, damit sie ohne Gerät prüfbar bleibt.
- **Expo gibt Paketversionen vor.** Neue Pakete nur über `npx expo install`; setzt das ein Plugin in `app.json`, gehört die Datei mit in den Commit, und `./plugins/ohne-push-berechtigung.cjs` muss danach **an erster Stelle** stehen.
- **Nach jeder Aufgabe committen.**
- Vor jeder Rückmeldung: `npm test`, `npm run typecheck`, `npx expo install --check` — alle drei grün.

---

## Aufgabe 1: Der Datenzugang

**Dateien:**
- Anlegen: `src/data/jugend.ts`
- Anlegen: `src/features/jugend/jugendFehler.ts`
- Anlegen: `tests/jugendFehler.test.ts`
- Ändern: `tools/rauchprobe.mts`

**Schnittstellen:**
- Verbraucht: `ApiZugang` aus `src/data/api.ts` mit `hole<T>(pfad)` und `sende<T>(pfad, methode, koerper?)`; `ApiFehler` mit `status` und `vonDerApi`
- Liefert: `interface Training { id: string; beginntAm: Date; endetAm: Date | null; ort: string; hinweis: string | null; plaetze: number | null; guidesNoetig: number; zustand: 'entwurf' | 'veroeffentlicht' | 'abgesagt'; absagegrund: string | null; belegt: number }`
- Liefert: `interface TrainingDetails extends Training { kinder: Array<{ id: string; anzeige: string }>; guides?: Array<{ mitgliedId: string; email: string; zusage: boolean }> }`
- Liefert: `holeTrainings(api): Promise<Training[]>`, `holeTraining(api, id): Promise<TrainingDetails>`
- Liefert: `meldeKindAn(api, id, kind): Promise<{ kindId: string; belegt: number }>`, `meldeKindAb(api, id, kindId): Promise<void>`
- Liefert: `legeTrainingAn(api, eingabe): Promise<Training>`, `veroeffentliche(api, id)`, `sageAb(api, id, grund)`, `setzeGuideAntwort(api, id, zusage)`
- Liefert: `beschreibeJugendFehler(fehler: unknown): string`

- [ ] **Schritt 1: Test für den Fehlerübersetzer**

`tests/jugendFehler.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler';

describe('beschreibeJugendFehler', () => {
  it('erklärt ein volles Training mit dem Satz der API', () => {
    expect(
      beschreibeJugendFehler(new ApiFehler(409, 'Dieses Training ist voll.', undefined, true)),
    ).toBe('Dieses Training ist voll.');
  });

  it('erklärt die Zwei-Kinder-Grenze verständlich', () => {
    expect(
      beschreibeJugendFehler(
        new ApiFehler(409, 'Mehr als zwei Kinder gehen über ein Konto nicht.', undefined, true),
      ),
    ).toBe('Mehr als zwei Kinder gehen über ein Konto nicht.');
  });

  it('sagt bei 403, dass es an der Rolle liegt — nicht an einem Fehler', () => {
    // „Das dürfen nur Guides" ist keine Panne, sondern eine Auskunft. Wer
    // hier „etwas ist schiefgegangen" liest, sucht an der falschen Stelle.
    expect(beschreibeJugendFehler(new ApiFehler(403, 'Das dürfen nur Guides.', undefined, true))).toBe(
      'Das dürfen nur Guides.',
    );
  });

  it('rät bei einer Ratenbegrenzung zum Warten', () => {
    expect(beschreibeJugendFehler(new ApiFehler(429, 'Zu viele Versuche.'))).toBe(
      'Zu viele Versuche hintereinander. Warte eine Minute und probier es dann noch einmal.',
    );
  });

  it('reicht den Verbindungshinweis von api.ts durch (Status 0)', () => {
    expect(
      beschreibeJugendFehler(new ApiFehler(0, 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.')),
    ).toBe('Keine Verbindung zum Server. Bitte prüfe deine Verbindung.');
  });

  it('reicht bei 5xx NICHT durch, was nicht von der API stammt', () => {
    // Sonst läse ein Elternteil „canceling statement due to statement timeout".
    expect(
      beschreibeJugendFehler(new ApiFehler(500, 'canceling statement due to statement timeout')),
    ).toBe('Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.');
  });
});
```

- [ ] **Schritt 2: Laufen lassen — muss scheitern**

```bash
npm test -- jugendFehler
```

- [ ] **Schritt 3: `src/features/jugend/jugendFehler.ts` schreiben**

```ts
/**
 * Fehler rund um Jugendtrainings in einen deutschen Satz übersetzen.
 *
 * Dieselbe Bauweise wie `teilnahmeFehler.ts` daneben, und die Konstanten
 * sind dieselben: Ein 429 soll nicht je nach Bildschirm anders heißen.
 *
 * Sortiert nach dem, was die Person als Nächstes tun soll, nicht nach
 * Statuscodes. Die API formuliert ihre eigenen Fälle schon genau („Dieses
 * Training ist voll.", „Das dürfen nur Guides.") — die zu ersetzen kostete
 * nur Genauigkeit.
 */

import { ApiFehler } from '../../data/api';
import { NICHT_ERREICHBAR, ZU_VIELE_VERSUCHE } from '../events/teilnahmeFehler';

export function beschreibeJugendFehler(fehler: unknown): string {
  if (fehler instanceof ApiFehler) {
    if (fehler.status === 401) {
      return 'Deine Anmeldung ist nicht mehr gültig. Melde dich unter Einstellungen erneut an.';
    }
    if (fehler.status === 429) return ZU_VIELE_VERSUCHE;
    // Status 0 heißt „gar nicht angekommen" — `api.ts` schreibt dafür schon
    // den genaueren Satz und unterscheidet Zeitablauf von fehlender
    // Verbindung.
    if (fehler.status === 0) return fehler.message.trim() || NICHT_ERREICHBAR;
    // Sonst nur durchreichen, was die API selbst formuliert hat. Was Fastify
    // bei 5xx durchreicht, ist der rohe Text der Ursache.
    if (fehler.vonDerApi) return fehler.message.trim() || NICHT_ERREICHBAR;
  }
  return NICHT_ERREICHBAR;
}
```

- [ ] **Schritt 4: `src/data/jugend.ts` schreiben**

```ts
/**
 * Die Jugendtrainings der Vereins-API.
 *
 * Kein eigener Zugang: Alles läuft über den `ApiZugang` aus `api.ts`, der
 * schon Token, Erneuerung und Fehlerübersetzung mitbringt. Dieses Modul
 * kennt nur die Pfade und die Formen.
 *
 * Daten kommen als JSON, Zeitangaben also als Zeichenketten — sie werden
 * hier einmal zu `Date` gemacht, damit die Bildschirme nicht jeder für sich
 * daran denken müssen.
 */

import type { ApiZugang } from './api';

export type Zustand = 'entwurf' | 'veroeffentlicht' | 'abgesagt';

export interface Training {
  id: string;
  beginntAm: Date;
  endetAm: Date | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  belegt: number;
}

export interface TrainingDetails extends Training {
  kinder: Array<{ id: string; anzeige: string }>;
  /** Nur für Guides — sonst schickt die API das Feld gar nicht. */
  guides?: Array<{ mitgliedId: string; email: string; zusage: boolean }>;
}

interface RohTraining {
  id: string;
  beginntAm: string;
  endetAm: string | null;
  ort: string;
  hinweis: string | null;
  plaetze: number | null;
  guidesNoetig: number;
  zustand: Zustand;
  absagegrund: string | null;
  belegt?: number;
}

function zuTraining(roh: RohTraining): Training {
  return {
    ...roh,
    beginntAm: new Date(roh.beginntAm),
    endetAm: roh.endetAm ? new Date(roh.endetAm) : null,
    belegt: roh.belegt ?? 0,
  };
}

export async function holeTrainings(api: ApiZugang): Promise<Training[]> {
  const roh = await api.hole<RohTraining[]>('/jugendtraining');
  return roh.map(zuTraining);
}

export async function holeTraining(api: ApiZugang, id: string): Promise<TrainingDetails> {
  const roh = await api.hole<RohTraining & Omit<TrainingDetails, keyof Training>>(
    `/jugendtraining/${encodeURIComponent(id)}`,
  );
  return { ...zuTraining(roh), kinder: roh.kinder, guides: roh.guides };
}

export interface KindEingabe {
  vorname: string;
  nachname: string;
  zeigtVorname: boolean;
  zeigtNachname: boolean;
}

export function meldeKindAn(
  api: ApiZugang,
  id: string,
  kind: KindEingabe,
): Promise<{ kindId: string; belegt: number }> {
  return api.sende(`/jugendtraining/${encodeURIComponent(id)}/kinder`, 'POST', kind);
}

export function meldeKindAb(api: ApiZugang, id: string, kindId: string): Promise<void> {
  return api.sende(
    `/jugendtraining/${encodeURIComponent(id)}/kinder/${encodeURIComponent(kindId)}`,
    'DELETE',
  );
}

export interface TrainingEingabe {
  beginntAm: Date;
  endetAm?: Date | null;
  ort: string;
  hinweis?: string | null;
  plaetze?: number | null;
  guidesNoetig?: number;
}

export async function legeTrainingAn(api: ApiZugang, eingabe: TrainingEingabe): Promise<Training> {
  const roh = await api.sende<RohTraining>('/jugendtraining', 'POST', {
    ...eingabe,
    beginntAm: eingabe.beginntAm.toISOString(),
    endetAm: eingabe.endetAm ? eingabe.endetAm.toISOString() : null,
  });
  return zuTraining(roh);
}

export async function veroeffentliche(api: ApiZugang, id: string): Promise<Training> {
  const roh = await api.sende<RohTraining>(
    `/jugendtraining/${encodeURIComponent(id)}/veroeffentlichen`,
    'POST',
  );
  return zuTraining(roh);
}

export async function sageAb(api: ApiZugang, id: string, grund: string): Promise<Training> {
  const roh = await api.sende<RohTraining>(
    `/jugendtraining/${encodeURIComponent(id)}/absage`,
    'POST',
    { grund },
  );
  return zuTraining(roh);
}

export function setzeGuideAntwort(api: ApiZugang, id: string, zusage: boolean): Promise<void> {
  return api.sende(`/jugendtraining/${encodeURIComponent(id)}/guide`, 'PUT', { zusage });
}

export function setzeAbonnement(api: ApiZugang, an: boolean): Promise<void> {
  return api.sende('/konto/jugend-benachrichtigung', 'PUT', { an });
}
```

- [ ] **Schritt 5: Die Rauchprobe erweitern**

`tools/rauchprobe.mts` prüft die echten Module gegen die laufende API — dort gehört das hier hinein, denn es ist die einzige Stelle, an der Attrappen nicht helfen. Ein neuer Abschnitt nach der Tourenanmeldung:

- Rolle `guide` für das Testkonto setzen (über `docker compose exec`, wie der Einladungscode geholt wird)
- Training anlegen, veröffentlichen, Kind anmelden, Belegung prüfen, abmelden, absagen
- **Und der Prüfstein:** die Teilnehmerliste einmal als Guide und einmal ohne Guide-Rolle holen und vergleichen — der Nachname darf im zweiten Fall nicht auftauchen

Den Kopf der Datei um die neuen Module ergänzen (dort steht, was geprüft wird und wofür die Probe blind ist).

- [ ] **Schritt 6: Prüfen und committen**

```bash
npm test && npm run typecheck
npm run rauchprobe    # braucht den laufenden Aufbau
git add src/ tests/ tools/
git commit -m "Datenzugang für Jugendtrainings, samt Fehlerübersetzer"
```

---

## Aufgabe 2: Der Bereich Jugend

**Dateien:**
- Anlegen: `app/jugend/index.tsx`
- Anlegen: `src/features/jugend/TrainingKarte.tsx`
- Anlegen: `src/features/jugend/format.ts`
- Anlegen: `tests/jugendFormat.test.ts`
- Ändern: `app/(tabs)/_layout.tsx` **oder** `app/(tabs)/verein.tsx` — siehe Schritt 1

**Schnittstellen:**
- Verbraucht: `holeTrainings`, `Training` aus Aufgabe 1; `useKonto()` für `api` und `angemeldet`
- Liefert: `formatiereTrainingszeit(training: Training): string` — „Sonntag, 9. August · 10:30 Uhr"

- [ ] **Schritt 1: Entscheiden, wo der Bereich hängt — und es messen**

Die Reiterleiste hat heute vier Einträge. Die Schriftgröße von 10 Punkt ist laut Kommentar in `app/(tabs)/_layout.tsx` genau so gewählt, dass „EINSTELLUNGEN" in **eine** Zeile passt. Ein fünfter Reiter macht jeden schmaler.

**Vorgehen:** Zuerst als fünften Reiter einbauen (`app/(tabs)/jugend.tsx`, Symbol `bicycle-outline`), dann **messen**:

```bash
npm run vorschau
```

Danach `docs/screenshots/termine.png` wirklich ansehen. Bricht „EINSTELLUNGEN" um oder wird abgeschnitten, ist der fünfte Reiter gescheitert — dann stattdessen ein Abschnitt „Jugendtrainings" unter `app/(tabs)/verein.tsx`, der auf `app/jugend/index.tsx` verweist.

**Halte im Bericht fest, was du gesehen hast, und welchen Weg du deshalb gegangen bist.** Nicht raten: Ein abgeschnittenes Wort in der Reiterleiste sieht auf jedem Gerät anders aus.

- [ ] **Schritt 2: Test für die Zeitformatierung**

`tests/jugendFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatiereTrainingszeit } from '../src/features/jugend/format';

const training = {
  id: 'a',
  beginntAm: new Date('2026-08-09T08:30:00Z'), // 10:30 Ortszeit
  endetAm: null,
  ort: 'Kalkofen',
  hinweis: null,
  plaetze: null,
  guidesNoetig: 2,
  zustand: 'veroeffentlicht' as const,
  absagegrund: null,
  belegt: 0,
};

describe('formatiereTrainingszeit', () => {
  it('rechnet in Vereinszeit, nicht in der Zeitzone des Geräts', () => {
    // Ein Telefon, das auf UTC steht, zeigte sonst 08:30 — und ein Kind
    // stünde zwei Stunden zu früh am Parkplatz.
    expect(formatiereTrainingszeit(training)).toBe('Sonntag, 9. August · 10:30 Uhr');
  });

  it('nennt das Ende, wenn es eines gibt', () => {
    const mitEnde = { ...training, endetAm: new Date('2026-08-09T10:30:00Z') };
    expect(formatiereTrainingszeit(mitEnde)).toBe('Sonntag, 9. August · 10:30 – 12:30 Uhr');
  });
});
```

- [ ] **Schritt 3: Laufen lassen — muss scheitern, dann `format.ts` schreiben**

Über `Intl.DateTimeFormat` mit `timeZone: 'Europe/Berlin'`, nach dem Muster von `src/features/events/format.ts`. **Nie** über die Zeitzone des Geräts.

- [ ] **Schritt 4: `TrainingKarte.tsx` und die Liste**

Die Karte zeigt: Zeit, Ort, „N angemeldet" (und „von M Plätzen", wenn `plaetze` gesetzt ist). Ein abgesagtes Training bekommt einen `Banner tone="danger"` mit dem Grund und wird **nicht** ausgeblendet — wer es gestern gesehen hat, hielte das Verschwinden für einen Fehler und führe hin. Ein Entwurf bekommt ein `Badge` „Entwurf".

`app/jugend/index.tsx` lädt beim Öffnen über `useKonto().api`:

```tsx
  // Drei Zustände, und alle drei müssen sichtbar sein — „leer" ist die
  // Antwort, die am leichtesten mit einem Fehler zu verwechseln ist.
  if (!angemeldet) return <EmptyState title="Melde dich an" hint="Jugendtrainings sehen nur angemeldete Mitglieder. Das geht unter Einstellungen." />;
  if (laedt) return <LoadingState />;
  if (fehler) return <EmptyState title="Nicht erreichbar" hint={fehler} />;
  if (trainings.length === 0) return <EmptyState title="Keine Trainings geplant" hint="Sobald ein Guide eines anlegt, steht es hier." />;
```

**Kein Bildschirm außerhalb dieses Ordners darf sich ändern.** Wenn die API nicht erreichbar ist, bleibt der Rest der App unberührt.

- [ ] **Schritt 5: Prüfen und committen**

```bash
npm test && npm run typecheck && npm run vorschau
git add app/ src/ tests/
git commit -m "Der Bereich Jugend mit der Liste der Trainings"
```

---

## Aufgabe 3: Einzelansicht und Kind anmelden

**Dateien:**
- Anlegen: `app/jugend/[id].tsx`
- Anlegen: `src/features/jugend/KindAnmelden.tsx`

**Schnittstellen:**
- Verbraucht: `holeTraining`, `meldeKindAn`, `meldeKindAb`, `beschreibeJugendFehler`

- [ ] **Schritt 1: Die Einzelansicht**

Zeigt Zeit, Ort, Hinweis, Belegung und die Teilnehmerliste (`kinder[].anzeige` — die API hat schon entschieden, was sichtbar ist; die App zeigt es nur an und **rechnet nichts nach**).

- [ ] **Schritt 2: Das Anmeldeformular**

Vorname, Nachname, zwei Schalter. Der zweite Schalter braucht einen erklärenden Satz, sonst versteht niemand die Folge:

```tsx
<Text style={styles.hinweis}>
  Andere Mitglieder sehen nur, was du hier freigibst. Die Guides sehen immer
  den vollen Namen — sie haben die Aufsicht und müssen wissen, wer dabei ist.
</Text>
```

Vorgabe: Vorname **an**, Nachname **aus**. Datensparsam als Standard, und wer mehr will, tippt einmal.

Nach dem Anmelden bleibt die Karte stehen und zeigt „Eingetragen." plus einen Knopf zum Abmelden. **Ein gescheitertes Nachladen darf die Karte nicht verschwinden lassen** — dieser Fehler ist in `TeilnahmeKarte.tsx` schon einmal aufgetreten; sieh dort nach, wie `laden(false)` ihn löst.

Fehler kommen als `Banner tone="danger"`, Erfolge als `tone="info"`. **Beide dürfen nicht gleich aussehen** — auch das war schon einmal ein Fund.

- [ ] **Schritt 3: Prüfen und committen**

```bash
npm test && npm run typecheck && npm run vorschau
git add app/ src/
git commit -m "Einzelansicht eines Trainings und das Anmelden eines Kindes"
```

---

## Aufgabe 4: Was Guides sehen und tun

**Dateien:**
- Anlegen: `app/jugend/neu.tsx`
- Anlegen: `src/features/jugend/GuideKarte.tsx`
- Ändern: `app/jugend/index.tsx`, `app/jugend/[id].tsx`

- [ ] **Schritt 1: Woran die App erkennt, dass jemand Guide ist**

Nicht raten und nicht am Statuscode ablesen: `GET /konto` liefert die Rolle. `KontoContext` um `rolle: string | null` erweitern, gefüllt beim ersten Laden des Kontos.

**Wichtig:** Die Rolle ist eine **Anzeigehilfe**, keine Absicherung. Die API prüft sie ohnehin bei jedem Aufruf; die App versteckt nur Knöpfe, die sonst ins 403 laufen. Wer das verwechselt, baut irgendwann eine Prüfung nur in der App.

- [ ] **Schritt 2: Der Entwurf-Bildschirm**

`app/jugend/neu.tsx`: Datum, Uhrzeit, Ort, Hinweis, Plätze, benötigte Guides. Nach dem Anlegen zurück zur Liste, mit dem Hinweis, dass die Guides jetzt eine Mail bekommen.

- [ ] **Schritt 3: Die Guide-Karte in der Einzelansicht**

Zeigt nur Guides: wer zugesagt und wer abgesagt hat (`guides[]`), „Ich kann" / „Ich kann nicht", und — solange der Zustand `entwurf` ist — den Knopf **Veröffentlichen**. Daneben der Hinweis „X von Y Guides haben zugesagt", wobei Y `guidesNoetig` ist.

**Der Veröffentlichen-Knopf darf nicht sperren, wenn zu wenige zugesagt haben.** Das ist die Entscheidung des Guides; die Zahl ist eine Anzeige. Ein gesperrter Knopf würde eine Regel erfinden, die es nicht gibt.

Absagen mit Pflichtgrund über einen Dialog. Der Text sagt vorher, was passiert: „Alle angemeldeten Eltern bekommen eine Mail mit deinem Grund."

- [ ] **Schritt 4: Prüfen und committen**

```bash
npm test && npm run typecheck && npm run vorschau
git add app/ src/
git commit -m "Guides legen Trainings an, sagen zu und veröffentlichen"
```

---

## Aufgabe 5: Der Abonnement-Schalter

**Dateien:**
- Ändern: `app/(tabs)/einstellungen.tsx`
- Ändern: `src/konto/KontoContext.tsx`

- [ ] **Schritt 1: Der Schalter**

In die Anmeldekarte, sichtbar nur wenn angemeldet:

```tsx
<Text style={styles.hinweis}>
  Jugendtrainings entstehen oft kurzfristig. Wenn du das einschaltest,
  bekommst du eine Mail, sobald ein neues veröffentlicht wird.
</Text>
```

Der Zustand kommt aus `GET /konto` (`jugendBenachrichtigung`), gesetzt wird er über `setzeAbonnement`. Beim Umschalten **sofort** die Anzeige ändern und bei einem Fehler zurücknehmen — ein Schalter, der eine Sekunde nichts tut, wird zweimal gedrückt.

- [ ] **Schritt 2: Prüfen und committen**

```bash
npm test && npm run typecheck && npm run vorschau
git add app/ src/
git commit -m "Schalter für Benachrichtigungen über neue Jugendtrainings"
```

---

## Aufgabe 6: Teilen-Knopf und Universal Links

**Dateien:**
- Ändern: `app/jugend/[id].tsx` — Teilen-Knopf
- Ändern: `app.json` — `associatedDomains` und `intentFilters`
- Anlegen: `src/features/jugend/teilen.ts`
- Anlegen: `tests/jugendTeilen.test.ts`
- Ändern: `src/config.ts` — `TEILEN_BASIS_URL`

**Voraussetzung:** Die **feststehende Vereinsdomain**. Mit der Testdomain lässt sich das einrichten, aber die Universal Links müssen danach noch einmal umgestellt werden — halt im Bericht fest, gegen welche Domain du geprüft hast.

- [ ] **Schritt 1: Test für den Nachrichtentext**

```ts
import { describe, expect, it } from 'vitest';
import { baueTeilenText } from '../src/features/jugend/teilen';

const training = {
  id: 'k3f9', beginntAm: new Date('2026-08-09T08:30:00Z'), endetAm: null,
  ort: 'Wanderparkplatz Kalkofen', hinweis: null, plaetze: null,
  guidesNoetig: 2, zustand: 'veroeffentlicht' as const, absagegrund: null, belegt: 0,
};

describe('baueTeilenText', () => {
  it('nennt Zeit und Ort in Vereinszeit und hängt den Link an', () => {
    const text = baueTeilenText(training, 'https://api.mtb-bielefeld.de');
    expect(text).toContain('Sonntag, 9. August');
    expect(text).toContain('10:30');
    expect(text).toContain('Wanderparkplatz Kalkofen');
    expect(text).toContain('https://api.mtb-bielefeld.de/t/k3f9');
  });

  it('lässt sich für ein abgesagtes Training gar nicht erst bauen', () => {
    // Eine Einladung zu etwas, das ausfällt, wäre schlimmer als keine.
    expect(() => baueTeilenText({ ...training, zustand: 'abgesagt' }, 'https://x')).toThrow();
  });
});
```

- [ ] **Schritt 2: `teilen.ts` und der Knopf**

Der Knopf erscheint **nur bei veröffentlichten** Trainings und nur für Guides. Er öffnet `Share.share({ message })` aus React Native — das System-Teilen, aus dem der Guide WhatsApp wählt.

- [ ] **Schritt 3: Universal Links einrichten**

In `app.json`:

```json
    "ios": { "associatedDomains": ["applinks:<vereinsdomain>"] },
    "android": {
      "intentFilters": [{
        "action": "VIEW",
        "autoVerify": true,
        "data": [{ "scheme": "https", "host": "<vereinsdomain>", "pathPrefix": "/t" }],
        "category": ["BROWSABLE", "DEFAULT"]
      }]
    }
```

Dazu müssen zwei Dateien vom Server ausgeliefert werden — `/.well-known/apple-app-site-association` und `/.well-known/assetlinks.json`. Die gehören in die Caddyfile als statische Antwort. **Ohne sie öffnet der Link die App nicht, sondern nur den Browser** — und das fällt erst auf dem Gerät auf.

- [ ] **Schritt 4: Auf dem Gerät prüfen — Pflicht**

Weder Tests noch Vorschau noch Rauchprobe sehen einen angetippten Link. Das ist genau der Fehler, der bei Plan 3 durchgerutscht ist: Der Magic Link landete auf expo-routers englischem Notbildschirm, und der Beleg dafür war ein Foto der falschen Stelle.

```bash
xcrun simctl openurl <geraet> "https://<vereinsdomain>/t/<id>"
```

Erwartet: **Die App öffnet sich und zeigt das Training** — nicht der Browser, nicht „Unmatched Route". Ein Bildschirmfoto davon in den Bericht.

Und die Gegenprobe: Denselben Link in einem Simulator **ohne** installierte App öffnen. Erwartet: die kleine Seite aus Plan 5, ohne Ort und Uhrzeit.

- [ ] **Schritt 5: Prüfen und committen**

```bash
npm test && npm run typecheck && npx expo install --check && npm run vorschau
git add app/ src/ tests/ app.json
git commit -m "Teilen-Knopf für die WhatsApp-Gruppe und Universal Links"
```

---

## Nach diesem Plan

Ein Guide legt ein Training an, die Guides bekommen eine Mail und sagen zu, der Guide veröffentlicht und teilt den Link in die WhatsApp-Gruppe. Eltern melden ihre Kinder an und entscheiden dabei selbst, was andere sehen.

**Was offen bleibt:**

- **Push.** Der Abonnement-Schalter ist die Liste, an die es andockt.
- **Die Einwilligungstexte und das Verzeichnis von Verarbeitungstätigkeiten.** Muss der Verein formulieren — vor dem ersten echten Kind, nicht danach.
- **Die Vereinssoftware-API**, falls sie je kommt.
