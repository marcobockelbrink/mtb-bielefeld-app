/**
 * Mailversand hinter einer Schnittstelle.
 *
 * Welcher Anbieter tatsächlich verschickt, ist in der Spec noch offen. Die
 * Schnittstelle hält diese Entscheidung heraus: Tests nutzen den gemerkten
 * Mailer, die Umsetzung des echten Versands kommt in Plan 4.
 *
 * Ein eigener Mailserver kommt nicht in Frage — Zustellbarkeit ist ein
 * Vollzeitproblem.
 */

export interface Mailer {
  sende(an: string, betreff: string, text: string): Promise<void>;
}

export interface GemerkteMail {
  an: string;
  betreff: string;
  text: string;
}

/** Verschickt nichts, merkt sich alles. Für Tests. */
export class GemerkterMailer implements Mailer {
  readonly versendet: GemerkteMail[] = [];

  async sende(an: string, betreff: string, text: string): Promise<void> {
    this.versendet.push({ an, betreff, text });
  }
}

/**
 * Platzhalter für Umgebungen ohne echten Mailversand — scheitert laut statt
 * still zu schlucken.
 *
 * Ein Mailer, der einfach nichts tut, wäre gefährlicher als gar keiner: Der
 * Anmeldeendpunkt antwortet immer mit 202, egal ob eine Mail unterwegs ist —
 * genau deshalb darf ein fehlender Versand nicht unbemerkt bleiben. Mit
 * diesem Platzhalter endet ein Anmeldeversuch sichtbar mit einem
 * Serverfehler, statt einen Erfolg vorzutäuschen, den es nicht gibt.
 */
export class NichtEingerichteterMailer implements Mailer {
  async sende(_an: string, _betreff: string, _text: string): Promise<void> {
    throw new Error(
      'Mailversand ist noch nicht eingerichtet — welcher Anbieter ' +
        'verschickt, klärt Plan 4. Bis dahin kann keine Mail raus.',
    );
  }
}

import nodemailer from 'nodemailer';

/**
 * Verschickt über einen SMTP-Server.
 *
 * Kein eigener Mailserver — der Kommentar oben gilt weiter. Dies ist der
 * Anschluss an einen fremden: lokal an Mailpit, das alles abfängt und im
 * Browser zeigt; auf dem Server an den Anbieter, den der Verein wählt.
 */
export class SmtpMailer implements Mailer {
  readonly #transport: nodemailer.Transporter;
  readonly #absender: string;

  constructor({
    host,
    port,
    absender,
    benutzer,
    passwort,
  }: {
    host: string;
    port: number;
    absender: string;
    benutzer?: string;
    passwort?: string;
  }) {
    this.#absender = absender;
    this.#transport = nodemailer.createTransport({
      host,
      port,
      // Mailpit spricht kein TLS; ein echter Anbieter auf Port 587 schon.
      secure: port === 465,
      auth: benutzer && passwort ? { user: benutzer, pass: passwort } : undefined,
    });
  }

  async sende(an: string, betreff: string, text: string): Promise<void> {
    await this.#transport.sendMail({ from: this.#absender, to: an, subject: betreff, text });
  }
}

/**
 * Wählt den Mailer nach der Umgebung.
 *
 * Ohne `SMTP_HOST` bleibt es beim lauten Platzhalter — eine Umgebung ohne
 * Mailversand soll das merken, sobald jemand sich anzumelden versucht.
 * **Halb** eingerichtet scheitert dagegen sofort beim Start: Ein Server, der
 * anläuft und erst später merkt, dass ihm der Absender fehlt, verschiebt
 * den Fehler auf den ersten echten Nutzer.
 */
export function waehleMailer(umgebung: NodeJS.ProcessEnv = process.env): Mailer {
  const host = umgebung.SMTP_HOST;
  if (!host) return new NichtEingerichteterMailer();

  const absender = umgebung.MAIL_ABSENDER;
  if (!absender) {
    throw new Error(
      'SMTP_HOST ist gesetzt, MAIL_ABSENDER fehlt — ohne Absenderadresse ' +
        'nimmt kein Mailserver eine Nachricht an.',
    );
  }

  return new SmtpMailer({
    host,
    port: Number(umgebung.SMTP_PORT ?? 587),
    absender,
    benutzer: umgebung.SMTP_BENUTZER,
    passwort: umgebung.SMTP_PASSWORT,
  });
}
