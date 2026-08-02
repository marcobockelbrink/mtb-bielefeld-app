import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Tests fassen dieselbe Datenbank an; parallel würden sie sich
    // gegenseitig die Zeilen wegräumen.
    fileParallelism: false,
  },
});
