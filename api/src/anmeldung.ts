/**
 * Anmeldung per Magic Link.
 *
 * Kein Passwort: Wo es keines gibt, kann keines geleakt, wiederverwendet
 * oder vergessen werden. Wer die Mail an seiner Adresse abrufen kann und
 * einen gültigen Einladungscode hat, ist Mitglied.
 */

import type pg from 'pg';

import { loeseEinladungEin } from './einladung.ts';
import type { Mailer } from './mailer.ts';
import { erzeugeToken, hashe } from './token.ts';

/** Kurz genug, dass ein abgefangener Link wertlos wird. */
const GUELTIG_MINUTEN = 15;

const BASIS_URL = process.env.APP_BASIS_URL ?? 'https://app.mtb-bielefeld.de';

/**
 * Prüft den Einladungscode und verschickt bei Erfolg den Link.
 *
 * Wirft **nicht**, wenn der Code falsch ist: Der Aufrufer soll in jedem Fall
 * dieselbe Antwort geben. Ob etwas passiert ist, erfährt nur, wer die Mail
 * bekommt.
 */
export async function fordereMagicLinkAn(
  pool: pg.Pool,
  mailer: Mailer,
  email: string,
  einladungscode: string,
  jetzt: Date,
): Promise<void> {
  const einloesung = await loeseEinladungEin(pool, einladungscode, jetzt);
  if (!einloesung.ok) return;

  const token = erzeugeToken();
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_MINUTEN * 60 * 1000);

  await pool.query(
    `INSERT INTO magic_link (token_hash, email, gueltig_bis) VALUES ($1, $2, $3)`,
    [hashe(token), email, gueltigBis],
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
