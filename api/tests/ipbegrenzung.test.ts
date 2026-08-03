import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { baueApp } from '../src/app.ts';
import { pool } from '../src/datenbank.ts';
import { IpBegrenzung } from '../src/ipbegrenzung.ts';
import { GemerkterMailer } from '../src/mailer.ts';
import type { Protokoll } from '../src/protokoll.ts';
import { erzeugeTerminDienst, terminSchluessel, type TerminDienst } from '../src/termine.ts';
import { frischeDatenbank } from './hilfen/datenbank.ts';

/**
 * Reine Rechenlogik, ohne Fastify, ohne Datenbank, ohne laufenden Server —
 * genau das fordert die Aufgabe für diese Klasse.
 */
describe('IpBegrenzung', () => {
  it('lässt Anfragen unter der Grenze durch', () => {
    const begrenzung = new IpBegrenzung(3, 60_000);

    expect(begrenzung.erlaubt('1.2.3.4', 0)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 1)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 2)).toBe(true);
  });

  it('lehnt ab, sobald die Grenze innerhalb des Fensters erreicht ist', () => {
    const begrenzung = new IpBegrenzung(3, 60_000);

    expect(begrenzung.erlaubt('1.2.3.4', 0)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 1)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 2)).toBe(true);

    expect(begrenzung.erlaubt('1.2.3.4', 3)).toBe(false);
  });

  it('lässt nach Ablauf des Fensters wieder durch', () => {
    const begrenzung = new IpBegrenzung(2, 60_000);

    expect(begrenzung.erlaubt('1.2.3.4', 0)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 10)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 20)).toBe(false);

    // Eine Minute nach der ersten Anfrage sind beide aus dem gleitenden
    // Fenster gefallen — wieder Platz.
    expect(begrenzung.erlaubt('1.2.3.4', 60_001)).toBe(true);
  });

  it('zählt das Fenster gleitend, nicht in festen Blöcken', () => {
    const begrenzung = new IpBegrenzung(2, 60_000);

    expect(begrenzung.erlaubt('1.2.3.4', 0)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 59_000)).toBe(true);

    // 59_001ms nach der ersten liegt die erste noch knapp im Fenster (Fenster
    // schließt bei 60_000): weiterhin abgelehnt.
    expect(begrenzung.erlaubt('1.2.3.4', 59_500)).toBe(false);

    // Erst wenn auch die erste außerhalb des Fensters liegt, ist wieder Platz.
    expect(begrenzung.erlaubt('1.2.3.4', 60_001)).toBe(true);
  });

  it('zählt verschiedene Schlüssel getrennt', () => {
    const begrenzung = new IpBegrenzung(1, 60_000);

    expect(begrenzung.erlaubt('1.2.3.4', 0)).toBe(true);
    expect(begrenzung.erlaubt('1.2.3.4', 1)).toBe(false);

    // Ein anderer Schlüssel hat sein eigenes Kontingent.
    expect(begrenzung.erlaubt('5.6.7.8', 1)).toBe(true);
  });

  it('wächst nicht unbegrenzt: raeumeAuf entfernt Schlüssel mit abgelaufenem Fenster', () => {
    const begrenzung = new IpBegrenzung(5, 60_000);

    for (let i = 0; i < 50; i++) {
      begrenzung.erlaubt(`ip-${i}`, 0);
    }
    expect(begrenzung.anzahlSchluessel).toBe(50);

    // Weit jenseits des Fensters: alle 50 Schlüssel sind jetzt leer.
    begrenzung.raeumeAuf(1_000_000);
    expect(begrenzung.anzahlSchluessel).toBe(0);
  });

  it('räumt beim Aufräumen nur ab, was wirklich abgelaufen ist', () => {
    const begrenzung = new IpBegrenzung(5, 60_000);

    begrenzung.erlaubt('alt', 0);
    begrenzung.erlaubt('frisch', 100_000);

    // Zum Zeitpunkt 100_000 ist "alt" (Fenster endete bei 60_000) abgelaufen,
    // "frisch" nicht.
    begrenzung.raeumeAuf(100_000);

    expect(begrenzung.anzahlSchluessel).toBe(1);
    // "frisch" zählt weiter mit, statt wieder bei null anzufangen: Der erste
    // Zugriff bei 100_000 zählt schon, vier weitere füllen das Kontingent
    // von fünf auf, der sechste fällt darüber.
    expect(begrenzung.erlaubt('frisch', 100_001)).toBe(true);
    expect(begrenzung.erlaubt('frisch', 100_002)).toBe(true);
    expect(begrenzung.erlaubt('frisch', 100_003)).toBe(true);
    expect(begrenzung.erlaubt('frisch', 100_004)).toBe(true);
    expect(begrenzung.erlaubt('frisch', 100_005)).toBe(false);
  });

  it('räumt einen einzelnen Schlüssel schon beim eigenen Zugriff auf, ohne raeumeAuf', () => {
    const begrenzung = new IpBegrenzung(1, 60_000);

    begrenzung.erlaubt('1.2.3.4', 0);
    // Weit später: das alte Zeitfenster für diesen Schlüssel ist vorbei, der
    // erneute Zugriff räumt es beim Prüfen selbst weg und lässt wieder durch.
    expect(begrenzung.erlaubt('1.2.3.4', 1_000_000)).toBe(true);
  });
});

/**
 * Endpunkt-Tests: Die Begrenzung hängt am Weg (`/anmeldung/*`, `/sitzung/*`,
 * `/konto`), nicht an der Anfrage selbst — siehe der Kommentar in `app.ts`
 * zur Abgrenzung von der 202-Regel der Begrenzung je Adresse.
 */
describe('IP-Begrenzung im Endpunkt', () => {
  const jetzt = new Date('2026-08-03T12:00:00Z');
  const stillesProtokoll: Protokoll = { error: () => {} };

  /** Ein einzelner offener Termin — genug für die Belegungsabfrage. */
  const KALENDER = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:offen@test',
    'DTSTART;TZID=Europe/Berlin:20260813T180000',
    'DTEND;TZID=Europe/Berlin:20260813T200000',
    'SUMMARY:Oerli Runde',
    'DESCRIPTION:Plätze: 2\\nGäste: ja',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  function dienst(): TerminDienst {
    return erzeugeTerminDienst({
      ladeKalender: async () => KALENDER,
      protokoll: stillesProtokoll,
      jetzt: () => jetzt,
    });
  }

  async function offenerSchluessel(): Promise<string> {
    const termine = await dienst().holeTermine();
    return terminSchluessel(termine[0]!);
  }

  beforeEach(async () => {
    await frischeDatenbank();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('lässt Anfragen unter der Grenze normal durch', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(3, 60_000),
    });

    for (let i = 0; i < 3; i++) {
      const antwort = await app.inject({
        method: 'POST',
        url: '/anmeldung/anfordern',
        payload: { email: 'malte@example.org' },
        remoteAddress: '9.9.9.9',
      });
      expect(antwort.statusCode).toBe(202);
    }

    await app.close();
  });

  it('antwortet über der Grenze mit 429 und dem neutralen Text', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(2, 60_000),
    });

    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });

    const antwort = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });

    expect(antwort.statusCode).toBe(429);
    expect(antwort.json()).toEqual({
      fehler: 'Zu viele Anfragen. Versuch es gleich noch einmal.',
    });

    await app.close();
  });

  it('greift unabhängig davon, ob die Adresse im Anfragekörper zum Verein gehört', async () => {
    // Derselbe 429 für eine bekannte wie für eine erfundene Adresse: Die
    // Begrenzung sieht den Körper der Anfrage gar nicht.
    await pool.query("INSERT INTO mitglied (email) VALUES ('malte@example.org')");
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
    });

    const erste = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(erste.statusCode).toBe(202);

    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'unbekannt@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(zweite.statusCode).toBe(429);

    await app.close();
  });

  it('zählt verschiedene IPs getrennt', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
    });

    const erste = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(erste.statusCode).toBe(202);

    const zweiteIp = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '8.8.8.8',
    });
    expect(zweiteIp.statusCode).toBe(202);

    await app.close();
  });

  it('lässt nach Ablauf des Fensters wieder durch', async () => {
    let momentan = jetzt;
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => momentan,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
    });

    const erste = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(erste.statusCode).toBe(202);

    momentan = new Date(jetzt.getTime() + 30_000);
    const zweite = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(zweite.statusCode).toBe(429);

    momentan = new Date(jetzt.getTime() + 60_001);
    const dritte = await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });
    expect(dritte.statusCode).toBe(202);

    await app.close();
  });

  it('betrifft ungeschützte Pfade wie /gesundheit nicht', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
    });

    // Die Grenze steht auf eins — für /anmeldung/anfordern ausgeschöpft,
    // /gesundheit bleibt trotzdem frei erreichbar.
    await app.inject({
      method: 'POST',
      url: '/anmeldung/anfordern',
      payload: { email: 'malte@example.org' },
      remoteAddress: '9.9.9.9',
    });

    const antwort = await app.inject({
      method: 'GET',
      url: '/gesundheit',
      remoteAddress: '9.9.9.9',
    });

    expect(antwort.statusCode).toBe(200);

    await app.close();
  });

  it('zählt die Belegungsabfrage nicht mit — 25 GETs bleiben erlaubt', async () => {
    // Eine App, die eine Terminliste öffnet, feuert je Termin ein GET. Mit
    // der Voreinstellung von zwanzig je Minute wäre der Normalbetrieb schon
    // der Angriffsfall.
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      terminDienst: dienst(),
    });
    const s = await offenerSchluessel();

    for (let i = 0; i < 25; i++) {
      const antwort = await app.inject({
        method: 'GET',
        url: `/termine/${s}`,
        remoteAddress: '9.9.9.9',
      });
      expect(antwort.statusCode).toBe(200);
    }

    await app.close();
  });

  it('zählt POST auf denselben Termin weiterhin — der 21. wird 429', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      terminDienst: dienst(),
    });
    const s = await offenerSchluessel();

    // Die zwanzig erlaubten Versuche: Ohne Token und ohne gültigen Körper
    // enden sie in 400 — gezählt werden sie trotzdem, die Prüfung läuft in
    // `onRequest`, lange vor dem Endpunkt.
    for (let i = 0; i < 20; i++) {
      const antwort = await app.inject({
        method: 'POST',
        url: `/termine/${s}`,
        payload: {},
        remoteAddress: '9.9.9.9',
      });
      expect(antwort.statusCode).not.toBe(429);
    }

    const einundzwanzigster = await app.inject({
      method: 'POST',
      url: `/termine/${s}`,
      payload: {},
      remoteAddress: '9.9.9.9',
    });

    expect(einundzwanzigster.statusCode).toBe(429);
    await app.close();
  });

  it('zählt DELETE unter /termine/ weiterhin mit', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
      terminDienst: dienst(),
    });
    const s = await offenerSchluessel();

    await app.inject({ method: 'DELETE', url: `/termine/${s}/ich`, remoteAddress: '9.9.9.9' });
    const zweite = await app.inject({
      method: 'DELETE',
      url: `/termine/${s}/ich`,
      remoteAddress: '9.9.9.9',
    });

    expect(zweite.statusCode).toBe(429);
    await app.close();
  });

  it('greift auch am exakten Pfad DELETE /sitzung, nicht nur an /sitzung/*', async () => {
    const app = baueApp({
      pool,
      mailer: new GemerkterMailer(),
      jetzt: () => jetzt,
      ipBegrenzung: new IpBegrenzung(1, 60_000),
    });

    await app.inject({
      method: 'DELETE',
      url: '/sitzung',
      payload: {},
      remoteAddress: '9.9.9.9',
    });

    const antwort = await app.inject({
      method: 'DELETE',
      url: '/sitzung',
      payload: {},
      remoteAddress: '9.9.9.9',
    });

    expect(antwort.statusCode).toBe(429);

    await app.close();
  });
});
