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
