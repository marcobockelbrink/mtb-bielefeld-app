import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import {
  brauchtEigeneStimme,
  darfSetzen,
  fasseZusammen,
  TEXT_VERSION,
} from '../src/einwilligung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { legeSitzungAn } from '../src/sitzung.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-22T12:00:00Z');

function bauen() {
  return baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
}

async function konto(email: string, rolle: 'mitglied' | 'guide' | 'verwaltung' = 'mitglied') {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO mitglied (email, rolle) VALUES ($1, $2) RETURNING id',
    [email, rolle],
  );
  const token = await legeSitzungAn(pool, rows[0]!.id, jetzt);
  return { id: rows[0]!.id, zugang: token.zugang };
}

/** Ein Kindprofil unter einem Elternkonto. */
async function kind(elternId: string, name: string, geburtsjahr: number | null = 2016) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mitglied (email, name, geburtsjahr, verwaltet_von)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${name.toLowerCase()}.${Math.random().toString(36).slice(2, 8)}@familie.mtb-bielefeld.de`, name, geburtsjahr, elternId],
  );
  return rows[0]!.id;
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

// --- Reine Rechenlogik ------------------------------------------------------

describe('brauchtEigeneStimme', () => {
  it('verlangt ab 13 eine zweite Stimme', () => {
    // Jahresgrenze, kein Geburtstag — am Profil steht nur `geburtsjahr`.
    expect(brauchtEigeneStimme(2013, jetzt)).toBe(true);
    expect(brauchtEigeneStimme(2014, jetzt)).toBe(false);
  });

  it('erfindet ohne Geburtsjahr keine Hürde', () => {
    // Sonst bliebe jedes ältere Profil ohne Angabe für immer unvollständig.
    expect(brauchtEigeneStimme(null, jetzt)).toBe(false);
  });
});

describe('darfSetzen', () => {
  it('lässt ein Mitgliedskonto nur zustimmen', () => {
    // Die Hürde für ein Nein liegt bewusst beim Gespräch mit der
    // Verwaltung — und das steht hier, nicht in der Oberfläche: Ein
    // fehlender Knopf ist keine Regel.
    expect(darfSetzen('erteilt', false)).toBe(true);
    expect(darfSetzen('abgelehnt', false)).toBe(false);
    expect(darfSetzen('widerrufen', false)).toBe(false);
  });

  it('lässt die Verwaltung alles', () => {
    expect(darfSetzen('abgelehnt', true)).toBe(true);
    expect(darfSetzen('widerrufen', true)).toBe(true);
  });

  it('nimmt keinen erfundenen Status an', () => {
    expect(darfSetzen('vielleicht', true)).toBe(false);
  });
});

describe('fasseZusammen', () => {
  const zeile = (teil: Partial<Parameters<typeof fasseZusammen>[0][number]> = {}) => ({
    status: 'erteilt' as const,
    text_version: TEXT_VERSION,
    name: 'Marco',
    angelegt_am: jetzt,
    jugend_bestaetigt: false,
    quelle: 'app' as const,
    ...teil,
  });

  it('nennt eine leere Historie „offen"', () => {
    expect(fasseZusammen([], false).status).toBe('offen');
  });

  it('lässt eine Zustimmung zu altem Text verfallen', () => {
    // Wer einem Text zugestimmt hat, hat nicht einem anderen zugestimmt.
    const alt = fasseZusammen([zeile({ text_version: '2025-01' })], false);
    expect(alt.status).toBe('offen');
  });

  it('lässt einen Widerruf eine Textänderung überdauern', () => {
    /**
     * **Der Fall, der andersherum grotesk wäre.** Ein Widerruf, den eine
     * neue Fassung des Textes stillschweigend aufhebt, ist kein Widerruf.
     * Nur ein „Ja" verfällt.
     */
    const w = fasseZusammen([zeile({ status: 'widerrufen', text_version: '2025-01' })], false);
    expect(w.status).toBe('widerrufen');
    expect(w.vollstaendig).toBe(false);
  });

  it('gilt ohne zweite Stimme nicht als vollständig, wo sie nötig ist', () => {
    // „erteilt · Ben fehlt noch" ist noch kein Ja.
    expect(fasseZusammen([zeile()], true).vollstaendig).toBe(false);
    expect(fasseZusammen([zeile({ jugend_bestaetigt: true })], true).vollstaendig).toBe(true);
  });

  it('braucht bei jüngeren Kindern keine zweite Stimme', () => {
    expect(fasseZusammen([zeile()], false).vollstaendig).toBe(true);
    expect(fasseZusammen([zeile()], false).jugendBestaetigt).toBeNull();
  });
});

// --- Über den Endpunkt ------------------------------------------------------

describe('PATCH /familie/:id/einwilligung', () => {
  it('nimmt ein Ja von den Eltern an', async () => {
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Finn');

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt' },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ status: 'erteilt', vollstaendig: true });
    await app.close();
  });

  it('lässt ein Mitgliedskonto nicht ablehnen — auch nicht per direktem Aufruf', async () => {
    /**
     * **Wörtlich aus dem Handoff.** In der App gibt es keinen
     * Ablehnen-Knopf; das allein wäre aber keine Regel, sondern eine
     * fehlende Schaltfläche. Der Server nimmt von Mitgliedskonten nur
     * `erteilt` an.
     */
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Finn');

    for (const status of ['abgelehnt', 'widerrufen']) {
      const antwort = await app.inject({
        method: 'PATCH',
        url: `/familie/${kindId}/einwilligung`,
        headers: { authorization: `Bearer ${eltern.zugang}` },
        payload: { status },
      });
      expect(antwort.statusCode).toBe(403);
    }
    await app.close();
  });

  it('lässt die Verwaltung ein Nein erfassen', async () => {
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const chef = await konto('chef@example.org', 'verwaltung');
    const kindId = await kind(eltern.id, 'Finn');

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { status: 'abgelehnt' },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ status: 'abgelehnt', vollstaendig: false });
    await app.close();
  });

  it('lässt niemanden über fremde Kinder entscheiden', async () => {
    // 404 und nicht 403: „gibt es nicht" und „gehört dir nicht" dürfen sich
    // für den Anfragenden nicht unterscheiden — dieselbe Regel wie bei
    // `PATCH /familie/:id`.
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const fremd = await konto('fremd@example.org');
    const kindId = await kind(eltern.id, 'Finn');

    const antwort = await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${fremd.zugang}` },
      payload: { status: 'erteilt' },
    });

    expect(antwort.statusCode).toBe(404);
    await app.close();
  });

  it('schreibt eine neue Zeile, statt die alte zu ändern', async () => {
    // Die Historie ist der Grund für die eigene Tabelle: Bei einem Widerruf
    // will man später nachsehen können, wer wann was gesagt hat.
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const chef = await konto('chef@example.org', 'verwaltung');
    const kindId = await kind(eltern.id, 'Finn');

    await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${chef.zugang}` },
      payload: { status: 'widerrufen' },
    });

    const { rows } = await pool.query('SELECT status FROM einwilligung_bild WHERE kind_id = $1', [
      kindId,
    ]);
    expect(rows).toHaveLength(2);
    await app.close();
  });

  it('verlangt bei einem 13-Jährigen die zweite Stimme', async () => {
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Ben', 2013);

    const ohne = await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt' },
    });
    expect(ohne.json()).toMatchObject({ status: 'erteilt', vollstaendig: false });

    const mit = await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt', jugendBestaetigt: true },
    });
    expect(mit.json()).toMatchObject({ status: 'erteilt', vollstaendig: true });
    await app.close();
  });
});

describe('GET /verwaltung/bildrechte', () => {
  it('zeigt der Verwaltung alle Kinder samt Stand', async () => {
    const app = bauen();
    const eltern = await konto('eltern@example.org');
    const chef = await konto('chef@example.org', 'verwaltung');
    await kind(eltern.id, 'Finn');

    const antwort = await app.inject({
      method: 'GET',
      url: '/verwaltung/bildrechte',
      headers: { authorization: `Bearer ${chef.zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toHaveLength(1);
    expect(antwort.json()[0]).toMatchObject({
      name: 'Finn',
      elternEmail: 'eltern@example.org',
      einwilligung: { status: 'offen' },
    });
    await app.close();
  });

  it('bleibt für alle anderen verschlossen', async () => {
    // Hier stehen die vollen Namen aller Kinder samt Elternadresse — auch
    // ein Guide hat hier nichts zu suchen.
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');

    const antwort = await app.inject({
      method: 'GET',
      url: '/verwaltung/bildrechte',
      headers: { authorization: `Bearer ${guide.zugang}` },
    });

    expect(antwort.statusCode).toBe(403);
    await app.close();
  });
});

describe('GET /einwilligungstext', () => {
  it('liefert den Text mit seiner Fassung', async () => {
    const app = bauen();
    const eltern = await konto('eltern@example.org');

    const antwort = await app.inject({
      method: 'GET',
      url: '/einwilligungstext',
      headers: { authorization: `Bearer ${eltern.zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json().version).toBe(TEXT_VERSION);
    expect(antwort.json().abschnitte).toHaveLength(4);
    await app.close();
  });

  it('verlangt eine Anmeldung', async () => {
    // Er nennt die Verantwortlichen des Vereins beim Namen.
    const app = bauen();
    expect((await app.inject({ method: 'GET', url: '/einwilligungstext' })).statusCode).toBe(401);
    await app.close();
  });
});

describe('„keine Fotos" in der Teilnehmerliste (Sicht 15c)', () => {
  async function veroeffentlichtesTraining(app: ReturnType<typeof baueApp>, guide: string) {
    const training = (
      await app.inject({
        method: 'POST',
        url: '/jugendtraining',
        headers: { authorization: `Bearer ${guide}` },
        payload: { beginntAm: '2026-09-06T08:30:00Z', ort: 'Kalkofen' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/jugendtraining/${training.id}/veroeffentlichen`,
      headers: { authorization: `Bearer ${guide}` },
    });
    return training.id;
  }

  async function meldeAn(
    app: ReturnType<typeof baueApp>,
    trainingId: string,
    zugang: string,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/jugendtraining/${trainingId}/kinder`,
      headers: { authorization: `Bearer ${zugang}` },
      payload: { zeigtVorname: true, zeigtNachname: false, ...payload },
    });
  }

  async function kinderListe(app: ReturnType<typeof baueApp>, trainingId: string, zugang: string) {
    return (
      await app.inject({
        method: 'GET',
        url: `/jugendtraining/${trainingId}`,
        headers: { authorization: `Bearer ${zugang}` },
      })
    ).json().kinder as Array<{ anzeige: string; keineFotos: boolean }>;
  }

  it('markiert ein Kind ohne Einwilligung', async () => {
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Finn');
    const trainingId = await veroeffentlichtesTraining(app, guide.zugang);

    await meldeAn(app, trainingId, eltern.zugang, { vorname: 'Finn', nachname: 'Meyer', kindId });

    expect((await kinderListe(app, trainingId, guide.zugang))[0]).toMatchObject({
      keineFotos: true,
    });
    await app.close();
  });

  it('nimmt das Etikett weg, sobald die Einwilligung vorliegt', async () => {
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Finn');
    const trainingId = await veroeffentlichtesTraining(app, guide.zugang);

    await meldeAn(app, trainingId, eltern.zugang, { vorname: 'Finn', nachname: 'Meyer', kindId });
    await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt' },
    });

    expect((await kinderListe(app, trainingId, guide.zugang))[0]).toMatchObject({
      keineFotos: false,
    });
    await app.close();
  });

  it('markiert eine Anmeldung ohne Profil dauerhaft', async () => {
    /**
     * **Die Entscheidung vom 21.08.2026.** Wer ein Nachbarskind mitbringt,
     * tippt nur den Namen — dann gibt es keinen Weg zu einer Einwilligung,
     * und für dieses Kind hat auch wirklich niemand eingewilligt.
     *
     * Das gilt genauso für alle Anmeldungen, die vor dieser Änderung
     * entstanden sind: Sie tragen das Etikett, bis die Familie sich neu
     * anmeldet.
     */
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');
    const eltern = await konto('eltern@example.org');
    const trainingId = await veroeffentlichtesTraining(app, guide.zugang);

    await meldeAn(app, trainingId, eltern.zugang, { vorname: 'Nachbars', nachname: 'Kind' });

    expect((await kinderListe(app, trainingId, guide.zugang))[0]).toMatchObject({
      keineFotos: true,
    });
    await app.close();
  });

  it('nimmt keine fremde Profilkennung an', async () => {
    // Sonst hinge die Anmeldung an der Einwilligung eines Kindes, das
    // jemand anderem gehört — und ein Foto wäre durch ein Ja gedeckt, das
    // ein anderes Kind betrifft.
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');
    const eltern = await konto('eltern@example.org');
    const fremd = await konto('fremd@example.org');
    const fremdesKind = await kind(fremd.id, 'Mia');
    const trainingId = await veroeffentlichtesTraining(app, guide.zugang);

    await app.inject({
      method: 'PATCH',
      url: `/familie/${fremdesKind}/einwilligung`,
      headers: { authorization: `Bearer ${fremd.zugang}` },
      payload: { status: 'erteilt' },
    });
    await meldeAn(app, trainingId, eltern.zugang, {
      vorname: 'Finn',
      nachname: 'Meyer',
      kindId: fremdesKind,
    });

    expect((await kinderListe(app, trainingId, guide.zugang))[0]).toMatchObject({
      keineFotos: true,
    });
    await app.close();
  });

  it('markiert ein 13-Jähriges, solange die zweite Stimme fehlt', async () => {
    const app = bauen();
    const guide = await konto('guide@example.org', 'guide');
    const eltern = await konto('eltern@example.org');
    const kindId = await kind(eltern.id, 'Ben', 2013);
    const trainingId = await veroeffentlichtesTraining(app, guide.zugang);

    await meldeAn(app, trainingId, eltern.zugang, { vorname: 'Ben', nachname: 'Meyer', kindId });
    await app.inject({
      method: 'PATCH',
      url: `/familie/${kindId}/einwilligung`,
      headers: { authorization: `Bearer ${eltern.zugang}` },
      payload: { status: 'erteilt' },
    });

    expect((await kinderListe(app, trainingId, guide.zugang))[0]).toMatchObject({
      keineFotos: true,
    });
    await app.close();
  });
});
