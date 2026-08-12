import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { istZustand, ZUSTAENDE, type Zustand } from '../src/domain/apiVertrag';

const WURZEL = path.join(__dirname, '..');

/**
 * Alle TypeScript-Dateien der App und des Servers, ohne die Vertragsdatei
 * selbst.
 */
function quelldateien(): string[] {
  const gefunden: string[] = [];

  const durchsuche = (ordner: string): void => {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) {
        if (['node_modules', '.git', '.expo', 'dist'].includes(eintrag.name)) continue;
        durchsuche(voll);
      } else if (/\.tsx?$/.test(eintrag.name)) {
        gefunden.push(voll);
      }
    }
  };

  durchsuche(path.join(WURZEL, 'src'));
  durchsuche(path.join(WURZEL, 'api/src'));
  return gefunden.filter((datei) => !datei.endsWith(path.join('domain', 'apiVertrag.ts')));
}

describe('Vertrag zwischen App und Server', () => {
  it('kennt die drei Zustände eines Trainings', () => {
    expect(ZUSTAENDE).toEqual(['entwurf', 'veroeffentlicht', 'abgesagt']);
  });

  it('erkennt gültige und ungültige Zustände', () => {
    expect(istZustand('veroeffentlicht')).toBe(true);
    expect(istZustand('geloescht')).toBe(false);
    expect(istZustand(undefined)).toBe(false);
    expect(istZustand(3)).toBe(false);
  });

  /**
   * Der eigentliche Zweck dieser Datei.
   *
   * Die geteilten Formen sollen genau **einmal** im Projekt stehen. Eine zweite
   * Erklärung wäre für sich stimmig, ließe sich für sich prüfen und würde von
   * keinem Test bemerkt — bis zur Laufzeit, wo ein Feld stillschweigend
   * verschwindet. Deshalb schlägt hier Alarm, wer sie erneut hinschreibt.
   *
   * Weitergereicht werden darf sie (`export type { … }`) — das ist keine
   * zweite Erklärung, sondern derselbe Typ unter bekanntem Namen.
   */
  it.each(['KindEingabe', 'TrainingEingabe'])(
    'erklärt %s nur an einer Stelle',
    (name) => {
      const doppelt = quelldateien().filter((datei) =>
        new RegExp(`^\\s*(export\\s+)?interface\\s+${name}\\b`, 'm').test(
          fs.readFileSync(datei, 'utf8'),
        ),
      );

      expect(
        doppelt.map((datei) => path.relative(WURZEL, datei)),
        `${name} gehört ausschließlich in src/domain/apiVertrag.ts`,
      ).toEqual([]);
    },
  );

  it('erklärt Zustand nur an einer Stelle', () => {
    const doppelt = quelldateien().filter((datei) =>
      /^\s*(export\s+)?type\s+Zustand\s*=/m.test(fs.readFileSync(datei, 'utf8')),
    );

    expect(
      doppelt.map((datei) => path.relative(WURZEL, datei)),
      'Zustand gehört ausschließlich in src/domain/apiVertrag.ts',
    ).toEqual([]);
  });

  /**
   * Die geteilten Dateien laufen auch unter Node — der Server lädt sie.
   * Ein Import aus React Native bräche ihn, und zwar erst beim Start.
   */
  it('hält die geteilten Dateien frei von React Native', () => {
    const geteilt = [
      'src/domain/apiVertrag.ts',
      'src/domain/types.ts',
      'src/domain/terminSchluessel.ts',
      'src/config.ts',
      'src/data/ical/parseCalendar.ts',
    ];

    for (const datei of geteilt) {
      const inhalt = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
      const importe = [...inhalt.matchAll(/^\s*import\s[\s\S]*?from\s+'([^']+)'/gm)].map((t) => t[1]);
      expect(importe.filter((quelle) => /^react-native|^expo/.test(quelle)), datei).toEqual([]);
    }
  });

  it('behält die Zustände als Typ verwendbar', () => {
    const zustand: Zustand = 'entwurf';
    expect(ZUSTAENDE).toContain(zustand);
  });
});
