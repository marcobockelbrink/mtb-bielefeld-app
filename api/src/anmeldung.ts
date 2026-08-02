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
 */
export async function fordereMagicLinkAn(
  pool: pg.Pool,
  mailer: Mailer,
  email: string,
  einladungscode: string | undefined,
  jetzt: Date,
): Promise<void> {
  const zutritt = await pruefeZutritt(pool, email, einladungscode, jetzt);
  if (!zutritt.ok) return;

  const token = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_MINUTEN * 60 * 1000);

  await pool.query(
    `INSERT INTO magic_link (token_hash, email, gueltig_bis, einladung_id)
     VALUES ($1, $2, $3, $4)`,
    [hashe(token), email, gueltigBis, zutritt.einladungId],
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
