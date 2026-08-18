/**
 * Eine Datei nativ hochladen — die Geräteseite zu `ApiZugang.sendeDatei`.
 *
 * ## Warum nicht `fetch` mit `FormData`
 *
 * Weil es damit seit Expo SDK 54 **nicht mehr geht**, und der Weg dahin
 * hat eine Woche gekostet.
 *
 * Das jahrelang übliche React-Native-Idiom lautet
 * `formular.append('datei', { uri, name, type })`. Expo ersetzt aber das
 * globale `fetch` durch eine eigene Umsetzung, die den Multipart-Körper
 * **in JavaScript** zusammenbaut
 * (`expo/src/winter/fetch/convertFormData.ts`). Die kennt nur drei Arten
 * von Teilen — `string`, `Blob`, oder ein Objekt mit `bytes()` — und wirft
 * bei allem anderen:
 *
 *     Error: Unsupported FormDataPart implementation
 *
 * Im Quelltext daneben steht es unmissverständlich:
 * „`uri` is not supported for React Native's FormData."
 *
 * **Das erklärt jede einzelne Beobachtung** aus der Untersuchung: Der
 * Fehler entsteht beim *Bauen* des Körpers, also bevor überhaupt eine
 * Verbindung aufgemacht wird. Auf dem Server kam deshalb nie eine Anfrage
 * an, ein Multipart-POST von Hand ging dagegen durch, und das Netz war
 * nachweislich in Ordnung. Weil `fetch` dabei wirft, landete es in unserem
 * `catch` und wurde als „keine Verbindung" gemeldet — die Meldung, die die
 * Suche eine Woche lang in die falsche Richtung geschickt hat.
 *
 * ## Der Weg jetzt
 *
 * `expo-file-system` lädt nativ hoch: Es baut das Multipart selbst und
 * geht an `fetch` vorbei. Nebenbei ist das der robustere Weg — der Körper
 * wird gestreamt, statt erst vollständig als Bytefolge im Arbeitsspeicher
 * zu entstehen. Bei einem Foto vom Telefon ein spürbarer Unterschied.
 */

import { File, UploadType } from 'expo-file-system';

import type { DateiUpload } from './api';

/**
 * Baut den Upload für eine Datei im Dateisystem.
 *
 * `feldname` muss zu `anfrage.file()` in der API passen — darüber findet
 * `@fastify/multipart` die Datei. Steht dort etwas anderes, antwortet der
 * Server mit „Es kam keine Datei an." und niemand ahnt, warum.
 */
export function ausDatei(uri: string, mimeTyp = 'image/jpeg', feldname = 'datei'): DateiUpload {
  const datei = new File(uri);

  return async (url, kopf) => {
    const ergebnis = await datei.upload(url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: feldname,
      mimeType: mimeTyp,
      headers: kopf,
    });
    return { status: ergebnis.status, body: ergebnis.body };
  };
}
