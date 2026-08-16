import { describe, expect, it } from 'vitest';

import { ApiFehler } from '../src/data/api';
import { beschreibeUploadFehler } from '../src/features/fotos/uploadFehler';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler';

// Der Anlass steht in `uploadFehler.ts`: Eine Woche lang meldete die App
// „Der Verein ist gerade nicht erreichbar", während der Fehler auf dem
// Gerät entstand und nie eine Anfrage gestellt wurde.

describe('beschreibeUploadFehler', () => {
  it('nennt beim Vorbereiten das Gerät und den technischen Grund', () => {
    // Der technische Text ist unschön und meist englisch — er ist aber die
    // einzige Spur, die jemand weitergeben kann.
    const satz = beschreibeUploadFehler(new Error('Cannot find native module'), 'vorbereiten');
    expect(satz).toContain('auf dem Gerät nicht vorbereiten');
    expect(satz).toContain('Cannot find native module');
  });

  it('behauptet beim Vorbereiten nichts über die Verbindung', () => {
    // Die Kernforderung dieses Moduls, als Test festgehalten.
    const satz = beschreibeUploadFehler(new Error('irgendwas'), 'vorbereiten');
    expect(satz).not.toContain('erreichbar');
    expect(satz).not.toContain('Verbindung');
  });

  it('unterscheidet Senden von Vorbereiten', () => {
    expect(beschreibeUploadFehler(new Error('x'), 'senden')).toContain('nicht senden');
    expect(beschreibeUploadFehler(new Error('x'), 'senden')).not.toContain('vorbereiten');
  });

  it('reicht Antworten der API unverändert durch', () => {
    // Was die API selbst formuliert hat, ist dort schon gut gesagt — und
    // ein „Das Bild ließ sich nicht senden: …" davor machte es schlechter.
    const fehler = new ApiFehler(413, 'Das Bild ist größer als 25 MB.', undefined, true);
    expect(beschreibeUploadFehler(fehler, 'senden')).toBe('Das Bild ist größer als 25 MB.');
  });

  it('reicht einen echten Verbindungsfehler durch', () => {
    // Wenn es *wirklich* das Netz war, soll auch das Netz dastehen.
    const fehler = new ApiFehler(0, 'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.');
    expect(beschreibeUploadFehler(fehler, 'senden')).toBe(
      'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
    );
  });

  it('kommt ohne Fehlermeldung aus, wenn das Gerät keine liefert', () => {
    const satz = beschreibeUploadFehler({ seltsam: true }, 'vorbereiten');
    expect(satz).toContain('meldet das Gerät leider nicht');
  });

  it('nimmt eine leere Fehlermeldung nicht als Text', () => {
    // `new Error('')` ergäbe sonst einen Satz, der mit einem Doppelpunkt
    // endet und nichts dahinter hat.
    expect(beschreibeUploadFehler(new Error('   '), 'senden')).toContain('meldet das Gerät leider nicht');
  });
});

describe('beschreibeJugendFehler — unbekannte Fehler', () => {
  it('behauptet bei einem Fehler ohne API-Bezug nicht mehr, der Verein sei nicht erreichbar', () => {
    // **Die teuerste Zeile der App.** Sie machte aus einem lösbaren
    // Problem ein unauffindbares: Der Upload scheiterte auf dem Gerät, und
    // gesucht wurde eine Woche lang im Netz.
    expect(beschreibeJugendFehler(new Error('irgendein Gerätefehler'))).toBe(
      'Da ist etwas schiefgegangen.',
    );
    expect(beschreibeJugendFehler('kein Fehlerobjekt')).toBe('Da ist etwas schiefgegangen.');
  });

  it('sagt bei einem 5xx der API weiterhin, dass der Verein nicht erreichbar ist', () => {
    // Dort stimmt der Satz — die Anfrage kam an und der Server konnte nicht.
    expect(beschreibeJugendFehler(new ApiFehler(500, 'canceling statement'))).toBe(
      'Der Verein ist gerade nicht erreichbar. Versuch es später noch einmal.',
    );
  });
});
