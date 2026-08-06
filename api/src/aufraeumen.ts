/**
 * Aufräumen abgelaufener Zeilen — an einer Stelle, nicht in vieren.
 *
 * `sitzung` und `magic_link` wachsen beide mit der Benutzung: Jede
 * Erneuerung legt eine Sitzungszeile an, jede Anforderung einen Magic Link.
 * Was nie abgeräumt wird, wächst — bei einem Gerät alle fünfzehn Minuten.
 *
 * Der erste Versuch hängte das Aufräumen an die Erneuerung. Das war
 * falsch: Die Erneuerung ist der Pfad, den jedes Gerät ständig geht, und
 * sie darf nicht davon abhängen, dass das Aufräumen gelingt. Deshalb steht
 * es hier für sich, wird vom Zeitgeber in `server.ts` angestoßen und lässt
 * sich mit `npm run aufraeumen` auch von Hand oder per cron auslösen.
 *
 * Diese Datei kennt kein Fastify und keinen Zeitgeber — sie ist reine
 * Rechenlogik und ohne laufenden Server prüfbar. Dasselbe Muster wie
 * `notifications/scheduler.ts` gegenüber `notifications/index.ts` in der App.
 */

import type pg from 'pg';

import { ZAEHLFENSTER_MINUTEN } from './anmeldung.ts';

export interface Aufraeumbilanz {
  sitzungen: number;
  magicLinks: number;
  tourenanmeldungen: number;
  kinder: number;
}

/**
 * Wie lange eine Anmeldung nach dem Termin aufbewahrt bleibt.
 *
 * Die Frist kommt aus der Spec und gilt der Gastanmeldung: Name und Adresse
 * eines Nicht-Mitglieds haben kein Bleiberecht über den Zweck hinaus. Sie
 * gilt hier bewusst für **alle** Anmeldungen — auch die von Mitgliedern.
 * Eine Buchhaltung vergangener Ausfahrten ist nicht der Zweck dieser
 * Tabelle, und was nicht da ist, muss niemand schützen.
 */
const ANMELDUNG_AUFBEWAHRUNG_TAGE = 30;

/**
 * Wie lange ein Kindername nach dem Training aufbewahrt bleibt.
 *
 * Kindernamen sind die empfindlichste Kategorie, die diese API speichert.
 * Nach dem Training werden sie nicht mehr gebraucht; dreißig Tage sind lang
 * genug für Rückfragen und kurz genug, um nicht zu horten. Eine eigene
 * Konstante statt einer Wiederverwendung von `ANMELDUNG_AUFBEWAHRUNG_TAGE`:
 * Die Zahl trifft hier zufällig dieselbe Frist, die Begründung ist aber
 * eine andere — wer die Tourenfrist künftig ändert, soll damit nicht
 * versehentlich auch diese hier mitändern.
 */
const KIND_AUFBEWAHRUNG_TAGE = 30;

/**
 * Räumt weg, was seine Frist überschritten hat.
 *
 * Die Grenze bei den Sitzungen ist `erneuerung_bis` und **nicht**
 * `ersetzt_am`: Eine ersetzte, aber noch nicht abgelaufene Zeile ist genau
 * das, woran die Wiederverwendungserkennung ein wiederaufgetauchtes Token
 * erkennt. Ist die Frist dagegen vorbei, würde das Token ohnehin abgelehnt
 * — die Zeile ist dann auch für die Erkennung wertlos.
 *
 * Bei den Magic Links genügt `gueltig_bis` **nicht**. Eine abgelaufene Zeile
 * ist als Link zwar wertlos, für die Begrenzung je Adresse aber nicht: Die
 * zählt auf derselben Tabelle, und zwar über `ZAEHLFENSTER_MINUTEN`
 * (`anmeldung.ts`) — deutlich länger, als ein Link gilt. Wer nur nach
 * `gueltig_bis` löscht, räumt der Begrenzung ihre Zählgrundlage weg: Bei
 * einem Zeitgeber im Viertelstundentakt wäre das Fenster nie länger als
 * etwa zwanzig Minuten gefüllt und aus „drei je Stunde" würde faktisch das
 * Drei- bis Vierfache. Deshalb beide Bedingungen zusammen — und die Zahl
 * kommt von dort, wo gezählt wird, nicht noch einmal von hier.
 *
 * Bewusst zwei getrennte Anweisungen ohne Transaktion: Es gibt nichts, was
 * die beiden gemeinsam richtig oder falsch machen könnten, und ein Fehler
 * bei der einen soll die andere nicht verhindern.
 */
export async function raeumeAuf(pool: pg.Pool, jetzt: Date): Promise<Aufraeumbilanz> {
  const sitzungen = await pool.query('DELETE FROM sitzung WHERE erneuerung_bis < $1', [
    jetzt,
  ]);

  const fensteranfang = new Date(jetzt.getTime() - ZAEHLFENSTER_MINUTEN * 60 * 1000);
  const magicLinks = await pool.query(
    'DELETE FROM magic_link WHERE gueltig_bis < $1 AND angelegt_am < $2',
    [jetzt, fensteranfang],
  );

  const tourengrenze = new Date(
    jetzt.getTime() - ANMELDUNG_AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000,
  );
  const tourenanmeldungen = await pool.query(
    'DELETE FROM tourenanmeldung WHERE termin_start < $1',
    [tourengrenze],
  );

  // Gelöscht wird die Zeile ganz, nicht nur der Name: Ein Datensatz mit
  // leeren Feldern wäre Buchhaltung über ein Kind, das niemand mehr braucht.
  // `COALESCE(t.endet_am, t.beginnt_am)` — dieselbe Regel wie beim Lesen der
  // Trainingsliste (`jugendtraining.ts`, `holeTrainings`): Ein Training ohne
  // Ende gilt an seinem Beginn als vorbei.
  const kindergrenze = new Date(jetzt.getTime() - KIND_AUFBEWAHRUNG_TAGE * 24 * 60 * 60 * 1000);
  const kinder = await pool.query(
    `DELETE FROM jugendtraining_kind k USING jugendtraining t
      WHERE k.training_id = t.id
        AND COALESCE(t.endet_am, t.beginnt_am) < $1`,
    [kindergrenze],
  );

  return {
    sitzungen: sitzungen.rowCount ?? 0,
    magicLinks: magicLinks.rowCount ?? 0,
    tourenanmeldungen: tourenanmeldungen.rowCount ?? 0,
    kinder: kinder.rowCount ?? 0,
  };
}
