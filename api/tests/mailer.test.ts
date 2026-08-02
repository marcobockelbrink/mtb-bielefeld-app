import { describe, expect, it } from 'vitest';

import { NichtEingerichteterMailer } from '../src/mailer.ts';

describe('NichtEingerichteterMailer', () => {
  it('scheitert laut statt einen Versand vorzutäuschen', async () => {
    const mailer = new NichtEingerichteterMailer();

    await expect(mailer.sende('malte@example.org', 'Betreff', 'Text')).rejects.toThrow(
      /Mailversand ist noch nicht eingerichtet/,
    );
  });
});
