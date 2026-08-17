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

// --- Der Fall aus den Screenshots vom 17.08.2026 ------------------------
//
// Die Kachel zeigte „KEIN NETZ", während das Telefon an 5G hing. `ohneNetz`
// heißt eben nur: `fetch` hat geworfen.

describe('beschreibeUploadFehler mit bekanntem Netzzustand', () => {
  function netzfehler(ursprung: string | null) {
    return new ApiFehler(
      0,
      'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
      undefined,
      false,
      true,
      ursprung,
    );
  }

  it('nennt den Originaltext, wenn das Gerät nachweislich Netz hat', () => {
    // Sonst steht wieder eine Behauptung da, die messbar falsch ist.
    const satz = beschreibeUploadFehler(netzfehler('TypeError: Network request failed'), 'senden', true);
    expect(satz).toContain('Network request failed');
    expect(satz).toContain('nicht senden');
  });

  it('bleibt beim Verbindungshinweis, wenn das Gerät wirklich offline ist', () => {
    // Im Funkloch ist der deutsche Satz der bessere — dort stimmt er.
    expect(beschreibeUploadFehler(netzfehler('TypeError: Network request failed'), 'senden', false)).toBe(
      'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
    );
  });

  it('behauptet nichts, solange der Netzzustand unbekannt ist', () => {
    expect(beschreibeUploadFehler(netzfehler('TypeError: Network request failed'), 'senden', null)).toBe(
      'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
    );
  });

  it('kommt ohne Originaltext zurecht', () => {
    // Ältere Fehler tragen kein `ursprung` — dann bleibt es beim alten Satz.
    expect(beschreibeUploadFehler(netzfehler(null), 'senden', true)).toBe(
      'Keine Verbindung zum Server. Bitte prüfe deine Verbindung.',
    );
  });

  it('lässt echte Antworten der API unberührt, auch bei Netz', () => {
    // 413 ist kein Netzfehler; `ohneNetz` ist dort falsch.
    const fehler = new ApiFehler(413, 'Das Bild ist größer als 25 MB.', undefined, true);
    expect(beschreibeUploadFehler(fehler, 'senden', true)).toBe('Das Bild ist größer als 25 MB.');
  });
});
