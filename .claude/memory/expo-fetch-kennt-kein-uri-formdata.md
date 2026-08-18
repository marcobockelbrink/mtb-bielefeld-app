---
name: expo-fetch-kennt-kein-uri-formdata
description: "Seit Expo SDK 54 scheitert FormData mit {uri,name,type} an Expos eigenem fetch — Dateien nativ über expo-file-system hochladen"
metadata:
  type: reference
---

Das jahrelang übliche React-Native-Idiom zum Hochladen einer Datei

```js
formular.append('datei', { uri, name: 'bild.jpg', type: 'image/jpeg' });
await fetch(url, { method: 'POST', body: formular });
```

**funktioniert unter Expo SDK 54+ nicht mehr.** Expo ersetzt das globale
`fetch` durch eine eigene Umsetzung, die den Multipart-Körper in
JavaScript zusammenbaut (`expo/src/winter/fetch/convertFormData.ts`). Sie
kennt nur `string`, `Blob` und Objekte mit `bytes()` und wirft sonst:

```
Error: Unsupported FormDataPart implementation
```

Im Quelltext daneben steht es unmissverständlich:
*„`uri` is not supported for React Native's FormData."*

## Warum das so schwer zu finden war

Der Fehler entsteht beim **Bauen** des Körpers, also *bevor* eine
Verbindung aufgemacht wird. Alle Spuren zeigen deshalb aufs Netz:

- Auf dem Server kommt **nie eine Anfrage an** — sieben Tage lang keine
  einzige, während jede andere Anfrage derselben App ankam.
- Ein Multipart-POST von Hand (`curl -F`) geht durch.
- Das Gerät hat nachweislich Netz (5G in der Statusleiste).
- Und weil `fetch` wirft, landet es im `catch` um `fetch` — bei uns also
  in `ApiFehler(ohneNetz: true)`, was die App als „Keine Verbindung"
  anzeigte. **Diese Meldung war es, die die Suche eine Woche lang in die
  falsche Richtung geschickt hat.**

## Der Weg, der trägt

`expo-file-system` lädt nativ hoch und geht an `fetch` vorbei:

```js
import { File, UploadType } from 'expo-file-system';

const ergebnis = await new File(uri).upload(url, {
  httpMethod: 'POST',
  uploadType: UploadType.MULTIPART,
  fieldName: 'datei',        // muss zu `anfrage.file()` der API passen
  mimeType: 'image/jpeg',
  headers: { authorization: `Bearer ${token}` },
});
// → { status, body, headers }
```

Nebenbei der robustere Weg: Der Körper wird gestreamt, statt vollständig
im Arbeitsspeicher zu entstehen.

Im Projekt steht das in `src/data/dateiUpload.ts`. **`src/data/api.ts`
bleibt bewusst frei davon** und nimmt den Upload als Funktion herein
(`DateiUpload`) — sechs Testdateien importieren `api.ts`, und ein Modul,
das beim Laden `expo-file-system` sucht, reißt sie alle mit (Flow im
`react-native`-Paket, vitest kann es nicht parsen). Dieselbe Falle hat
beim ersten Anlauf `tests/familie.test.ts` erwischt.

**Why:** Es betrifft **jeden** künftigen Datei-Upload in diesem Projekt,
und die Fehlermeldung führt zuverlässig in die Irre. Wer beim nächsten Mal
„keine Verbindung" liest, soll hier nachsehen, bevor er wieder eine Woche
im Netzweg sucht.

**How to apply:** Nie wieder `{uri, name, type}` an `FormData` geben. Neue
Uploads über `ausDatei()` in `src/data/dateiUpload.ts`. Und wenn eine
Anfrage nachweislich nie beim Server ankommt, obwohl Netz da ist: Der
Fehler steckt im Bauen der Anfrage, nicht im Senden. Verwandt:
[[foto-upload-defekt]], [[lokal-gruen-ist-nicht-ci-gruen]]
