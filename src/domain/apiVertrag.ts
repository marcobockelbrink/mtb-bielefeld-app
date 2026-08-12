/**
 * Die Formen, die zwischen App und API über die Leitung gehen.
 *
 * ## Warum an einer Stelle
 *
 * Diese Formen beschreiben nicht die App und nicht den Server, sondern die
 * **Abmachung zwischen beiden**. Standen sie doppelt — hier und in
 * `api/src/jugendtraining.ts` —, ließ sich eine Seite ändern, ohne dass etwas
 * auffiel:
 *
 * - Typprüfung: auf beiden Seiten grün, jede für sich stimmig
 * - Tests: grün, denn jede Seite prüft nur sich selbst
 * - Zur Laufzeit: das neue Feld kommt an, wird stillschweigend verworfen
 *
 * Genau das Muster, das in `CLAUDE.md` sechsmal steht. Mit einer gemeinsamen
 * Quelle wird daraus ein Übersetzungsfehler, und der fällt sofort auf.
 *
 * ## Was hierher gehört — und was nicht
 *
 * Nur Formen, die **auf beiden Seiten gleich** sein müssen. Das sind die
 * Eingaben: Was die App schickt, muss der Server genau so erwarten.
 *
 * Die Antworten gehören ausdrücklich **nicht** hierher. `Training` sieht in der
 * App anders aus als im Server, und das ist richtig so: Die App bekommt
 * `belegt` (wie viele Plätze weg sind), der Server führt `angelegtVon` (wer es
 * angelegt hat) und schickt das gar nicht mit. Interne Datenbankform und
 * Übertragungsform sind zwei verschiedene Dinge — sie zusammenzulegen wäre
 * kein Fortschritt, sondern gäbe der App Wissen, das sie nicht haben soll.
 *
 * ## Verwendbar auf beiden Seiten
 *
 * Diese Datei darf **nichts** aus React Native importieren. Der Server lädt sie
 * unter Node; ein Import von `react-native` bräche ihn. Dasselbe gilt für die
 * anderen geteilten Dateien (`domain/types.ts`, `domain/terminSchluessel.ts`,
 * `data/ical/`, `config.ts`) — deshalb ermittelt etwa `config.ts` die Umgebung
 * über `typeof document` statt über `Platform`.
 */

/**
 * Die Zustände eines Jugendtrainings, als Liste zur Laufzeit.
 *
 * Bewusst ein Feld und daraus der Typ abgeleitet, statt den Typ von Hand zu
 * schreiben: So gibt es die Werte auch zur Laufzeit — für Prüfungen und für
 * den Test, der die Doppelung verhindert.
 *
 *     entwurf → veroeffentlicht → (abgesagt)
 */
export const ZUSTAENDE = ['entwurf', 'veroeffentlicht', 'abgesagt'] as const;

export type Zustand = (typeof ZUSTAENDE)[number];

/** Ob eine Zeichenkette ein gültiger Zustand ist. */
export function istZustand(wert: unknown): wert is Zustand {
  return typeof wert === 'string' && (ZUSTAENDE as readonly string[]).includes(wert);
}

/**
 * Ein Kind, das zu einem Training angemeldet wird.
 *
 * `zeigtVorname` und `zeigtNachname` entscheiden, was andere Eltern in der
 * Teilnehmerliste sehen. Beide Angaben gehören zum Kind, nicht zur Anmeldung:
 * Wer den Nachnamen einmal verbirgt, will das bei jedem Training.
 */
export interface KindEingabe {
  vorname: string;
  nachname: string;
  zeigtVorname: boolean;
  zeigtNachname: boolean;
}

/**
 * Ein neues oder geändertes Jugendtraining.
 *
 * Nur `beginntAm` und `ort` sind Pflicht — ein Training entsteht als Entwurf,
 * und die übrigen Angaben kommen oft erst später dazu.
 */
export interface TrainingEingabe {
  beginntAm: Date;
  endetAm?: Date | null;
  ort: string;
  hinweis?: string | null;
  plaetze?: number | null;
  guidesNoetig?: number;
}
