import { describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';

describe('Gesundheitsprüfung', () => {
  it('antwortet mit 200 und einem Zustand', async () => {
    const app = baueApp();
    const antwort = await app.inject({ method: 'GET', url: '/gesundheit' });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toEqual({ zustand: 'bereit' });
    await app.close();
  });
});
