import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ohne diese Eingrenzung sammelt vitest per Voreinstellung auch
    // `api/tests/`. Die API-Tests brauchen ab Aufgabe 2 ein laufendes
    // Postgres — ohne dieses `include` würde die CI der App daran hängen,
    // obwohl niemand die App angefasst hat.
    include: ['tests/**/*.test.ts'],
  },
});
