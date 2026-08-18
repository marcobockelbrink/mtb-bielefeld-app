import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { GemerkterMailer, type Mailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

// Die Akzeptanzkriterien aus Handoff 12/13 („Ein Training bearbeiten") —
// jedes einzeln geprüft, weil sie zusammen den Unterschied zwischen
// „korrigierbar" und „acht Familien verwirrt" ausmachen.
//
// **Gefiltert wird auf den Betreff, nicht auf die Gesamtzahl der Mails.**
// Anlegen und Veröffentlichen verschicken selbst welche (Guide-Anfrage,
// Ankündigung), und die laufen im Hintergrund — sie können auch nach einem
// `versendet.length = 0` noch eintrudeln. Genau daran ist der erste Entwurf
// dieser Tests gescheitert: Er zählte eine Guide-Anfrage als Änderungsmail.

/** Nur die Mails, die diese Untersuchung angehen. */
function aenderungsmails(mailer: GemerkterMailer) {
  return mailer.versendet.filter((m) => m.betreff.startsWith('Änderung:'));
}

const jetzt = new Date('2026-08-03T12:00:00Z');

function bauen(mailer: Mailer = new GemerkterMailer()) {
  return baueApp({ pool, mailer, jetzt: () => jetzt });
}

async function mitgliedMitToken(email: string, rolle: 'mitglied' | 'guide' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

async function veroeffentlichtesTraining(app: ReturnType<typeof baueApp>, guide: string) {
  const training = (
    await app.inject({
      method: 'POST',
      url: '/jugendtraining',
      headers: { authorization: `Bearer ${guide}` },
      payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz', plaetze: 12 },
    })
  ).json();

  await app.inject({
    method: 'POST',
    url: `/jugendtraining/${training.id}/veroeffentlichen`,
    headers: { authorization: `Bearer ${guide}` },
  });

  return training;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('PATCH /jugendtraining/:id — wer darf', () => {
  it('lässt ein gewöhnliches Mitglied nicht ändern', async () => {
    // 403 und nicht 404: Wer angemeldet ist, darf erfahren, dass es diesen
    // Weg gibt — nur nicht, dass er ihn gehen darf. Dieselbe Begründung wie
    // beim Anlegen.
    const app = bauen();
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const mitglied = await mitgliedMitToken('anna@example.org');
    const training = await veroeffentlichtesTraining(app, guide.zugang);

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${mitglied.zugang}` },
      payload: { ort: 'Woanders' },
    });

    expect(antwort.statusCode).toBe(403);
  });

  it('lehnt ein abgesagtes Training ab', async () => {
    // Die Eltern haben die Absage mit Ort und Zeit in der Hand; würde beides
    // danach noch wandern, stünde in ihrer Mail etwas anderes als in der App.
    const app = bauen();
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const training = await veroeffentlichtesTraining(app, guide.zugang);

    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/absage`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { grund: 'Gewitter' },
    });

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { ort: 'Woanders' },
    });

    expect(antwort.statusCode).toBe(404);
  });
});

describe('PATCH /jugendtraining/:id — was sich ändert', () => {
  it('ändert genau das mitgeschickte Feld und lässt den Rest stehen', async () => {
    // **Das wichtigste Kriterium.** Schickte der Bildschirm stur alle
    // Felder, überschriebe ein leer gelassenes Hinweisfeld einen Hinweis,
    // den niemand angefasst hat.
    const app = bauen();
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const training = (
      await app.inject({
        method: 'POST',
        url: '/jugendtraining',
        headers: { authorization: `Bearer ${guide.zugang}` },
        payload: {
          beginntAm: '2026-08-10T18:00:00Z',
          ort: 'Waldparkplatz',
          hinweis: 'Helm mitbringen',
          plaetze: 12,
        },
      })
    ).json();

    const geaendert = (
      await app.inject({
        method: 'PATCH',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${guide.zugang}` },
        payload: { ort: 'Johannisberg' },
      })
    ).json();

    expect(geaendert.ort).toBe('Johannisberg');
    expect(geaendert.hinweis).toBe('Helm mitbringen');
    expect(geaendert.plaetze).toBe(12);
    expect(new Date(geaendert.beginntAm).toISOString()).toBe('2026-08-10T18:00:00.000Z');
  });

  it('behält Anmeldungen über eine Änderung hinweg', async () => {
    const app = bauen();
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const eltern = await mitgliedMitToken('eltern@example.org');
    const training = await veroeffentlichtesTraining(app, guide.zugang);

    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/kinder`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { vorname: 'Finn', nachname: 'Meyer', zeigtVorname: true, zeigtNachname: false },
    });

    await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { ort: 'Johannisberg' },
    });

    const danach = (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${training.id}`,
        headers: { authorization: `Bearer ${eltern.zugang}` },
      })
    ).json();

    expect(danach.belegt).toBe(1);
    expect(danach.kinder).toHaveLength(1);
  });
});

describe('PATCH /jugendtraining/:id — die Mail an die Familien', () => {
  async function mitAnmeldung() {
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const eltern = await mitgliedMitToken('eltern@example.org');
    const training = await veroeffentlichtesTraining(app, guide.zugang);

    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/kinder`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { vorname: 'Finn', nachname: 'Meyer', zeigtVorname: true, zeigtNachname: false },
    });

    return { app, mailer, guide, training };
  }

  it('informiert die angemeldeten Familien mit alt → neu', async () => {
    const { app, mailer, guide, training } = await mitAnmeldung();

    await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { ort: 'Johannisberg', elternInformieren: true },
    });

    // Der Versand läuft im Hintergrund — kurz Zeit lassen.
    await new Promise((r) => setTimeout(r, 50));

    const mails = aenderungsmails(mailer);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.an).toBe('eltern@example.org');
    expect(mails[0]!.text).toContain('Treffpunkt: Waldparkplatz → Johannisberg');
  });

  it('verschickt ohne Häkchen nichts', async () => {
    const { app, mailer, guide, training } = await mitAnmeldung();

    await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { ort: 'Johannisberg' },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(aenderungsmails(mailer)).toHaveLength(0);
  });

  it('verschickt nichts, wenn sich für die Familien nichts geändert hat', async () => {
    // `guidesNoetig` ist eine Angabe der Guides untereinander. Eine Mail
    // darüber wäre eine Mail zu viel — und die Guides ließen das Häkchen
    // danach grundsätzlich weg.
    const { app, mailer, guide, training } = await mitAnmeldung();

    await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { guidesNoetig: 4, elternInformieren: true },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(aenderungsmails(mailer)).toHaveLength(0);
  });

  it('verschickt beim Entwurf nichts, auch mit Häkchen', async () => {
    // Niemand weiß von dem Termin; die „Änderung"-Mail wäre die erste
    // Nachricht, die jemand davon hört.
    const mailer = new GemerkterMailer();
    const app = bauen(mailer);
    const guide = await mitgliedMitToken('guide@example.org', 'guide');
    const training = (
      await app.inject({
        method: 'POST',
        url: '/jugendtraining',
        headers: { authorization: `Bearer ${guide.zugang}` },
        payload: { beginntAm: '2026-08-10T18:00:00Z', ort: 'Waldparkplatz' },
      })
    ).json();

    await app.inject({
      method: 'PATCH',
      url: `/jugendtraining/${training.id}`,
      headers: { authorization: `Bearer ${guide.zugang}` },
      payload: { ort: 'Johannisberg', elternInformieren: true },
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(aenderungsmails(mailer)).toHaveLength(0);
  });
});
