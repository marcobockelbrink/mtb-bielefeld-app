import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import {
  erzeugeEinladung,
  pruefeEinladung,
  verbraucheEinladung,
} from '../src/einladung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import { erneuereSitzung, legeSitzungAn } from '../src/sitzung.ts';
import { hashe } from '../src/token.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

const jetzt = new Date('2026-08-02T12:00:00Z');

async function angemeldetesMitglied() {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO mitglied (email) VALUES ('malte@example.org') RETURNING id",
  );
  const id = rows[0]!.id;
  const token = await legeSitzungAn(pool, id, jetzt);
  return { id, ...token };
}

beforeEach(async () => {
  await frischeDatenbank();
});

afterAll(async () => {
  await pool.end();
});

describe('GET /konto', () => {
  it('sagt, was gespeichert ist', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(200);
    expect(antwort.json()).toMatchObject({ email: 'malte@example.org', rolle: 'mitglied' });
    await app.close();
  });

  it('lehnt ohne Token mit 401 ab', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const antwort = await app.inject({ method: 'GET', url: '/konto' });

    expect(antwort.statusCode).toBe(401);
    await app.close();
  });

  it('zählt nur noch gültige Sitzungen, keine ersetzten oder abgelaufenen', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { id, zugang } = await angemeldetesMitglied();

    // Ein zweites Gerät: noch gültig, zählt mit.
    await legeSitzungAn(pool, id, jetzt);

    // Ein drittes Gerät, dessen Sitzung erneuert (also ersetzt) wurde. Nur
    // die Nachfolgerin zählt, nicht die ersetzte Ursprungszeile.
    const dritte = await legeSitzungAn(pool, id, jetzt);
    await erneuereSitzung(pool, dritte.erneuerung, jetzt);

    // Ein viertes Gerät, dessen Erneuerungsfrist inzwischen abgelaufen ist.
    const vierte = await legeSitzungAn(pool, id, jetzt);
    await pool.query('UPDATE sitzung SET erneuerung_bis = $2 WHERE zugang_hash = $1', [
      hashe(vierte.zugang),
      new Date(jetzt.getTime() - 1000),
    ]);

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    // Gültig: die erste Anmeldung, das zweite Gerät, die Nachfolgerin der
    // Erneuerung des dritten Geräts. Nicht gültig: die ersetzte
    // Ursprungszeile des dritten Geräts, die abgelaufene des vierten.
    expect(antwort.json().sitzungen).toBe(3);
    await app.close();
  });

  it('nennt die aktiven Anmeldungen in der Auskunft', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { id, zugang } = await angemeldetesMitglied();
    await pool.query(
      `INSERT INTO tourenanmeldung (terminschluessel, termin_start, mitglied_id, angelegt_am)
       VALUES ('tour~1', $2, $1, $3), ('tour~2', $2, $1, $3)`,
      [id, new Date('2026-08-20T16:00:00Z'), jetzt],
    );
    await pool.query(
      `UPDATE tourenanmeldung SET storniert_am = $1 WHERE terminschluessel = 'tour~2'`,
      [jetzt],
    );

    const antwort = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.json().anmeldungen).toBe(1);
    await app.close();
  });
});

describe('DELETE /konto', () => {
  it('löscht Mitglied und Sitzungen', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    const antwort = await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    expect(antwort.statusCode).toBe(204);

    const { rows: mitglieder } = await pool.query('SELECT id FROM mitglied');
    expect(mitglieder).toHaveLength(0);

    const { rows: sitzungen } = await pool.query('SELECT id FROM sitzung');
    expect(sitzungen).toHaveLength(0);
    await app.close();
  });

  it('lässt zu der Adresse nichts mehr auffindbar zurück', async () => {
    const mailer = new GemerkterMailer();
    const app = baueApp({ pool, mailer, jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org', einladungscode: code },
    });
    // Ohne dieses Warten wäre offen, ob die magic_link-Zeile beim Löschen
    // überhaupt schon existierte — der Test würde dann grün, weil es nichts
    // aufzuräumen gab, nicht weil das Aufräumen funktioniert.
    await app.warteAufHintergrundarbeit();
    // Dieselbe Person, bevor sie Mitglied wurde: einmal als Gast mitgefahren.
    await pool.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ('tour~1', $1, 'Malte', 'Malte@Example.org', 'hash-1', $2)`,
      [new Date('2026-08-20T16:00:00Z'), jetzt],
    );
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    // Die Adresse steht in vier Tabellen. ON DELETE CASCADE erwischt nur
    // die Sitzungen (und die Anmeldungen an der Mitglieds-ID) — die
    // übrigen müssen von Hand aufgeräumt werden.
    const { rows: treffer } = await pool.query<{ tabelle: string }>(
      `SELECT 'mitglied' AS tabelle FROM mitglied
        WHERE lower(email) = lower($1)
       UNION ALL
       SELECT 'magic_link' FROM magic_link WHERE lower(email) = lower($1)
       UNION ALL
       SELECT 'einladung' FROM einladung
        WHERE lower(ausgestellt_fuer) = lower($1)
       UNION ALL
       SELECT 'tourenanmeldung' FROM tourenanmeldung
        WHERE lower(gast_email) = lower($1)`,
      ['malte@example.org'],
    );
    expect(treffer).toEqual([]);
    await app.close();
  });

  it('nimmt die Gastzeilen derselben Adresse mit', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    // Erst als Gast mitgefahren, später Mitglied geworden: Die Gastzeile
    // hängt an keiner Mitglieds-ID, ON DELETE CASCADE erwischt sie nicht.
    await pool.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ('tour~1', $1, 'Malte', 'malte@example.org', 'hash-1', $2)`,
      [new Date('2026-08-20T16:00:00Z'), jetzt],
    );
    // Eine fremde Gastzeile am selben Termin bleibt unangetastet.
    await pool.query(
      `INSERT INTO tourenanmeldung
         (terminschluessel, termin_start, gast_name, gast_email, storno_hash, angelegt_am)
       VALUES ('tour~1', $1, 'Traute', 'traute@example.org', 'hash-2', $2)`,
      [new Date('2026-08-20T16:00:00Z'), jetzt],
    );
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const { rows } = await pool.query<{ gast_email: string }>(
      'SELECT gast_email FROM tourenanmeldung',
    );
    expect(rows).toEqual([{ gast_email: 'traute@example.org' }]);
    await app.close();
  });

  it('behält die Einladungszeile, ohne die Adresse zu behalten', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const code = await erzeugeEinladung(pool, 'malte@example.org', jetzt);
    const { id, zugang } = await angemeldetesMitglied();
    const verbindung = await pool.connect();
    try {
      const pruefung = await pruefeEinladung(pool, code, 'malte@example.org', jetzt);
      if (!pruefung.ok) throw new Error('Vorbedingung nicht erfüllt');
      await verbraucheEinladung(verbindung, pruefung.einladungId, id, jetzt);
    } finally {
      verbindung.release();
    }

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    // Der Verein soll sehen, dass ein Code ausgestellt und eingelöst wurde
    // — die Person dahinter geht ihn nichts mehr an.
    const { rows } = await pool.query<{
      ausgestellt_fuer: string | null;
      eingeloest_am: Date | null;
      eingeloest_von: string | null;
    }>('SELECT ausgestellt_fuer, eingeloest_am, eingeloest_von FROM einladung');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ausgestellt_fuer).toBeNull();
    expect(rows[0]?.eingeloest_am).not.toBeNull();
    expect(rows[0]?.eingeloest_von).toBeNull();
    await app.close();
  });

  it('macht den Zugang sofort ungültig', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { zugang } = await angemeldetesMitglied();

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const danach = await app.inject({
      method: 'GET',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });
    expect(danach.statusCode).toBe(401);
    await app.close();
  });

  it('nimmt die Anmeldungen bei der Kontolöschung mit', async () => {
    const app = baueApp({ pool, mailer: new GemerkterMailer(), jetzt: () => jetzt });
    const { id, zugang } = await angemeldetesMitglied();
    await pool.query(
      `INSERT INTO tourenanmeldung (terminschluessel, termin_start, mitglied_id, angelegt_am)
       VALUES ('tour~1', $2, $1, $3)`,
      [id, new Date('2026-08-20T16:00:00Z'), jetzt],
    );

    await app.inject({
      method: 'DELETE',
      url: '/konto',
      headers: { authorization: `Bearer ${zugang}` },
    });

    const { rows } = await pool.query('SELECT id FROM tourenanmeldung');
    expect(rows).toHaveLength(0);
    await app.close();
  });
});
