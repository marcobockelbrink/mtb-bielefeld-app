/**
 * Anmeldung per Magic Link.
 *
 * Kein Passwort: Wo es keines gibt, kann keines geleakt, wiederverwendet
 * oder vergessen werden. Wer die Mail an seiner Adresse abrufen kann und
 * einmal hereingelassen wurde, ist Mitglied.
 *
 * Der Einladungscode ist die **Eintrittskarte**, nicht die Fahrkarte für
 * jede Fahrt: Er wird gebraucht, solange es zu der Adresse noch kein
 * Mitglied gibt. Danach genügt die Adresse — sonst käme niemand auf ein
 * zweites Gerät, nach dem Abmelden zurück oder nach der Kopiererkennung
 * wieder herein.
 */

import type pg from 'pg';

import { pruefeEinladung } from './einladung.ts';
import type { Mailer } from './mailer.ts';
import type { Protokoll } from './protokoll.ts';
import { erzeugeToken, hashe } from './token.ts';

/** Kurz genug, dass ein abgefangener Link wertlos wird. */
const GUELTIG_MINUTEN = 15;

const BASIS_URL = process.env.APP_BASIS_URL ?? 'https://app.mtb-bielefeld.de';

/**
 * Wie oft eine Adresse einen Link anfordern darf.
 *
 * Bis der Einladungscode erst beim Einlösen verbraucht wurde, war sein
 * Verbrauch eine zufällige Bremse. Seit sie weg ist, könnte jeder das
 * Postfach eines Mitglieds fluten — die Adresse allein genügt, ein Konto
 * braucht es dafür nicht.
 *
 * Die Zahlen sind Erfahrungswerte, keine Glaubenssätze: Drei Versuche pro
 * Stunde reichen für „Mail nicht angekommen, nochmal", und eine Minute
 * Abstand fängt den doppelt getippten Knopf ab.
 */
const HOECHSTENS_JE_STUNDE = 3;
const MINDESTABSTAND_SEKUNDEN = 60;

/** `einladungId: null` heißt: bestehendes Mitglied, keine Karte nötig. */
type Zutritt = { ok: true; einladungId: string | null } | { ok: false };

/**
 * Verschickt den Link, wenn die Adresse hereindarf.
 *
 * Wirft **nicht**, wenn sie das nicht darf: Der Aufrufer soll in jedem Fall
 * dieselbe Antwort geben. Ob etwas passiert ist, erfährt nur, wer die Mail
 * bekommt.
 *
 * Der Einladungscode wird hier nur **geprüft**. Verbraucht wird er erst
 * beim Einlösen (`loeseMagicLinkEin`), zusammen mit dem Anlegen des
 * Mitglieds. Wer den Link liegen lässt, verliert dadurch nichts.
 *
 * Wirft auch **nicht**, wenn das Schreiben des Magic Links oder der
 * Mailversand scheitert — siehe `fuehreBerechtigtenZutrittLeiseAus`.
 *
 * Wirft auch **nicht**, wenn die Begrenzung greift. Nach außen bleibt es
 * bei 202 — eine eigene Antwort dafür wäre ein neues Orakel: Sie verriete,
 * dass für diese Adresse gerade etwas läuft.
 */
export async function fordereMagicLinkAn(
  pool: pg.Pool,
  mailer: Mailer,
  protokoll: Protokoll,
  email: string,
  einladungscode: string | undefined,
  jetzt: Date,
): Promise<void> {
  const zutritt = await pruefeZutritt(pool, email, einladungscode, jetzt);
  if (!zutritt.ok) return;

  // Nach der Zutrittsprüfung, nicht davor: Wer gar nicht hereindarf, soll
  // auch keine Spur in der Begrenzung hinterlassen — sonst könnte jemand
  // durch Anfragen für eine fremde Adresse deren Kontingent aufbrauchen.
  if (!(await darfAnfordern(pool, email, jetzt))) return;

  const token = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_MINUTEN * 60 * 1000);

  await fuehreBerechtigtenZutrittLeiseAus(
    pool,
    mailer,
    protokoll,
    email,
    token,
    jetzt,
    gueltigBis,
    zutritt.einladungId,
  );
}

/**
 * Schreibt den Magic Link und verschickt ihn — und schluckt einen
 * Fehlschlag **nach außen** — nach innen nicht.
 *
 * Beides zusammen, nicht getrennt abgesichert: Ein durchgereichter Fehler
 * wäre genau die Auskunft, die dieser Endpunkt nie geben darf. Er entsteht
 * ausschließlich, wenn es überhaupt etwas zu schreiben oder zu verschicken
 * gab. Wer einen falschen Code schickt, bekommt 202; wer einen richtigen
 * schickt und auf eine gestörte Datenbank oder Mailstrecke trifft, bekäme
 * 500 — und wüsste damit, dass die Adresse zum Verein gehört. Läge die
 * Grenze erst nach dem INSERT, wäre genau dieser Unterschied bei jeder
 * Datenbankstörung wieder da: bekannte Adresse 500, unbekannte 202. Der
 * Unterschied bliebe auch mit echtem Versand offen, bei jeder
 * vorübergehenden Störung.
 *
 * Der Fehler verschwindet deshalb nicht, er wechselt nur den Empfänger:
 * Er geht laut ins Protokoll, wo der Betreiber ihn sieht. Ein stiller
 * Fehlschlag wäre das nur ohne diesen Eintrag.
 */
async function fuehreBerechtigtenZutrittLeiseAus(
  pool: pg.Pool,
  mailer: Mailer,
  protokoll: Protokoll,
  email: string,
  token: string,
  jetzt: Date,
  gueltigBis: Date,
  einladungId: string | null,
): Promise<void> {
  try {
    // angelegt_am explizit statt der SQL-Voreinstellung now(): Sonst würde
    // die Begrenzung (darfAnfordern) an der Systemzeit hängen statt an der
    // eingespeisten Uhr — und wäre in Tests nicht mehr kontrollierbar. Siehe
    // dieselbe Begründung bei `ausgestellt_am` in einladung.ts.
    await pool.query(
      `INSERT INTO magic_link (token_hash, email, angelegt_am, gueltig_bis, einladung_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [hashe(token), email, jetzt, gueltigBis, einladungId],
    );

    await mailer.sende(
      email,
      'Deine Anmeldung beim MTB Bielefeld',
      [
        'Hallo,',
        '',
        'tippe auf diesen Link, um dich in der App anzumelden:',
        `${BASIS_URL}/anmeldung/${token}`,
        '',
        `Der Link gilt ${GUELTIG_MINUTEN} Minuten und lässt sich einmal verwenden.`,
        'Hast du das nicht angefordert, ignoriere diese Mail einfach.',
        '',
        'Viele Grüße',
        'MTB Bielefeld e.V.',
      ].join('\r\n'),
    );
  } catch (fehler) {
    protokoll.error(
      { fehler, an: email },
      'Magic Link konnte nicht angelegt oder verschickt werden. Der ' +
        'Anfragende hat trotzdem 202 bekommen, weil eine abweichende ' +
        'Antwort verraten würde, dass die Adresse zum Verein gehört.',
    );
  }
}

/** Bestehendes Mitglied oder gültige Eintrittskarte — sonst nichts. */
async function pruefeZutritt(
  pool: pg.Pool,
  email: string,
  einladungscode: string | undefined,
  jetzt: Date,
): Promise<Zutritt> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM mitglied WHERE lower(email) = lower($1)',
    [email],
  );
  if (rows.length > 0) return { ok: true, einladungId: null };

  if (einladungscode === undefined) return { ok: false };

  const pruefung = await pruefeEinladung(pool, einladungscode, email, jetzt);
  return pruefung.ok ? { ok: true, einladungId: pruefung.einladungId } : { ok: false };
}

/**
 * Ob für diese Adresse gerade ein weiterer Link entstehen darf.
 *
 * Gezählt wird auf `magic_link` — die Daten liegen schon da, eine eigene
 * Tabelle wäre ein zweites bewegliches Teil für dieselbe Auskunft.
 *
 * Das Fenster ist **gleitend**: Wer um 12:59 seine dritte Anforderung
 * verbraucht, ist nicht um 13:00 wieder frei, sondern eine Stunde nach der
 * ersten. Sonst könnte man an jeder vollen Stunde das Doppelte anfordern.
 */
async function darfAnfordern(pool: pg.Pool, email: string, jetzt: Date): Promise<boolean> {
  const stundeVorher = new Date(jetzt.getTime() - 60 * 60 * 1000);

  const { rows } = await pool.query<{ anzahl: string; letzte: Date | null }>(
    `SELECT count(*) AS anzahl, max(angelegt_am) AS letzte
       FROM magic_link
      WHERE lower(email) = lower($1) AND angelegt_am > $2`,
    [email, stundeVorher],
  );

  const zeile = rows[0];
  if (!zeile) return true;

  if (Number(zeile.anzahl) >= HOECHSTENS_JE_STUNDE) return false;

  if (zeile.letzte) {
    const abstandSekunden = (jetzt.getTime() - zeile.letzte.getTime()) / 1000;
    if (abstandSekunden < MINDESTABSTAND_SEKUNDEN) return false;
  }

  return true;
}
