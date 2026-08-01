/**
 * Vereinsinformationen für den Reiter "Verein".
 *
 * Anders als Termine und Beiträge stehen diese Angaben in keinem maschinen-
 * lesbaren Feed — sie stammen von den Seiten mtb-bielefeld.de/verein/,
 * /mitmachen/ und /angebote/ und sind hier abgeschrieben.
 *
 * ACHTUNG: Diese Datei muss von Hand gepflegt werden. Ändert der Verein etwa
 * die Beiträge, muss es hier nachgezogen werden. Deshalb bleibt bei jedem
 * Abschnitt ein Link auf die Website als verbindliche Quelle stehen. Stand:
 * August 2026.
 */

import { CONTACT, WEBSITE_BASE_URL } from '../config';

export interface ClubSection {
  title: string;
  paragraphs: string[];
  /** Die Seite auf mtb-bielefeld.de, die diesen Abschnitt verbindlich regelt. */
  sourceUrl: string;
  sourceLabel: string;
}

export const CLUB_INTRO =
  'Gegründet 2021 von Mountainbiker*innen für Mountainbiker*innen — als Fortsetzung ' +
  'der MTB-Initiative Bielefeld von 2012. Der Verein ist für alle da, die mit dem ' +
  'Mountainbike, mit oder ohne Motor, mit dem Gravelbike oder einem anderen Geländerad ' +
  'Spaß in der Natur erleben wollen.';

export const CLUB_SECTIONS: ClubSection[] = [
  {
    title: 'Worum es geht',
    paragraphs: [
      'Ziel ist ein öffentliches und attraktives Mountainbike-Streckennetz in Bielefeld — ' +
        'zusammen mit Sportangeboten und Naturraumerfahrung in ganz OWL, mit der Jugendarbeit ' +
        'fest eingebunden.',
      'Die Vereinsarbeit steht auf drei Säulen: Aktionen (der Dialog mit der Politik), ' +
        'Projekte (etwa Monte Scherbelino und Iron Trail) und Angebote (Jugendarbeit, ' +
        'Fahrtechnikkurse, Naturschutz).',
      'Kennzeichnend sind eine ausgeprägte Dialogkultur, Naturschutz und die Zusammenarbeit ' +
        'mit vielen Partnern in der Region.',
    ],
    sourceUrl: `${WEBSITE_BASE_URL}/verein/`,
    sourceLabel: 'Über den Verein',
  },
  {
    title: 'Regelmäßige Angebote',
    paragraphs: [
      'MittwochsRudel — jeden Mittwoch um 18:00 Uhr am Johannisberg, im Herbst um 17:00 Uhr. ' +
        'Offene Runde ohne Guide und ohne geplante Route.',
      'Bike & Beer und Ausflüge — am letzten Samstag im Monat um 11:00 Uhr. Im Sommer geht es ' +
        'in Bike- und Trailparks, sonst auf eine entspannte gemeinsame Runde mit Ausklang bei ' +
        'Liquid Life.',
      'Schraubertreff — montags von 17:00 bis 20:00 Uhr bei Liquid Life, im Herbst und Winter, ' +
        'für Mitglieder.',
      'Dazu kommen Fahrtechniktrainings vom Grundkurs bis zum Sprungtraining, Touren für jede ' +
        'Erfahrungsstufe und Ausflüge für Fortgeschrittene und Könner.',
    ],
    sourceUrl: `${WEBSITE_BASE_URL}/angebote/`,
    sourceLabel: 'Alle Angebote',
  },
  {
    title: 'Erst mal reinschnuppern',
    paragraphs: [
      'Schnupperfahrten sind kostenlos und ausdrücklich für Nicht-Mitglieder gedacht. Eine ' +
        'kurze Nachricht genügt, dann findet sich eine passende Ausfahrt.',
      'Wer unsicher ist, welche Tour zum eigenen Können passt: In dieser App lässt sich die ' +
        'Terminliste nach Fahrtechnik und Ausdauer filtern.',
    ],
    sourceUrl: `mailto:${CONTACT.offersEmail}`,
    sourceLabel: `Schnupperfahrt anfragen (${CONTACT.offersEmail})`,
  },
];

/**
 * Jahresbeiträge, Stand 28.03.2025.
 *
 * Bewusst mit Stichtag angegeben: Beiträge ändern sich, und eine App, die
 * stillschweigend veraltete Zahlen zeigt, ist schlimmer als eine, die keine
 * zeigt. Der Link darunter führt zur verbindlichen Fassung.
 */
export const MEMBERSHIP_FEES = {
  effectiveFrom: '28.03.2025',
  entries: [
    { label: 'Erwachsene ab 25 Jahren', amount: '65 €' },
    { label: 'Junge Erwachsene (18–25 Jahre)', amount: '58 €' },
    { label: 'Kinder und Jugendliche (9–18 Jahre)', amount: '50 €' },
    { label: 'Ermäßigt (bei Sozialleistungsbezug)', amount: '50 €' },
    { label: 'Familien (1–2 Erwachsene + Kinder unter 25)', amount: '100 €' },
    { label: 'Fördermitgliedschaft', amount: 'auf Anfrage' },
  ],
  benefits: [
    'Ausfahrten und Ausflüge für Anfänger und Fortgeschrittene',
    'Jugendarbeit und Jugendtrainings',
    'Fahrtechniktrainings und Schraubertreff',
    'Vergünstigungen bei Partnern und Vereinskleidung',
    'Tretradversicherung: Unfall, Haftpflicht und Rechtsschutz',
  ],
  signupUrl: `${WEBSITE_BASE_URL}/mitmachen/anmelden`,
  overviewUrl: `${WEBSITE_BASE_URL}/mitmachen/`,
};

export const ORGA_TEAM_NOTE =
  'Wer mehr mitgestalten will: Das Orga-Team trifft sich jeden zweiten Dienstag ab 18:30 Uhr, ' +
  'abwechselnd vor Ort und online.';
