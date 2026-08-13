/**
 * Den Anmelde-Token aus der angetippten Adresse ziehen.
 *
 * Der Link in der Mail sieht so aus:
 *
 *     https://app.mtb-bielefeld.de/anmeldung/<token>
 *
 * Auf dem Gerät kommt er je nach Weg als `https://…` (Universal Link) oder
 * als App-Schema an — und beim App-Schema tatsächlich mit **drei**
 * Schrägstrichen: `mtbie:///anmeldung/<token>` (`betrieb/.env.beispiel`,
 * `APP_BASIS_URL`). Der leere Teil zwischen zweitem und drittem Schrägstrich
 * ist Absicht: Er macht den ganzen Rest zum Pfad, damit expo-router
 * `app/anmeldung/[token].tsx` anspringt. Mit nur zwei Schrägstrichen stünde
 * `anmeldung` an der Stelle des Hosts. Beide Formen — zwei wie drei
 * Schrägstriche — führen hierher.
 *
 * Bewusst ohne `URL`-Klasse: React Native bringt sie in unterschiedlichen
 * Fassungen mit, und für „alles nach `/anmeldung/`" ist sie ohnehin zu viel
 * Werkzeug.
 */

const MUSTER = /\/anmeldung\/([A-Za-z0-9_-]+)/;

export function extrahiereMagicToken(url: string): string | null {
  const treffer = MUSTER.exec(url);
  return treffer?.[1] ?? null;
}

/**
 * Der Ein-Klick-Link aus der Einladungsmail: `https://<api>/e/<code>`.
 * Gleiche Zeichenmenge wie die Token — `erzeugeToken` liefert beide.
 */
const EINLADUNG = /\/e\/([A-Za-z0-9_-]+)/;

export function extrahiereEinladungsCode(url: string): string | null {
  const treffer = EINLADUNG.exec(url);
  return treffer?.[1] ?? null;
}
