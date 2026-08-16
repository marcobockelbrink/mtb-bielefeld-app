/**
 * Die Regeln des Familien-Formulars — ohne React Native, damit sie ohne
 * Gerät prüfbar bleiben.
 *
 * Aus dem Handoff „Runde 11" (Teil B): Das Formular zieht aus dem Blatt auf
 * eine eigene Seite um. Beim Umzug ist die Gefahr, dass eine Regel
 * unterwegs verlorengeht, die vorher nur als Ausdruck mitten im
 * Bildschirm stand — `kannAnlegen` etwa war eine Zeile in
 * `FamilienGruppe.tsx`. Hier steht sie an einem Stück und mit Tests.
 */

export type ProfilArt = 'kind' | 'erwachsen';

/**
 * Wann der Absende-Knopf wirken darf.
 *
 * Der Unterschied ist der ganze Punkt der beiden Seiten: Ein **Kind**
 * bekommt ein verwaltetes Profil, die Adresse ist optional — viele Kinder
 * haben kein eigenes Postfach. Ein **Erwachsener** bekommt ein
 * eigenständiges Konto, und dafür ist die Adresse der einzige Weg hinein.
 */
export function kannAnlegen(art: ProfilArt, name: string, email: string): boolean {
  if (name.trim() === '') return false;
  return art === 'kind' || email.trim() !== '';
}

/**
 * Wohin die Bestätigung geht — **bevor** abgeschickt wird.
 *
 * Bisher beantwortete das erst der Dialog danach. Bei einem Kind ohne
 * eigene Adresse ist die Antwort „an dich", und das ist genau die Frage,
 * die sich jemand stellt, der das Mailfeld leer lässt.
 */
export function bestaetigungGehtAn(email: string, eigeneAdresse: string | null): string {
  const eingetragen = email.trim();
  if (eingetragen !== '') return eingetragen;
  return eigeneAdresse ?? 'deine Adresse';
}

/**
 * Die Jahrgänge, die als Chips angeboten werden — jüngster zuerst.
 *
 * Sieben bis vierzehn Jahre alt: die Spanne, in der das Jugendtraining
 * stattfindet. Aus dem laufenden Jahr gerechnet und nicht fest
 * eingetragen, sonst wäre die Liste in zwei Jahren falsch und niemandem
 * fiele auf, warum.
 *
 * **Nicht als U-Gruppen beschriftet.** Der Handoff schlug „Mika fährt bei
 * den U14 mit" vor und verwies auf `altersTag()` — die Funktion liefert
 * aber das Alter, und U-Gruppen kommen im ganzen Projekt nicht vor. Eine
 * erfundene Einteilung stünde später im Widerspruch zu der, die der Verein
 * wirklich benutzt.
 */
export const JUENGSTES_ALTER = 7;
export const AELTESTES_ALTER = 14;

export function geburtsjahrVorschlaege(heute: Date): number[] {
  const jahr = heute.getFullYear();
  const jahrgaenge: number[] = [];
  for (let alter = JUENGSTES_ALTER; alter <= AELTESTES_ALTER; alter += 1) {
    jahrgaenge.push(jahr - alter);
  }
  return jahrgaenge;
}

/**
 * Was aus der Wahl folgt, in einem Satz unter der Auswahl.
 *
 * Ohne Namen wird es allgemein — wer das Jahr vor dem Namen antippt, soll
 * keinen Satz mit einer Lücke lesen.
 */
export function altersHinweis(name: string, geburtsjahr: number | null, heute: Date): string | null {
  if (geburtsjahr === null) return null;

  const alter = heute.getFullYear() - geburtsjahr;
  const wer = name.trim() === '' ? 'Das Kind' : name.trim();
  return `${wer} ist dieses Jahr ${alter} Jahre alt.`;
}

/**
 * Ob ein von Hand getipptes Jahr überhaupt eines sein kann.
 *
 * Großzügig nach oben und unten: Die Grenze soll Vertipper abfangen
 * (`202` statt `2020`), nicht darüber urteilen, wer mitfahren darf. Das
 * entscheidet der Verein, nicht ein Formular.
 */
export function istPlausiblesJahr(text: string, heute: Date): boolean {
  const jahr = Number.parseInt(text, 10);
  if (!Number.isFinite(jahr) || String(jahr) !== text.trim()) return false;
  return jahr >= heute.getFullYear() - 100 && jahr <= heute.getFullYear();
}
