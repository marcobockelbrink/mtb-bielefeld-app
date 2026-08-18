# 13a — Familienprofil bearbeiten

**Aus dem Gespräch:** „Generell sollte man alles editieren können. Auch
Kinder oder Eltern, die man selber angelegt hat — man kann sich doch immer
mal vertippen."

Heute nicht möglich: Name und Geburtsjahr eines angelegten Profils sind
nirgends erreichbar.

## Der Ist-Zustand

`src/features/familie/FamilienGruppe.tsx` zeigt je Profil eine Zeile mit
Chevron — das Chevron verspricht einen Bildschirm, öffnet aber ein
`Alert.alert` mit genau zwei Punkten: „Bilder-Upload sperren/erlauben" und
„Profil löschen". Zwischen einem Tippfehler im Vornamen und dem Löschen des
ganzen Profils liegt nichts.

Dabei ist der Weg fertig:

- `src/data/familie.ts` → `aendereProfil(api, id, { name, geburtsjahr,
  kannBilderHochladen })`
- `api/src/app.ts` → `app.patch('/familie/:id', …)`
- `setzeAvatar` / `entferneAvatar` ebenfalls, und `AvatarBlatt` nimmt eine
  beliebige `mitgliedId` entgegen — es ist nicht aufs eigene Konto begrenzt.

## Zu bauen: `app/familie/[id].tsx`

Das Ziel des Chevrons. Aufbau siehe `13a` im Entwurf:

1. **Bild oben**, mittig, mit „Bild ändern" darunter — öffnet `AvatarBlatt`
   mit `mitgliedId={profil.id}`. Damit ist der Bild-Upload für Kinder
   überhaupt erst erreichbar.
2. **Angaben** als Zeilengruppe: Name, Geburtsjahr, „Bilder hochladen"
   (Schalter). Tippen öffnet das Feld **in der Zeile** — kein eigener
   Bildschirm für einen Vornamen. Gespeichert wird beim Verlassen des Felds
   über `aendereProfil` mit genau diesem einen Feld.
3. **Status** — „Aktiv seit …" bzw. „Bestätigung an … gesendet"; nutzt
   `statusZeile()`.
4. **„Profil löschen"** unten, in `palette.danger`, mit derselben
   Rückfrage wie heute im Alert.

`FamilienGruppe.tsx`: Das `Alert`-Menü entfällt, die Zeile wird zu
`router.push('/familie/' + profil.id)`. Der `Alert`-Code samt
`profilMenue` kann weg — nicht auskommentiert stehen lassen.

## Erwachsene sind anders

Für ein Profil mit `art === 'erwachsen'`:

- Name: änderbar.
- **Adresse: nicht** änderbar. Sie ist der Zugang dieser Person, nicht deine
  Angabe — sie ändert sie in ihrem eigenen Konto.
- „Bilder hochladen": nur solange die Einladung offen ist, danach gehört das
  der Person selbst.

Wenn das den Rahmen sprengt: Erwachsene bekommen vorerst nur Name + Löschen,
und die Zeile sagt warum. Lieber ein ehrlicher Satz als ein Feld, das nichts
tut.

## Akzeptanzkriterien

- Antippen einer Profilzeile öffnet die Seite, kein Alert mehr.
- Name ändern, zurück, App neu starten: die Änderung steht noch da.
- Geburtsjahr ändern ändert den Alters-Tag in der Liste (`altersTag`).
- Der Bild-Upload funktioniert für ein Kind und ist danach sofort in der
  Familienliste zu sehen (siehe 12a, Ursache 2).
- Ein fremdes Profil (andere `mitglied_id`) ist auch mit richtiger Kennung
  nicht änderbar — Test auf `PATCH /familie/:id`.
