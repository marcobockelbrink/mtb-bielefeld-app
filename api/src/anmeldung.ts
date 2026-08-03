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

  const token = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_MINUTEN * 60 * 1000);

  // Erst ab hier kommt die Begrenzung ins Spiel — sie steckt in
  // `legeAnWennDieBegrenzungEsZulaesst`, hinter der Zutrittsprüfung: Wer gar
  // nicht hereindarf, soll auch keine Spur in ihr hinterlassen, sonst könnte
  // jemand durch Anfragen für eine fremde Adresse deren Kontingent
  // aufbrauchen.
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
 * Grenze erst nach dem Anlegen, wäre genau dieser Unterschied bei jeder
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
    const angelegt = await legeAnWennDieBegrenzungEsZulaesst(
      pool,
      email,
      hashe(token),
      jetzt,
      gueltigBis,
      einladungId,
    );
    // Nur verschicken, wenn auch wirklich eine Zeile entstanden ist. Sonst
    // wäre die Begrenzung nur eine Buchhaltung über Zeilen und keine über
    // Mails — und genau die Mails sind es, die das Postfach fluten.
    if (!angelegt) return;

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
 * Prüft die Begrenzung und legt den Magic Link an — als **eine**
 * untrennbare Einheit. Gibt zurück, ob eine Zeile entstanden ist.
 *
 * Getrennt war beides ein Wettlauf: Zwei gleichzeitige Anfragen für
 * dieselbe Adresse lesen denselben Zählstand, finden beide Platz und
 * schreiben beide. Seit die Antwort vor der Arbeit hinausgeht, braucht es
 * dafür nicht einmal Absicht — selbst ein Aufrufer, der brav auf jede 202
 * wartet, überholt die Datenbankumläufe des Hintergrundvorgangs regelmäßig.
 * Damit hätte die Begrenzung genau das nicht verhindert, wofür es sie gibt.
 *
 * Eine einzelne `INSERT … SELECT … WHERE (Zählung) < …`-Anweisung genügt
 * dagegen **nicht**: Unter READ COMMITTED — der Voreinstellung — sehen zwei
 * gleichzeitige Anweisungen denselben Stand, jede vor dem Einfügen der
 * anderen. Es braucht also eine Sperre, die beide nacheinander zwingt.
 *
 * `pg_advisory_xact_lock` sperrt auf einen selbst gewählten Schlüssel, hier
 * der Hash der kleingeschriebenen Adresse: Anfragen für dieselbe Adresse
 * reihen sich auf, Anfragen für verschiedene stören einander nicht. Zwei
 * Adressen mit gleichem Hash warten unnötig aufeinander — ein falsches
 * Ergebnis entsteht daraus nicht, nur eine Wartezeit im Hintergrund.
 *
 * Die `xact`-Variante und nicht `pg_advisory_lock`: Sie endet mit der
 * Transaktion, auch mit einer abgebrochenen. Es gibt damit kein `finally`,
 * das ein Freigeben vergessen könnte, und keine Sperre, die einen Pool nach
 * einem Fehler dauerhaft blockiert.
 *
 * Verschickt wird erst **nach** dem COMMIT, nicht in der Transaktion: Ein
 * Mailanbieter, der zwei Sekunden braucht, hielte sonst die Sperre und eine
 * Poolverbindung genauso lange.
 */
async function legeAnWennDieBegrenzungEsZulaesst(
  pool: pg.Pool,
  email: string,
  tokenHash: string,
  jetzt: Date,
  gueltigBis: Date,
  einladungId: string | null,
): Promise<boolean> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [email]);

    const erlaubt = await darfAnfordern(verbindung, email, jetzt);
    if (erlaubt) {
      // angelegt_am explizit statt der SQL-Voreinstellung now(): Sonst würde
      // die Begrenzung (darfAnfordern) an der Systemzeit hängen statt an der
      // eingespeisten Uhr — und wäre in Tests nicht mehr kontrollierbar. Siehe
      // dieselbe Begründung bei `ausgestellt_am` in einladung.ts.
      await verbindung.query(
        `INSERT INTO magic_link (token_hash, email, angelegt_am, gueltig_bis, einladung_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, email, jetzt, gueltigBis, einladungId],
      );
    }

    await verbindung.query('COMMIT');
    return erlaubt;
  } catch (fehler) {
    // Ohne Rücknahme käme die Verbindung mit offener Transaktion in den Pool
    // zurück. Scheitert auch die (etwa weil die Verbindung weg ist), geht
    // keiner der beiden Fehler verloren: der ursprüngliche als Ursache, der
    // zweite als Meldung.
    try {
      await verbindung.query('ROLLBACK');
    } catch (rollbackFehler) {
      throw new Error(`Rücknahme misslungen: ${String(rollbackFehler)}`, { cause: fehler });
    }
    throw fehler;
  } finally {
    verbindung.release();
  }
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
 *
 * Nimmt bewusst eine `PoolClient` und keinen Pool: Diese Auskunft ist nur
 * innerhalb der Transaktion aus `legeAnWennDieBegrenzungEsZulaesst`
 * belastbar, die sie mit dem Einfügen zusammenhält. Auf einer beliebigen
 * Poolverbindung gefragt, wäre sie sofort wieder veraltet.
 */
async function darfAnfordern(
  verbindung: pg.PoolClient,
  email: string,
  jetzt: Date,
): Promise<boolean> {
  const stundeVorher = new Date(jetzt.getTime() - 60 * 60 * 1000);

  const { rows } = await verbindung.query<{ anzahl: string; letzte: Date | null }>(
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
