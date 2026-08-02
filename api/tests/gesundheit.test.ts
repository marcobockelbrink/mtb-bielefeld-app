import { describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';

describe('Gesundheitsprüfung', () => {
  it('antwortet mit 200 und einem Zustand', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer() });
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ zustand: 'bereit' });
    await app.close();
  });
});
