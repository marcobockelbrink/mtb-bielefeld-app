/**
 * Das Ziel eines Universal Links (`https://<domain>/t/<id>`) *innerhalb* der App.
 *
 * **Warum es diese Datei geben muss.** Genau derselbe Fehler wie beim Magic
 * Link aus Plan 3 (siehe `app/anmeldung/[token].tsx`): Ohne eine passende
 * Route für `/t/<id>` findet expo-router nichts und zeigt seinen eigenen
 * Notbildschirm — „Unmatched Route", schwarz und englisch. `GET /t/:id`
 * (`api/src/app.ts`) ist der Pfad, den die API **ohne** installierte App
 * ausliefert (die kleine Seite ohne Ort und Zeit); mit installierter App und
 * eingerichteten Universal Links landet genau dieselbe Adresse aber hier,
 * nicht im Browser. Die Einzelansicht liegt unter `app/jugend/[id].tsx` — nur
 * der geteilte Link zeigt bewusst auf `/t/`, damit `GET /t/:id` überhaupt der
 * einzige Pfad ohne Token bleiben kann (siehe dort).
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function GeteilterLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/jugend/${id}`} />;
}
