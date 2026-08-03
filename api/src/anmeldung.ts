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

  await fuehreBerechtigtenZutrittLeiseAus(
    pool,
    mailer,
    protokoll,
    email,
    token,
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
  gueltigBis: Date,
  einladungId: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO magic_link (token_hash, email, gueltig_bis, einladung_id)
       VALUES ($1, $2, $3, $4)`,
      [hashe(token), email, gueltigBis, einladungId],
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
