import { describe, expect, it } from 'vitest';

import { parseRideDetails, parseStars } from '../src/data/parse/description';
import { htmlToText } from '../src/data/parse/html';

describe('Sterne lesen', () => {
  it('liest einen festen Wert', () => {
    expect(parseStars('⭐⭐')).toEqual({ min: 2, max: 2 });
  });

  it('liest eine Spanne mit "bis"', () => {
    expect(parseStars('⭐ bis ⭐⭐⭐')).toEqual({ min: 1, max: 3 });
  });

  it('liest eine Spanne mit Schrägstrich', () => {
    expect(parseStars('⭐/⭐⭐ ca. 22 km, 450hm,  mittleres Tempo')).toEqual({ min: 1, max: 2 });
  });

  it('gibt nichts zurück, wenn keine Sterne dastehen', () => {
    expect(parseStars('variabel')).toBeUndefined();
    expect(parseStars('')).toBeUndefined();
    expect(parseStars(undefined)).toBeUndefined();
  });

  it('lässt sich von Spaßeinträgen nicht stören', () => {
    // Kommt im Kalender bei Bike&Beer tatsächlich so vor.
    expect(parseStars('🌭')).toBeUndefined();
  });
});

describe('Tourdaten aus der Beschreibung', () => {
  it('liest einen vollständigen Tourtext', () => {
    const html =
      '<b>Euer Guide:</b> <i>Malte</i><br><br><b>Tag:</b> 18.02.22<br>' +
      '<b>Uhrzeit &amp; Dauer:</b> 10Uhr, ca. 3 Std <br><b>Abfahrtsort:</b> Parkplatz Eisgrund <br>' +
      '<b>Ausdauer:</b> ⭐/⭐⭐ ca. 22 km, 450hm,  mittleres Tempo<br><b>Fahrtechnik:</b> ⭐<br>' +
      '<b>Trail-Anteil:</b> gering<br><b>Schwierigkeitsgrad:</b> flowig';

    expect(parseRideDetails(htmlToText(html))).toEqual({
      guides: ['Malte'],
      endurance: { min: 1, max: 2 },
      technique: { min: 1, max: 1 },
      trailShare: 'gering',
      difficulty: 'flowig',
      meetingPoint: 'Parkplatz Eisgrund',
      timeAndDuration: '10Uhr, ca. 3 Std',
      distanceKm: 22,
      elevationM: 450,
      maxParticipants: undefined,
      signupUrl: undefined,
    });
  });

  it('liest "Trail-Anteil" trotz Bindestrich', () => {
    // Ohne Bindestrich in der Zeichenklasse bliebe nur "Anteil" übrig und die
    // Angabe ginge verloren — betraf 393 von 393 Terminen.
    expect(parseRideDetails('Trail-Anteil: gering bis hoch').trailShare).toBe('gering bis hoch');
  });

  it('versteht mehrere Guides', () => {
    expect(parseRideDetails('Eure Guides: Johannes & Hendrik').guides).toEqual(['Johannes', 'Hendrik']);
    expect(parseRideDetails('Guides: Malte, Basti und Jan').guides).toEqual(['Malte', 'Basti', 'Jan']);
  });

  it('nimmt "Treffpunkt" als Abfahrtsort', () => {
    const text = 'Treffpunkt: Infopunkt am Johannisberg (Ausklang aufm\' Siggi)';
    expect(parseRideDetails(text).meetingPoint).toBe("Infopunkt am Johannisberg (Ausklang aufm' Siggi)");
  });

  it('liest die Anmelde-Adresse', () => {
    const text = 'Anmeldung unter: https://mtb-bielefeld.de/angebote/#termine';
    expect(parseRideDetails(text).signupUrl).toBe('https://mtb-bielefeld.de/angebote/#termine');
  });

  it('liest die Teilnehmerbegrenzung', () => {
    expect(parseRideDetails('Max. Teilnehmerzahl: 12').maxParticipants).toBe(12);
  });

  it('trennt zwei Angaben in derselben Zeile', () => {
    const details = parseRideDetails('Ausdauer: ⭐⭐ Fahrtechnik: ⭐⭐⭐');
    expect(details.endurance).toEqual({ min: 2, max: 2 });
    expect(details.technique).toEqual({ min: 3, max: 3 });
  });

  it('hält Fließtext für keine Angabe', () => {
    const details = parseRideDetails(
      'Wir treffen uns jeden Mittwoch. Die Route, das Profil und der Schwierigkeitsgrad ergeben sich spontan.',
    );
    expect(details.difficulty).toBeUndefined();
    expect(details.guides).toEqual([]);
  });

  it('liefert leere Angaben statt zu raten', () => {
    const details = parseRideDetails('Einfach mitkommen und Spaß haben.');
    expect(details).toEqual({
      guides: [],
      endurance: undefined,
      technique: undefined,
      trailShare: undefined,
      difficulty: undefined,
      meetingPoint: undefined,
      timeAndDuration: undefined,
      distanceKm: undefined,
      elevationM: undefined,
      maxParticipants: undefined,
      signupUrl: undefined,
    });
  });
});
