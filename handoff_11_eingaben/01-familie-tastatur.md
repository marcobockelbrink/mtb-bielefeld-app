# 1 — Familie: die Tastatur verdeckt die Eingabe

Gemeldet: „Wenn man in der Familie weitere Eltern einträgt, geht die Tastatur
über die Eingabe und man sieht nichts." Screenshot aus der Beta (17:05) zeigt
das Blatt vollständig unter der Tastatur.

## Ursache (nachgeprüft im Code)

`src/ui/Blatt.tsx` rendert ein `Modal` mit einer `Animated.View`, die am
unteren Rand klebt:

- **kein `KeyboardAvoidingView`** — im ganzen `src`-Baum kommt der Begriff
  nicht vor. Ein `Modal` erbt das Verhalten des Bildschirms nicht; die Tastatur
  legt sich schlicht darüber.
- **keine `ScrollView` im Blatt** — was unter dem Rand liegt, ist nicht
  erreichbar.
- Die Aktion (`ActionButton` „Anlegen & Bestätigung senden") steht in
  `FamilienGruppe.tsx` **am Ende des Inhalts** und ist deshalb das erste, was
  verschwindet.
- Der Fall „Erwachsener" ist am schlimmsten: Das E-Mail-Feld ist dort Pflicht
  und steht als **letztes** Feld — genau unter der Tastatur.

Betrifft ebenso das Upload-Blatt (`app/fotos/[id].tsx`) und das Themenfilter-
Blatt (`app/(tabs)/news.tsx`), sobald dort ein Textfeld dazukommt.

## Teil A — `src/ui/Blatt.tsx` tastaturfest machen

Ziel: Das Blatt sitzt **auf** der Tastatur, sein Inhalt scrollt, und eine feste
Leiste am Blattboden trägt die Aktion.

1. Im `Modal` um die `Animated.View` einen `KeyboardAvoidingView` legen:
   `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`, `style={{ flex: 1,
   justifyContent: 'flex-end' }}`. Der `Pressable`-Hintergrund bleibt darüber
   als Geschwister, damit Backdrop-Tap weiter schließt.
2. Blatthöhe begrenzen: `maxHeight: height * 0.62` auf der `Animated.View`
   (`height` kommt schon aus `useWindowDimensions`). Sichtbar angeschnittener
   Inhalt ist der Hinweis, dass gescrollt werden kann.
3. Neue optionale Zone: `Blatt` bekommt eine Eigenschaft
   `leiste?: ReactNode`. `children` landen in einer `ScrollView`
   (`keyboardShouldPersistTaps="handled"`,
   `contentContainerStyle={{ paddingBottom: spacing.md }}`), `leiste` darunter
   in einer `View` mit `borderTopWidth: 1`, `borderTopColor: palette.border`,
   `paddingHorizontal: spacing.lg`, `paddingTop: spacing.sm`,
   `paddingBottom: einfügungen.bottom + spacing.sm` (`useSafeAreaInsets`).
   Ohne `leiste` verhält sich `Blatt` wie bisher — die beiden anderen
   Aufrufstellen bleiben unberührt.
4. `keyboardShouldPersistTaps="handled"` ist nicht optional: Ohne das
   verschluckt der erste Tipp auf `Switch` oder Chip nur die Tastatur.
5. Der `PanResponder` bleibt, muss aber auf der **Griff-Zeile** sitzen, nicht
   auf dem ganzen Blatt — sonst frisst er die Scroll-Gesten der `ScrollView`.
   `panHandlers` von der `Animated.View` auf die Grabber-`View` verschieben und
   deren Tippfläche auf 44 pt Höhe bringen (`paddingVertical: 20`, der Strich
   bleibt optisch 4 pt).

In `src/features/familie/FamilienGruppe.tsx` den `ActionButton` aus dem
Blatt-Inhalt in die neue `leiste` heben, mit der Zeile darüber, wohin die
Bestätigung geht (siehe Teil B, Punkt 5).

## Teil B — Formular als eigene Seite (Entwurf 11a, gewählt)

**Das ist der beschlossene Weg.** Ein Blatt ist für fünf Felder plus Erklärtext
plus Schalter zu klein. Als
Stack-Route hat das Formular die volle Höhe und das Verhalten, das die
Plattform für Formulare vorsieht.

1. **Neue Routen** `app/familie/neu.tsx` mit Parameter `art=kind|erwachsen`
   (`useLocalSearchParams`), Titel „Kind anlegen" bzw. „Erwachsenen einladen",
   `headerLeft` „Abbrechen" → `router.back()`.
2. In `FamilienGruppe.tsx` wird aus dem einen Knopf
   „Familienmitglied hinzufügen" **zwei Zeilen** mit Chevron:
   „Kind anlegen" und „Erwachsenen einladen". Damit fällt der Segment-Schalter
   `art` im Formular weg — jede Seite zeigt nur ihre Felder, und
   „weitere Eltern" ist ein Formular mit **zwei** Feldern.
3. Aufbau der Seite: `KeyboardAvoidingView` → `ScrollView`
   (`keyboardShouldPersistTaps="handled"`) → Felder; darunter, **außerhalb** der
   `ScrollView`, die feste Fußleiste mit der Hauptaktion (50 pt).
4. **Geburtsjahr als Chips** statt Zahlentastatur: die vier Jahrgänge, die im
   Verein die U-Gruppen tragen, plus „Anderes Jahr …" (öffnet den bisherigen
   Zahlen-Eingang). Unter der Auswahl die Rückmeldung, was daraus folgt:
   „Mika fährt bei den **U14** mit." Die Zuordnung macht `altersTag()` in
   `src/data/familie.ts` bereits — hier nur anzeigen.
5. **Empfänger vor dem Absenden nennen.** Unter dem Knopf steht
   „Bestätigung geht an <Adresse>" — bei leerem Kind-Mailfeld die eigene
   Adresse aus `useKonto()`. Der Bestätigungs-Dialog danach bleibt, beantwortet
   aber nicht mehr allein diese Frage.
6. **Fehler ans Feld.** `beschreibeJugendFehler` liefert weiter den Text; er
   steht künftig unter dem betroffenen Feld (`palette.danger`), nicht als
   `Banner` über dem Formular. Das Banner bleibt für Fehler ohne Feldbezug
   (kein Netz, 403).
7. Reihenfolge und Tastatur-Kette: `returnKeyType="next"` mit `onSubmitEditing`
   auf das nächste Feld, letztes Feld `returnKeyType="done"`.

## Nicht ändern

- Das optionale Mailfeld beim Kind und die Umschaltung des Empfängers — das ist
  eine bewusste Entscheidung (Kinder ohne eigenes Postfach) und bleibt.
- Voreinstellung „Kann Bilder hochladen" = aus, als Voreinstellung, nicht als
  Regel.
- `api/src/familie.ts` und `016-familienprofile.sql` bleiben unberührt.

## Regressionstests

- `tests/familie.test.ts` läuft unverändert weiter (Datenschicht).
- Neu, als Komponententest: Bei `art=erwachsen` ist der Absende-Knopf
  deaktiviert, solange das Mailfeld leer ist (heute `kannAnlegen`, Zeile in
  `FamilienGruppe.tsx`) — die Regel muss beim Umzug in die Route erhalten
  bleiben.
- Manuell: Themenfilter-Blatt (`news.tsx`) und Foto-Blatt (`fotos/[id].tsx`)
  öffnen, wischen, schließen — der verschobene `PanResponder` darf dort nichts
  brechen.
