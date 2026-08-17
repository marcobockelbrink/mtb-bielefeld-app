/**
 * Ein Familienmitglied anlegen — Kind oder Erwachsener, je nach Parameter.
 *
 * Aus dem Handoff „Runde 11", Teil B (Entwurf 11a). Vorher stand dieses
 * Formular in einem Blatt, und daraus kam die Meldung aus der Beta: „Wenn
 * man in der Familie weitere Eltern einträgt, geht die Tastatur über die
 * Eingabe und man sieht nichts." Der Fehler im Blatt selbst ist behoben
 * (`ui/Blatt.tsx` ist seit dem 16.08.2026 tastaturfest), aber fünf Felder
 * plus Erklärtext plus Schalter sind für ein Blatt schlicht zu viel. Als
 * Stack-Route hat das Formular die volle Höhe und das Verhalten, das die
 * Plattform für Formulare vorsieht.
 *
 * **Der Segment-Schalter „Kind / Erwachsener" fällt damit weg.** Die Art
 * steht im Adressparameter, und jede Seite zeigt nur ihre eigenen Felder —
 * „weitere Eltern eintragen" ist dadurch ein Formular mit **zwei** Feldern
 * statt mit fünf, von denen drei nicht gelten.
 *
 * Die Regeln stehen in `features/familie/formular.ts` und sind dort
 * geprüft. Das ist kein Selbstzweck: `kannAnlegen` war vorher ein Ausdruck
 * mitten in `FamilienGruppe.tsx`, und beim Umzug ist so etwas genau das,
 * was still verlorengeht.
 */

import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { legeProfilAn } from '../../src/data/familie';
import {
  altersHinweis,
  bestaetigungGehtAn,
  vollerName,
  geburtsjahrVorschlaege,
  istPlausiblesJahr,
  kannAnlegen,
  type ProfilArt,
} from '../../src/features/familie/formular';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { Banner, Card, Chip, Label } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NeuesFamilienmitgliedScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api, email: eigeneAdresse } = useKonto();
  const { art: rohArt } = useLocalSearchParams<{ art?: string }>();

  // Alles außer dem ausdrücklichen `erwachsen` gilt als Kind — dieselbe
  // Regel wie bei der Umgebung in `app.config.js`: Die folgenreichere
  // Richtung braucht das genaue Wort. Ein verwaltetes Kinderprofil lässt
  // sich löschen, eine verschickte Konto-Einladung nicht zurückholen.
  const art: ProfilArt = rohArt === 'erwachsen' ? 'erwachsen' : 'kind';
  const istKind = art === 'kind';

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [geburtsjahr, setGeburtsjahr] = useState<number | null>(null);
  const [jahrFeldOffen, setJahrFeldOffen] = useState(false);
  const [jahrText, setJahrText] = useState('');
  const [email, setEmail] = useState('');
  const [darfHochladen, setDarfHochladen] = useState(false);

  /**
   * Gesetzt, sobald angelegt ist — dann ersetzt die Bestätigung das
   * Formular. Aus „7c": Der Satz nennt den **tatsächlichen** Empfänger,
   * und bei einem Kind ohne eigene Adresse kommt der zweite Schritt dazu.
   */
  const [fertig, setFertig] = useState<{ an: string; eigene: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Fehler **am Feld** statt im Banner (Handoff, Punkt 6). Das Banner
  // bleibt für Fehler ohne Feldbezug: kein Netz, 403.
  const [emailFehler, setEmailFehler] = useState<string | null>(null);

  const heute = useMemo(() => new Date(), []);
  const jahrgaenge = useMemo(() => geburtsjahrVorschlaege(heute), [heute]);
  const emailFeld = useRef<TextInput>(null);
  const nachnameFeld = useRef<TextInput>(null);

  const bereit = kannAnlegen(art, vorname, nachname, email);
  const empfaenger = bestaetigungGehtAn(email, eigeneAdresse);

  function jahrUebernehmen() {
    if (!istPlausiblesJahr(jahrText, heute)) return;
    setGeburtsjahr(Number.parseInt(jahrText, 10));
    setJahrFeldOffen(false);
  }

  async function anlegen() {
    if (!bereit) return;
    setFehler(null);
    setEmailFehler(null);
    setLaeuft(true);
    try {
      const ergebnis = await legeProfilAn(api, {
        art,
        name: vollerName(vorname, nachname),
        geburtsjahr: istKind ? geburtsjahr : null,
        email: email.trim() || null,
        // Beim Erwachsenen keine Frage: Ein eigenständiges Konto darf
        // hochladen. Beim Kind ist es eine **Voreinstellung**, keine Regel
        // — abschaltbar bleibt es in der Familienliste.
        kannBilderHochladen: istKind ? darfHochladen : true,
      });
      // Nicht sofort zurückspringen: Was jetzt zu tun ist, steht in der
      // Bestätigung, und ein Wegspringen mitten im Lesen verschluckt sie.
      // Dieselbe Entscheidung wie beim Anlegen eines Trainings.
      setFertig({ an: ergebnis.bestaetigungAn, eigene: email.trim() !== '' });
    } catch (ursache) {
      const text = beschreibeJugendFehler(ursache);
      // Alles, was die API zur Adresse sagt („gibt es schon", „ungültig"),
      // gehört ans Feld — dort steht die Ursache, nicht über dem Formular.
      if (/mail|adresse/i.test(text)) setEmailFehler(text);
      else setFehler(text);
    } finally {
      setLaeuft(false);
    }
  }

  if (fertig) {
    return (
      <>
        <Stack.Screen options={{ title: istKind ? 'Kind anlegen' : 'Erwachsenen einladen' }} />
        <View style={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <Card>
            <Label>Bestätigung verschickt</Label>
            <Text style={[styles.dialogText, { color: palette.text }]}>
              Die Mail für {vorname.trim()} ging an {fertig.an}.
            </Text>
            <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
              1. Link öffnen und das Profil bestätigen.
            </Text>
            {fertig.eigene ? null : (
              <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
                2. Zugangsdaten weitergeben — das Profil erscheint dann in der App.
              </Text>
            )}
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Zurück zur Familie"
              style={({ pressed }) => [
                styles.hauptknopf,
                styles.fertigKnopf,
                { backgroundColor: pressed ? '#1b587a' : palette.primary },
              ]}
            >
              <Text style={[styles.hauptknopfText, { color: palette.onPrimary }]}>Verstanden</Text>
            </Pressable>
          </Card>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: istKind ? 'Kind anlegen' : 'Erwachsenen einladen',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityLabel="Abbrechen" hitSlop={8}>
              <Text style={[styles.abbrechen, { color: palette.primary }]}>Abbrechen</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.rahmen}
      >
        <ScrollView contentContainerStyle={styles.inhalt} keyboardShouldPersistTaps="handled">
          <Card>
            <Label>Name</Label>
            {/* Zwei Felder statt einem — beide Pflicht. Die Anmeldung zum
                Jugendtraining braucht Vor- und Nachname getrennt; mit
                einem Feld entstanden Profile wie „Ben", die sich dann
                nicht anmelden ließen. Siehe `formular.ts`. */}
            <TextInput
              value={vorname}
              onChangeText={setVorname}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => nachnameFeld.current?.focus()}
              accessibilityLabel="Vorname"
              style={[
                styles.feld,
                { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            />
            <Text style={[styles.feldName, { color: palette.textMuted }]}>Vorname</Text>

            <TextInput
              ref={nachnameFeld}
              value={nachname}
              onChangeText={setNachname}
              returnKeyType="next"
              onSubmitEditing={() => emailFeld.current?.focus()}
              accessibilityLabel="Nachname"
              style={[
                styles.feld,
                { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            />
            <Text style={[styles.feldName, { color: palette.textMuted }]}>Nachname</Text>
          </Card>

          {istKind ? (
            <Card>
              <Label>Geburtsjahr</Label>
              <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
                Für die Zuordnung zu den Trainingsgruppen. Kann auch später noch nachgetragen
                werden.
              </Text>
              {/* Chips statt Zahlentastatur: Die Jahrgänge des
                  Jugendtrainings sind acht Werte, und acht Werte tippt
                  niemand freiwillig. */}
              <View style={styles.chips}>
                {jahrgaenge.map((jahr) => (
                  <Chip
                    key={jahr}
                    label={String(jahr)}
                    selected={geburtsjahr === jahr}
                    onPress={() => {
                      setGeburtsjahr(jahr);
                      setJahrFeldOffen(false);
                    }}
                  />
                ))}
                <Chip
                  label="Anderes Jahr …"
                  selected={jahrFeldOffen}
                  onPress={() => setJahrFeldOffen((offen) => !offen)}
                />
              </View>

              {jahrFeldOffen ? (
                <TextInput
                  value={jahrText}
                  onChangeText={setJahrText}
                  onBlur={jahrUebernehmen}
                  onSubmitEditing={jahrUebernehmen}
                  accessibilityLabel="Anderes Geburtsjahr"
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={4}
                  style={[
                    styles.feld,
                    { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
                  ]}
                />
              ) : null}

              {/* Was aus der Wahl folgt — der Befund war, dass eine Zahl
                  allein nichts sagt. Bewusst das Alter und keine
                  U-Gruppe: Die gibt es im Projekt nirgends, und eine
                  erfundene stünde später im Widerspruch zu der, die der
                  Verein wirklich benutzt. */}
              {altersHinweis(vorname, geburtsjahr, heute) ? (
                <Text style={[styles.folge, { color: palette.textMuted }]}>
                  {altersHinweis(vorname, geburtsjahr, heute)}
                </Text>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <Label>{istKind ? 'E-Mail des Kindes (optional)' : 'E-Mail'}</Label>
            <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
              {istKind
                ? 'Hat dein Kind ein eigenes Postfach, kann es sich selbst anmelden. Ohne Adresse verwaltest du das Profil.'
                : 'An diese Adresse geht die Einladung zum eigenen Konto.'}
            </Text>
            <TextInput
              ref={emailFeld}
              value={email}
              onChangeText={(wert) => {
                setEmail(wert);
                setEmailFehler(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
              style={[
                styles.feld,
                {
                  color: palette.text,
                  borderColor: emailFehler ? palette.danger : palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            />
            {emailFehler ? (
              <Text style={[styles.feldFehler, { color: palette.danger }]}>{emailFehler}</Text>
            ) : null}
          </Card>

          {istKind ? (
            <Card>
              <View style={styles.schalterZeile}>
                <View style={styles.schalterText}>
                  <Text style={[styles.titel, { color: palette.text }]}>Kann Bilder hochladen</Text>
                  <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
                    Aus als Voreinstellung, nicht als Regel — du kannst es jederzeit in der
                    Familienliste umstellen.
                  </Text>
                </View>
                <Switch
                  value={darfHochladen}
                  onValueChange={setDarfHochladen}
                  trackColor={{ true: palette.primary }}
                  accessibilityLabel="Kann Bilder hochladen"
                />
              </View>
            </Card>
          ) : null}

          {fehler ? <Banner tone="danger" text={fehler} /> : null}
        </ScrollView>

        <View
          style={[
            styles.fussleiste,
            {
              backgroundColor: palette.surface,
              borderTopColor: palette.border,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          {/* Den Empfänger **vor** dem Absenden nennen. Bisher beantwortete
              das erst der Dialog danach — und bei einem Kind ohne eigene
              Adresse ist „an dich" genau die Frage, die sich stellt, wer
              das Feld leer lässt. */}
          <Text style={[styles.empfaenger, { color: palette.textMuted }]} numberOfLines={1}>
            Bestätigung geht an {empfaenger}
          </Text>
          {laeuft ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Pressable
              onPress={() => void anlegen()}
              disabled={!bereit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !bereit }}
              accessibilityLabel={istKind ? 'Kind anlegen' : 'Einladung senden'}
              style={({ pressed }) => [
                styles.hauptknopf,
                {
                  backgroundColor: pressed && bereit ? '#1b587a' : palette.primary,
                  opacity: bereit ? 1 : 0.45,
                },
              ]}
            >
              <Text style={[styles.hauptknopfText, { color: palette.onPrimary }]}>
                {istKind ? 'Anlegen & Bestätigung senden' : 'Einladung senden'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  rahmen: { flex: 1 },
  inhalt: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  abbrechen: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  erklaerung: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  folge: {
    fontFamily: font.semibold,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Beschriftung **unter** dem Feld: Ein Beispieltext im Feld
  // verschwindet beim Tippen, und dann weiß niemand mehr, was oben
  // hineingehörte.
  feldName: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  feldFehler: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  schalterZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  schalterText: { flex: 1 },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  fussleiste: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  dialogText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  fertigKnopf: { marginTop: spacing.lg },
  empfaenger: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
  },
  hauptknopf: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 50,
  },
  hauptknopfText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
});
