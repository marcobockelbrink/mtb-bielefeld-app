# 12b — Ein Training bearbeiten

**Gemeldet:** „Trainings sollte man wieder ändern können. Falls man sich
verschrieben hat oder die Adresse nicht passt."

Stimmt: In der App gibt es keinen Weg dahin. **Der Server kann es aber
schon** — nur die App-Seite fehlt.

## Was es schon gibt

- `api/src/jugendtraining.ts` → `aendereTraining(ausfuehrer, id, eingabe)`
  mit `COALESCE`/`CASE` je Spalte, `WHERE id = $1 AND zustand <> 'abgesagt'`.
- `api/src/app.ts` → `app.patch('/jugendtraining/:id', …)`.
- `src/domain/apiVertrag.ts` → `TrainingEingabe` — dieselbe Form wie beim
  Anlegen, `Partial` beim Ändern.

## Was fehlt

### 1. Die Datenschicht

`src/data/jugend.ts` kennt anlegen, veröffentlichen, absagen und
Guide-Antwort — kein Ändern. Neu, im Stil von `legeTrainingAn`:

```ts
export async function aendereTraining(
  api: ApiZugang,
  id: string,
  eingabe: Partial<TrainingEingabe>,
): Promise<Training> {
  const roh = await api.sende<RohTraining>(
    `/jugendtraining/${encodeURIComponent(id)}`,
    'PATCH',
    {
      ...eingabe,
      ...(eingabe.beginntAm ? { beginntAm: eingabe.beginntAm.toISOString() } : {}),
      ...('endetAm' in eingabe
        ? { endetAm: eingabe.endetAm ? eingabe.endetAm.toISOString() : null }
        : {}),
    },
  );
  return zuTraining(roh);
}
```

Wichtig: „nicht angegeben" heißt am Server „unverändert" (`'endetAm' in
eingabe`). Nur mitschicken, was wirklich geändert wurde — sonst überschreibt
ein leeres Formularfeld einen Hinweis, den niemand angefasst hat.

### 2. Der Einstieg

`app/jugend/[id].tsx`: oben rechts „Bearbeiten", sichtbar für
`rolle === 'guide' || rolle === 'verwaltung'` — dieselbe Anzeigehilfe wie
beim Teilen-Knopf. **Nicht** bei `zustand === 'abgesagt'`: Der Server lehnt
das ab, der Knopf liefe ins Leere.

### 3. Der Bildschirm `app/jugend/[id]/bearbeiten.tsx`

Dasselbe Formular wie beim Anlegen (`app/jugend/neu.tsx`, Design 11c), nur
vorbelegt — eine Form, ein Verhalten. Siehe `12b` im Entwurf:

- Kopfzeile: „Abbrechen" links, „Training ändern" mittig.
- Wann (Datum, Zeit über `DatumsFeld`), Wo (Freitext + Chips der letzten
  Orte), Teilnahme (Plätze, Hinweis).
- Geänderte Gruppen tragen „— geändert" im Label und darunter den alten Wert
  durchgestrichen. Das ist der Kern: Wer korrigiert, will sehen, **was** er
  korrigiert hat, bevor er speichert.
- Fußleiste über der Tastatur (`KeyboardAvoidingView`, siehe Handoff 11):
  Mail-Kästchen + „Änderungen speichern". Der Knopf bleibt untätig, solange
  nichts geändert wurde.
- Plätze lassen sich nicht unter die Zahl der bereits angemeldeten Kinder
  senken (`training.belegt`) — vor dem Senden abfangen, mit Satz statt
  gesperrtem Feld.

### 4. Die Info-Mail — das einzige neue Stück Server

`PATCH` verschickt heute nichts. Bei einem **veröffentlichten** Training
sollen die angemeldeten Familien erfahren, was sich geändert hat:

- Adressen: `holeElternAdressen(pool, id)` gibt es schon (Absage nutzt es).
- Vorlage neben den Absage-Mails in `api/src/jugendmails.ts`, Betreff etwa
  „Änderung: Jugendtraining am Sa 22.08.".
- Inhalt: alt → neu je geändertem Feld. Keine Aufforderung, sich neu
  anzumelden — der Platz bleibt bestehen; wer nicht mehr kann, trägt sich
  selbst aus.
- Gesteuert durch ein Feld in der Anfrage (z. B. `elternInformieren: true`),
  das die App aus dem Kästchen setzt. Beim **Entwurf** gibt es das Kästchen
  nicht: Niemand weiß von dem Termin.

### 5. „Zuletzt geändert" in der Detailansicht

Eine Zeile in der Trainingskarte: „Ort korrigiert · gestern 19:04 · Marco".
Braucht `geaendert_am` / `geaendert_von` in `jugendtraining` (Migration) und
die Felder in der Antwort von `GET /jugendtraining/:id`. Damit eine Änderung
auch bemerkt, wer die Mail übersieht. Kann als eigener Schritt kommen.

## Akzeptanzkriterien

- Guide/Verwaltung sieht „Bearbeiten" bei Entwurf und veröffentlicht, nicht
  bei abgesagt; ein gewöhnliches Mitglied nie.
- Ein Feld ändern und speichern ändert **nur** dieses Feld (Test gegen
  `aendereTraining` mit einem Feld).
- Ein veröffentlichtes Training mit acht Anmeldungen: Speichern mit Häkchen
  verschickt acht Mails mit alt → neu; ohne Häkchen keine.
- Plätze unter `belegt` werden abgelehnt, mit deutschem Satz.
- Anmeldungen und Guide-Zusagen bleiben nach einer Änderung bestehen.
- Ein zweites Konto ohne Guide-Rolle bekommt auf `PATCH` ein 403 — Test.
