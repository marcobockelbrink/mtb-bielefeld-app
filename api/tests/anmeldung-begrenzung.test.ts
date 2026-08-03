import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { fordereMagicLinkAn } from '../src/anmeldung.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import type { Protokoll } from '../src/protokoll.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

/**
 * Ein Protokoll, das nichts tut — hier wird nichts davon geprüft.
 */
const stillesProtokoll: Protokoll = {
  error: () => {},
};

const start = new Date('2026-08-03T12:00:00Z');

/** Legt ein Mitglied an, damit kein Einladungscode nötig ist. */
async function mitgliedAnlegen(): Promise<void> {
  await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
}

/** Fordert an und gibt zurück, wie viele Mails insgesamt verschickt wurden. */
async function fordere(mailer: GemerkterMailer, jetzt: Date): Promise<number> {
  await fordereMagicLinkAn(pool, mailer, stillesProtokoll, 'malte@example.org', undefined, jetzt);
  return mailer.versendet.length;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('Begrenzung je Adresse', () => {
  it('lässt die erste Anforderung durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    expect(await fordere(mailer, start)).toBe(1);
  });

  it('lehnt eine zweite Anforderung innerhalb einer Minute ab', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachDreissigSekunden = new Date(start.getTime() + 30 * 1000);

    expect(await fordere(mailer, nachDreissigSekunden)).toBe(1);
  });

  it('lässt nach einer Minute wieder eine durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    const nachZweiMinuten = new Date(start.getTime() + 2 * 60 * 1000);

    expect(await fordere(mailer, nachZweiMinuten)).toBe(2);
  });

  it('lässt höchstens drei je Stunde durch', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    // Drei im Abstand von je fünf Minuten: alle erlaubt.
    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Die vierte innerhalb derselben Stunde nicht mehr.
    const anzahl = await fordere(mailer, new Date(start.getTime() + 15 * 60 * 1000));

    expect(anzahl).toBe(3);
  });

  it('zählt das Fenster gleitend, nicht je voller Stunde', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordere(mailer, new Date(start.getTime() + 5 * 60 * 1000));
    await fordere(mailer, new Date(start.getTime() + 10 * 60 * 1000));

    // Gut eine Stunde nach der ersten: Die erste ist aus dem Fenster
    // gefallen, also ist wieder Platz.
    const spaeter = new Date(start.getTime() + 61 * 60 * 1000);

    expect(await fordere(mailer, spaeter)).toBe(4);
  });

  it('begrenzt je Adresse, nicht insgesamt', async () => {
    await mitgliedAnlegen();
    await pool.query("INSERT INTO mitglied (email) VALUES ('anna@example.org')");
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'anna@example.org',
      undefined,
      new Date(start.getTime() + 1000),
    );

    expect(mailer.versendet).toHaveLength(2);
  });

  it('unterscheidet Groß- und Kleinschreibung nicht', async () => {
    await mitgliedAnlegen();
    const mailer = new GemerkterMailer();

    await fordere(mailer, start);
    await fordereMagicLinkAn(
      pool,
      mailer,
      stillesProtokoll,
      'MALTE@example.org',
      undefined,
      new Date(start.getTime() + 30 * 1000),
    );

    expect(mailer.versendet).toHaveLength(1);
  });
});
