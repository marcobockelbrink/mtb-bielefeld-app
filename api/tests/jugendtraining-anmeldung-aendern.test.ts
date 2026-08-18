import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

// Handoff 12/13, „13b — Eine bestehende Anmeldung ändern". Der Kern ist
// nicht das Ändern, sondern **wer** ändern darf: Ein Guide sieht die vollen
// Namen aller Kinder, darf sie aber nicht anfassen. Sichtbarkeit ist nicht
// Besitz.

const jetzt = new Date('2026-08-03T12:00:00Z');

function bauen() {
  return baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

/** Ein veröffentlichtes Training mit einer Anmeldung von `eltern`. */
async function aufbau(plaetze: number | null = 12) {
  const app = bauen();
  const guide = await mitgliedMitToken('guide@example.org', 'guide');
  const eltern = await mitgliedMitToken('eltern@example.org');

  const training = (
    await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz', plaetze },
    })
  ).json();

  await app.inject({
    method: 'POST',
    url: `/jugendtraining/${training.id}/veroeffentlichen`,
    headers: { authorization: `Bearer ${guide.zugang}` },
  });

  const kindId = (
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/kinder`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { vorname: 'Mika', nachname: 'Muster', zeigtVorname: true, zeigtNachname: true },
    })
  ).json().kindId;

  return { app, guide, eltern, training, kindId };
}

const aendern = (
  app: ReturnType<typeof baueApp>,
  trainingId: string,
  kindId: string,
  zugang: string,
  payload: Record<string, unknown>,
) =>
  app.inject({
    method: 'PATCH',
    url: `/jugendtraining/${trainingId}/kinder/${kindId}`,
    headers: { authorization: `Bearer ${zugang}` },
    payload,
  });

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('PATCH /jugendtraining/:id/kinder/:kindId', () => {
  it('ändert den Namen, ohne den Platz anzutasten', async () => {
    // **Der Grund für diesen Endpunkt.** Austragen und neu anmelden verliert
    // bei einem vollen Training den Platz.
    const { app, eltern, guide, training, kindId } = await aufbau();

    expect((await aendern(app, training.id, kindId, eltern.zugang, { vorname: 'Mia' })).statusCode).toBe(204);

    const danach = (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${guide.zugang}` },
      })
    ).json();

    expect(danach.belegt).toBe(1);
    expect(danach.kinder[0].anzeige).toContain('Mia');
  });

  it('geht auch bei einem vollen Training', async () => {
    // Genau der Fall, für den es den Endpunkt gibt: Austragen wäre hier ein
    // verlorener Platz.
    const { app, eltern, training, kindId } = await aufbau(1);
    expect((await aendern(app, training.id, kindId, eltern.zugang, { nachname: 'Meier' })).statusCode).toBe(204);
  });

  it('schaltet die Sichtbarkeit sofort für andere um', async () => {
    const { app, eltern, guide, training, kindId } = await aufbau();
    const fremd = await mitgliedMitToken('fremd@example.org');

    await aendern(app, training.id, kindId, eltern.zugang, { zeigtNachname: false });

    const fuerFremde = (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${fremd.zugang}` },
      })
    ).json();
    expect(fuerFremde.kinder[0].anzeige).not.toContain('Muster');

    // Der Guide sieht weiterhin den vollen Namen — das ist der Sinn seiner
    // Rolle und ändert sich durch die Freigabe nicht.
    const fuerGuide = (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${guide.zugang}` },
      })
    ).json();
    expect(fuerGuide.kinder[0].anzeige).toContain('Muster');
  });

  it('lässt ein fremdes Konto nicht heran', async () => {
    const { app, training, kindId } = await aufbau();
    const fremd = await mitgliedMitToken('fremd@example.org');

    expect((await aendern(app, training.id, kindId, fremd.zugang, { vorname: 'Hacke' })).statusCode).toBe(404);
  });

  it('lässt auch einen Guide nicht heran, obwohl er die Namen sieht', async () => {
    // **Sichtbarkeit ist nicht Besitz.** Der Guide braucht die Namen für die
    // Aufsicht; ändern darf sie nur, wer das Kind angemeldet hat.
    const { app, guide, training, kindId } = await aufbau();

    expect((await aendern(app, training.id, kindId, guide.zugang, { vorname: 'Umbenannt' })).statusCode).toBe(404);
  });

  it('lässt eine stornierte Anmeldung nicht mehr ändern', async () => {
    const { app, eltern, training, kindId } = await aufbau();

    await app.inject({
      method: 'DELETE',
      url: `/jugendtraining/${training.id}/kinder/${kindId}`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
    });

    expect((await aendern(app, training.id, kindId, eltern.zugang, { vorname: 'Zurueck' })).statusCode).toBe(404);
  });

  it('weist einen leeren Namen ab, statt ihn zu übernehmen', async () => {
    // `COALESCE` nähme einen leeren Text als Wert — in der Teilnehmerliste
    // stünde dann eine namenlose Zeile.
    const { app, eltern, training, kindId } = await aufbau();

    expect((await aendern(app, training.id, kindId, eltern.zugang, { vorname: '   ' })).statusCode).toBe(400);
  });

  it('ändert nur das mitgeschickte Feld', async () => {
    const { app, eltern, guide, training, kindId } = await aufbau();

    await aendern(app, training.id, kindId, eltern.zugang, { nachname: 'Meier' });

    const danach = (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${guide.zugang}` },
      })
    ).json();
    expect(danach.kinder[0].anzeige).toContain('Mika');
    expect(danach.kinder[0].anzeige).toContain('Meier');
  });

  it('antwortet auf eine unbrauchbare Kennung mit 404, nicht mit 500', async () => {
    const { app, eltern, training } = await aufbau();

    expect((await aendern(app, training.id, 'keine-kennung', eltern.zugang, { vorname: 'X' })).statusCode).toBe(404);
  });
});
