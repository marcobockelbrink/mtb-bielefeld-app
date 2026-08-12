import { describe, expect, it } from 'vitest';

import {
  ausJson,
  entferne,
  fuegeHinzu,
  fuerAlbum,
  vermerkeFehlschlag,
  zuJson,
  type Auftrag,
} from '../src/features/fotos/warteschlange';

function auftrag(id: string, albumId = 'album-1'): Auftrag {
  return { id, albumId, uri: `file:///kopien/${id}.jpg`, versuche: 0 };
}

describe('die Warteschlange', () => {
  it('hängt an, entfernt, filtert nach Album — ohne die Eingabe anzufassen', () => {
    const eins = fuegeHinzu([], [auftrag('a'), auftrag('b', 'album-2')]);
    const zwei = entferne(eins, 'a');

    expect(eins).toHaveLength(2); // unverändert — sonst ist der React-State schon mutiert
    expect(zwei.map((x) => x.id)).toEqual(['b']);
    expect(fuerAlbum(eins, 'album-2').map((x) => x.id)).toEqual(['b']);
  });

  it('zählt Fehlschläge, statt Aufträge aufzugeben', () => {
    // Kein Netz im Wald ist der Normalfall, kein Grund zum Verwerfen — die
    // Zahl ist Anzeige, keine Abbruchbedingung.
    const schlange = vermerkeFehlschlag(fuegeHinzu([], [auftrag('a')]), 'a');
    expect(schlange[0]?.versuche).toBe(1);
  });

  it('übersteht die Reise durch den Speicher', () => {
    const vorher = fuegeHinzu([], [auftrag('a'), auftrag('b')]);
    expect(ausJson(zuJson(vorher))).toEqual(vorher);
  });

  it('verwirft Kaputtes aus dem Speicher, statt daran zu ersticken', () => {
    // Ein halber Auftrag würde beim Abarbeiten werfen und die ganze
    // Schlange blockieren; ihn zu verlieren ist das kleinere Übel.
    expect(ausJson(null)).toEqual([]);
    expect(ausJson('kein json {')).toEqual([]);
    expect(ausJson('{"kein":"array"}')).toEqual([]);
    expect(
      ausJson('[{"id":"a","albumId":"x","uri":"file:///a.jpg","versuche":0},{"id":"halb"}]'),
    ).toHaveLength(1);
  });
});
