/**
 * Der Einwilligungstext, versioniert (Handoff 15, Abschnitt 15d).
 *
 * **Am Server und nicht in der App.** Eine Textänderung soll alle
 * Antworten auf „offen" zurücksetzen und neu fragen — das geht nur, wenn
 * beide Seiten dieselbe Fassung kennen. Läge der Text im Bündel, hinge die
 * Frage an der installierten App-Fassung, und wer nicht aktualisiert,
 * stimmte für immer dem alten Text zu, ohne dass es jemand sähe.
 *
 * ## Wortlaut
 *
 * Die Abschnitte stammen aus der Vorlage des Vereins vom 22.08.2026 und
 * sind **nicht umformuliert**. Der Text ist rechtlich bindend: Klingt er
 * in der App anders als das, wozu die Familien ihr Ja geben, ist die
 * Einwilligung angreifbar. Kürzungen, Glättungen und „für die App
 * angepasste" Fassungen gehören hier nicht hin — wer etwas ändern will,
 * ändert die Vorlage und hebt `TEXT_VERSION` an.
 *
 * Die Kurzfassung darüber (`zusammenfassung`) ist **kein Ersatz**, sondern
 * die Einstiegszeile über dem Link auf den Volltext. Sie steht bewusst
 * getrennt, damit niemand sie für den Wortlaut hält.
 */

import { TEXT_VERSION } from './einwilligung.ts';

export interface Einwilligungstext {
  version: string;
  zusammenfassung: string;
  /** Der bindende Satz am Häkchen — siehe `abschnitte`. */
  haekchen: string;
  abschnitte: { titel: string; absaetze: string[] }[];
}

export const EINWILLIGUNGSTEXT: Einwilligungstext = {
  version: TEXT_VERSION,

  zusammenfassung:
    'Der MTB Bielefeld e. V. möchte Fotos und Videos von Vereinsaktivitäten ' +
    'veröffentlichen — auf der Vereinswebsite, bei Instagram, in der Presse, in ' +
    'den WhatsApp-Gruppen des Vereins und in Werbematerialien. Deine Einwilligung ' +
    'ist freiwillig und kann jederzeit widerrufen werden.',

  // Der Satz bindet die anderen Erziehungsberechtigten ein — deshalb reicht
  // ein Elternkonto. Er steht hier und nicht in der Oberfläche: Was jemand
  // mit dem Häkchen erklärt, gehört zum Text und nicht zum Bildschirm.
  haekchen:
    'Ich willige im Namen aller Erziehungsberechtigten in die oben beschriebene ' +
    'Nutzung von Foto- und Videoaufnahmen ein.',

  abschnitte: [
    {
      titel: 'Zweck der Aufnahmen',
      absaetze: [
        'Der MTB Bielefeld e. V. verwendet Foto- und Videoaufnahmen ausschließlich im Rahmen des „berechtigten Interesses des Vereins“:',
        'Berichterstattung über Vereinsaktivitäten',
        'Dokumentation von Veranstaltungen, Trainings und Wettkämpfen',
        'Öffentlichkeitsarbeit und Außendarstellung u. ä.',
        'Die Aufnahmen werden ausschließlich für Vereinszwecke im Rahmen dieser Einwilligung genutzt und nicht zu kommerziellen Werbezwecken an Dritte weitergegeben.',
        'Die Aufnahmen dürfen veröffentlicht werden auf bzw. in:',
        'Vereinswebsite des MTB Bielefeld e. V.',
        'Instagram',
        'Presse / Online-Medien',
        'Interne WhatsApp-Gruppen des Vereins',
        'Vereinswerbematerialien (Flyer, Plakate, Präsentationen)',
      ],
    },
    {
      titel: 'Art der Aufnahmen',
      absaetze: [
        'Die Einwilligung umfasst:',
        'Gruppenaufnahmen',
        'Action- und Situationsfotos',
        'Einzelaufnahmen, auf denen das Kind eindeutig und deutlich erkennbar ist und/oder ggf. mit Namen zusätzlich identifiziert werden (u. U. mit gesonderter Einwilligung).',
      ],
    },
    {
      titel: 'Hinweise zur Einwilligung',
      absaetze: [
        'Die Einwilligung erfolgt freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden.',
        'Veröffentlichte Fotos auf der Vereinswebsite werden rückwirkend gelöscht.',
        'Bereits veröffentlichte oder weitergeteilte Inhalte (z. B. in Social Media oder Presse) werden in den Vereinskanälen gelöscht, können technisch aber nicht überall vollständig rückwirkend entfernt werden.',
        'Ein Widerruf kann sich auch nur auf einzelne Kinder beziehen.',
      ],
    },
    {
      titel: 'Datenschutz',
      absaetze: [
        'Die Aufnahmen werden ausschließlich für Vereinszwecke im Rahmen dieser Einwilligung genutzt und nicht zu kommerziellen Werbezwecken an Dritte weitergegeben.',
        'Verantwortliche: Andre Beckmann, Marco Bockelbrink',
        'Datenschutzbeauftragter im MTB Bielefeld e. V.: Stefan Bradt, datenschutz@mtb-bielefeld.de',
      ],
    },
  ],
};
