import { describe, expect, it } from 'vitest';

import { NichtEingerichteterMailer } from '../src/mailer.ts';

describe('NichtEingerichteterMailer', () => {
  it('scheitert laut statt einen Versand vorzutäuschen', async () => {
    const mailer = new NichtEingerichteterMailer();

    // Geprüft wird nicht nur, *dass* es scheitert, sondern dass die Meldung
    // sagt, was fehlt: Wer sie im Protokoll findet, soll den Handgriff
    // kennen, ohne den Quelltext aufzuschlagen.
    await expect(mailer.sende('malte@example.org', 'Betreff', 'Text')).rejects.toThrow(
      /Mailversand ist nicht eingerichtet.*SMTP_HOST/s,
    );
  });
});
