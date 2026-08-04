import { describe, expect, it } from 'vitest';

import { NichtEingerichteterMailer, SmtpMailer, waehleMailer } from '../src/mailer.ts';

describe('waehleMailer', () => {
  it('nimmt SMTP, wenn ein Server eingetragen ist', () => {
    const mailer = waehleMailer({
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
      MAIL_ABSENDER: 'noreply@example.org',
    });
    expect(mailer).toBeInstanceOf(SmtpMailer);
  });

  it('scheitert laut, wenn kein Server eingetragen ist', () => {
    const mailer = waehleMailer({});
    expect(mailer).toBeInstanceOf(NichtEingerichteterMailer);
  });

  it('scheitert laut, wenn der Server steht, aber der Absender fehlt', () => {
    // Halb eingerichtet ist schlimmer als gar nicht: Der Versand würde erst
    // beim ersten Anmeldeversuch scheitern, nicht beim Start.
    expect(() => waehleMailer({ SMTP_HOST: 'mailpit' })).toThrow(/Absender/);
  });
});
