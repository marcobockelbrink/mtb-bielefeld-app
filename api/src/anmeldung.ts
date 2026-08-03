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
const HOECHSTENS_JE_FENSTER = 3;
const MINDESTABSTAND_SEKUNDEN = 60;

/**
 * Wie lange die Transaktion in `legeAnWennDieBegrenzungEsZulaesst` höchstens
 * auf die Sperre und danach auf jede einzelne Anweisung wartet.
 *
 * `pg_advisory_xact_lock` wartet ohne Zeitschranke, falls die Sperre schon
 * gehalten wird — und hält dabei die ganze Zeit eine Poolverbindung. Hängt
 * ein Vorgang, der die Sperre hält (oder ein Backend, das sie durch einen
 * eigenen Absturz verwaist zurücklässt), reihen sich alle weiteren Anfragen
 * für dieselbe Adresse dahinter auf, bis sämtliche Verbindungen des Pools
 * belegt sind — danach kommt **keine** Anfrage mehr durch, auch nicht
 * `/konto` oder `/sitzung/erneuern`. Die Transaktion macht nur ein `COUNT`
 * und ein `INSERT`, ein paar Sekunden genügen reichlich.
 */
const SPERR_ZEITSCHRANKE = '3s';

/**
 * Über welchen Zeitraum gezählt wird — **die** eine Stelle für diese Zahl.
 *
 * Exportiert, weil das Aufräumen (`aufraeumen.ts`) sie genauso braucht: Die
 * Begrenzung zählt auf `magic_link`, also darf dort erst weggeräumt werden,
 * was auch hier nichts mehr zählt. Stünde die Zahl an zwei Stellen, liefen
 * beide beim nächsten Verstellen wieder auseinander — und genau das war schon
 * einmal der Fall: Das Aufräumen ging nach `gueltig_bis` (15 Minuten) und
 * warf damit die Zeilen weg, auf denen diese Stunde zählt. Aus „drei je
 * Stunde" wurde faktisch das Drei- bis Vierfache.
 */
export const ZAEHLFENSTER_MINUTEN = 60;

/**
 * Wie viele Magic Links insgesamt je Zählfenster verschickt werden dürfen —
 * über alle Adressen zusammen, nicht je einzelne.
 *
 * Die Begrenzung je Adresse schützt die einzelne Adresse, nicht den
 * Mailversand des Vereins als Ganzes: Wer mit tausend **verschiedenen**
 * Adressen anfragt, löst tausend Mails aus — jede für sich regelkonform. Der
 * Schaden trifft die Zustellbarkeit, nicht ein einzelnes Postfach: Ein
 * Mailanbieter, der plötzlich massenhaft Mails von der Vereinsdomain sieht
 * (viele an erfundene Adressen, die hart abprallen), stuft die Domain als
 * Spamquelle ein — danach landen auch die echten Magic Links im Spamordner,
 * für alle, auf Wochen. Das lässt sich nicht per Neustart reparieren.
 *
 * Die Zahl ist an der Mitgliederschaft gemessen, nicht geschätzt: Bei rund
 * 200 Mitgliedern gibt es keine 30 echten Anmeldewünsche in einer Stunde.
 * Wer mehr sieht, sieht keinen Ansturm, sondern einen Angriff auf den Ruf der
 * Domain.
 */
const GLOBALES_STUNDENBUDGET = 30;

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
    const ergebnis = await legeAnWennDieBegrenzungEsZulaesst(
      pool,
      email,
      hashe(token),
      jetzt,
      gueltigBis,
      einladungId,
    );

    // Das globale Budget ist der Alarmfall, nicht der Normalfall: Anders als
    // eine greifende Begrenzung je Adresse (die bleibt stumm, siehe oben)
    // ist das hier ein Hinweis, dass gerade etwas mit dem Ruf der
    // Vereinsdomain passiert — das soll der Betreiber sofort sehen, nicht
    // erst beim nächsten Blick ins Zustellbarkeits-Dashboard.
    if (!ergebnis.angelegt && ergebnis.budgetErschoepft) {
      protokoll.error(
        { an: email, budget: GLOBALES_STUNDENBUDGET, fensterMinuten: ZAEHLFENSTER_MINUTEN },
        'Globales Stundenbudget für Magic Links erschöpft — kein Versand. ' +
          'Das ist kein normaler Ansturm: Bei rund 200 Mitgliedern deutet das ' +
          'auf einen Angriff auf die Zustellbarkeit der Vereinsdomain hin.',
      );
    }

    // Nur verschicken, wenn auch wirklich eine Zeile entstanden ist. Sonst
    // wäre die Begrenzung nur eine Buchhaltung über Zeilen und keine über
    // Mails — und genau die Mails sind es, die das Postfach fluten.
    if (!ergebnis.angelegt) return;

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
 * Ergebnis von `legeAnWennDieBegrenzungEsZulaesst`: entweder ist die Zeile
 * entstanden, oder sie ist es nicht — und dann ist von Interesse, ob das am
 * globalen Budget lag. Nur dieser Fall soll laut ins Protokoll, die
 * Begrenzung je Adresse bleibt bewusst stumm (siehe `fordereMagicLinkAn`).
 */
type Anlegeergebnis = { angelegt: true } | { angelegt: false; budgetErschoepft: boolean };

/**
 * Prüft die Begrenzung und legt den Magic Link an — als **eine**
 * untrennbare Einheit. Gibt zurück, ob eine Zeile entstanden ist und, falls
 * nicht, ob das am globalen Stundenbudget lag.
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
 *
 * Bleibt die Sperre trotzdem hängen (siehe `SPERR_ZEITSCHRANKE`), bricht
 * `lock_timeout` das Warten mit einem Fehler ab. Der wird hier **nicht**
 * gesondert behandelt: Er läuft in den bestehenden Rollback-Zweig und von da
 * unverändert zum Aufrufer (`fuehreBerechtigtenZutrittLeiseAus`) hinaus, der
 * ihn ohnehin schon abfängt, protokolliert und nach außen wie eine
 * greifende Begrenzung behandelt — kein Link, aber 202. Ein eigener Zweig
 * dafür würde nur verdoppeln, was es schon gibt.
 *
 * Nach der Begrenzung je Adresse folgt, noch hinter derselben Sperre und in
 * derselben Transaktion, die Prüfung des globalen Stundenbudgets
 * (`unterGlobalemBudget`) — beide zusammen entscheiden, ob eingefügt wird.
 */
async function legeAnWennDieBegrenzungEsZulaesst(
  pool: pg.Pool,
  email: string,
  tokenHash: string,
  jetzt: Date,
  gueltigBis: Date,
  einladungId: string | null,
): Promise<Anlegeergebnis> {
  const verbindung = await pool.connect();
  try {
    await verbindung.query('BEGIN');
    // Vor der Sperre gesetzt, damit die Zeitschranke auch für das Warten
    // auf sie selbst gilt, nicht erst für die Anweisungen danach.
    await verbindung.query(`SET LOCAL lock_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query(`SET LOCAL statement_timeout = '${SPERR_ZEITSCHRANKE}'`);
    await verbindung.query('SELECT pg_advisory_xact_lock(hashtext(lower($1)))', [email]);

    const adressbegrenzungErlaubt = await darfAnfordern(verbindung, email, jetzt);
    const budgetErschoepft =
      adressbegrenzungErlaubt && !(await unterGlobalemBudget(verbindung, jetzt));
    const angelegt = adressbegrenzungErlaubt && !budgetErschoepft;

    if (angelegt) {
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
    return angelegt ? { angelegt: true } : { angelegt: false, budgetErschoepft };
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
  const fensteranfang = new Date(jetzt.getTime() - ZAEHLFENSTER_MINUTEN * 60 * 1000);

  const { rows } = await verbindung.query<{ anzahl: string; letzte: Date | null }>(
    `SELECT count(*) AS anzahl, max(angelegt_am) AS letzte
       FROM magic_link
      WHERE lower(email) = lower($1) AND angelegt_am > $2`,
    [email, fensteranfang],
  );

  const zeile = rows[0];
  if (!zeile) return true;

  if (Number(zeile.anzahl) >= HOECHSTENS_JE_FENSTER) return false;

  if (zeile.letzte) {
    const abstandSekunden = (jetzt.getTime() - zeile.letzte.getTime()) / 1000;
    if (abstandSekunden < MINDESTABSTAND_SEKUNDEN) return false;
  }

  return true;
}

/**
 * Ob insgesamt, über alle Adressen hinweg, noch Platz im Zählfenster ist.
 *
 * Zählt bewusst **ohne** Adressfilter, sonst dieselbe Abfrage wie in
 * `darfAnfordern` — auf `magic_link`, über `ZAEHLFENSTER_MINUTEN`, damit das
 * Budget genau dann sinkt, wenn auch die Begrenzung je Adresse zählt, und
 * genau dann durchs Aufräumen entlastet wird, wenn auch sie entlastet wird.
 * Eine zweite Fensterlänge nur fürs Budget würde die beiden wieder
 * auseinanderlaufen lassen — siehe die Begründung bei `ZAEHLFENSTER_MINUTEN`.
 *
 * Läuft wie `darfAnfordern` hinter der Beratungssperre aus
 * `legeAnWennDieBegrenzungEsZulaesst` — aber diese Sperre ist **je Adresse**,
 * sie serialisiert den globalen Zählstand also nicht: Zwei gleichzeitige
 * Anfragen für zwei **verschiedene** Adressen nehmen zwei verschiedene
 * Sperren, lesen beide denselben Zählstand und können beide einfügen. Das
 * ist hier bewusst hingenommen, nicht übersehen: Beim Budget geht es um die
 * Größenordnung — 30 gegen die Tausende einer echten Flut —, nicht um
 * Exaktheit auf ±1. Eine Sperre, die auch das noch abfängt, müsste global
 * sein und würde damit **alle** gleichzeitigen Anfragen für **alle**
 * Adressen hintereinander zwingen, egal wie unterschiedlich sie sind — genau
 * die Eigenschaft, die die Sperre je Adresse in `legeAnWennDieBegrenzungEsZulaesst`
 * bewusst vermeidet. Wer das hier „nachbessert", tauscht eine kleine,
 * hinnehmbare Unschärfe gegen einen Engpass ein, der jede Anmeldung im Verein
 * hintereinander abarbeitet.
 */
async function unterGlobalemBudget(verbindung: pg.PoolClient, jetzt: Date): Promise<boolean> {
  const fensteranfang = new Date(jetzt.getTime() - ZAEHLFENSTER_MINUTEN * 60 * 1000);

  const { rows } = await verbindung.query<{ anzahl: string }>(
    'SELECT count(*) AS anzahl FROM magic_link WHERE angelegt_am > $1',
    [fensteranfang],
  );

  return Number(rows[0]?.anzahl ?? 0) < GLOBALES_STUNDENBUDGET;
}
