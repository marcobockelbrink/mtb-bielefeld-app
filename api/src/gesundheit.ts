/**
 * Die Gesundheitsprüfung — für den Wächter von außen (Handoff 17).
 *
 * Bis zum 21.08.2026 stand hier ein fester Wert:
 *
 *     app.get('/gesundheit', async () => ({ zustand: 'bereit' }));
 *
 * Der antwortete auch dann mit 200, wenn die Datenbank weg war. Ein Wächter,
 * der daran hängt, meldet also „alles in Ordnung", während kein Mitglied
 * sich anmelden kann — schlimmer als gar keine Überwachung, weil er
 * Gewissheit vortäuscht.
 *
 * ## Was geprüft wird — und was ausdrücklich nicht
 *
 * Genau zweierlei: dass der Prozess antwortet (das beweist schon die
 * Antwort selbst) und dass die Datenbank erreichbar ist. **Kein**
 * Speicherverbrauch, keine Warteschlangen, keine Zahlen über das Innere.
 * Der Endpunkt ist ohne Anmeldung erreichbar; alles, was hier steht, steht
 * für jeden im Netz.
 *
 * ## Warum 503 und nicht 500
 *
 * Ein 500 ist für zwischengeschaltete Proxys ein Serverfehler wie jeder
 * andere und darf zwischengespeichert werden. 503 heißt „vorübergehend
 * nicht verfügbar" und wird nicht gespeichert — zusammen mit
 * `Cache-Control: no-store` auf **beiden** Antworten. Eine
 * zwischengespeicherte Gesundheitsmeldung ist eine Lüge mit Verfallsdatum.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type pg from 'pg';

/** Wie lange auf die Datenbank gewartet wird, bevor sie als weg gilt. */
export const DATENBANK_ZEITSCHRANKE_MS = 2000;

/**
 * Die Werte, die `datenbank` annehmen kann — der ganze Katalog.
 *
 * Absichtlich zwei Wörter und kein Fehlertext: Was Postgres bei einem
 * Fehlschlag sagt, nennt Wirtsnamen, Ports und manchmal Benutzernamen. Das
 * gehört nicht in eine Antwort, die jeder im Netz abrufen kann.
 */
export type Datenbankzustand = 'ok' | 'keine Verbindung';

export interface Gesundheit {
  status: 'ok' | 'fehler';
  version: string;
  datenbank: Datenbankzustand;
  zeit: string;
}

/**
 * Die Fassung, die gerade läuft — aus der `package.json` neben dem Quelltext.
 *
 * Einmal beim Start gelesen und nicht bei jeder Anfrage: Die Datei ändert
 * sich zur Laufzeit nicht, und ein Dateizugriff je Wächteranfrage wäre
 * Arbeit für nichts.
 *
 * Scheitert das Lesen, steht `unbekannt` da statt eines Absturzes. Die
 * Auskunft über die Fassung ist bequem; die über die Datenbank ist der
 * Zweck. Das eine darf das andere nicht mitreißen.
 */
export function liesVersion(): string {
  try {
    const hier = path.dirname(fileURLToPath(import.meta.url));
    const roh = readFileSync(path.join(hier, '..', 'package.json'), 'utf8');
    return (JSON.parse(roh) as { version?: string }).version ?? 'unbekannt';
  } catch {
    return 'unbekannt';
  }
}

/**
 * Antwortet die Datenbank?
 *
 * `SELECT 1` und sonst nichts — die Abfrage soll beweisen, dass eine
 * Verbindung steht, nicht die Daten prüfen.
 *
 * **Mit eigener Zeitschranke.** Ohne sie hinge die Anfrage am
 * Netzzeitablauf des Betriebssystems, und der liegt bei Minuten. Der
 * Wächter liefe in seinen eigenen Zeitablauf und meldete „keine Antwort"
 * statt „Datenbank weg" — dieselbe Meldung, die auch ein abgestürzter
 * Prozess auslöst, und damit eine, die nichts unterscheidet.
 *
 * `Promise.race` und nicht `query_timeout` am Pool: Letzteres gälte für
 * **jede** Abfrage der API, auch für die langen Berichte der Verwaltung.
 * Die Zeitschranke gehört zu dieser Prüfung, nicht zur Datenbank.
 */
export async function pruefeDatenbank(
  pool: pg.Pool,
  zeitschrankeMs = DATENBANK_ZEITSCHRANKE_MS,
): Promise<Datenbankzustand> {
  let wecker: ReturnType<typeof setTimeout> | undefined;
  try {
    const abbruch = new Promise<never>((_, ablehnen) => {
      wecker = setTimeout(() => ablehnen(new Error('Zeitschranke')), zeitschrankeMs);
    });
    await Promise.race([pool.query('SELECT 1'), abbruch]);
    return 'ok';
  } catch {
    return 'keine Verbindung';
  } finally {
    // Sonst hielte der offene Wecker den Node-Prozess bis zum Ablauf am
    // Leben — in den Tests der Grund, warum ein Lauf am Ende hängen bleibt.
    if (wecker) clearTimeout(wecker);
  }
}

/**
 * Aus dem Zustand der Datenbank die vollständige Antwort.
 *
 * **Dieselbe Form in beiden Fällen**, anders als im Handoff skizziert. Dort
 * trägt die Fehlerantwort nur `status` und `datenbank`. Gerade während
 * einer Störung ist aber die Frage „welcher Stand läuft da überhaupt?" die
 * erste, die jemand stellt — die Fassung wegzulassen spart vierzig Zeichen
 * und kostet den ersten Blick.
 */
export function baueGesundheit(datenbank: Datenbankzustand, version: string, jetzt: Date): Gesundheit {
  return {
    status: datenbank === 'ok' ? 'ok' : 'fehler',
    version,
    datenbank,
    zeit: jetzt.toISOString(),
  };
}

/** 200 wenn gesund, sonst 503 — siehe Dateikopf, warum nicht 500. */
export function statusFuer(gesundheit: Gesundheit): number {
  return gesundheit.status === 'ok' ? 200 : 503;
}
