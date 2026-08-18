/**
 * Ein Familienprofil ansehen und ändern — das Ziel des Chevrons in der
 * Familienliste.
 *
 * Aus dem Handoff „12/13" (13a), und der Anlass ist ein Satz von Marco:
 * „Generell sollte man alles editieren können. Auch Kinder oder Eltern,
 * die man selber angelegt hat — man kann sich doch immer mal vertippen."
 *
 * Vorher versprach das Chevron einen Bildschirm und öffnete ein
 * `Alert.alert` mit zwei Punkten: Bilder-Upload umschalten und Profil
 * löschen. **Zwischen einem Tippfehler im Vornamen und dem Löschen des
 * ganzen Profils lag nichts.**
 *
 * ## Nur verwaltete Profile
 *
 * Der Handoff beschreibt daneben einen Zweig für Erwachsene („Adresse
 * nicht änderbar, Bilder-Schalter nur solange die Einladung offen ist").
 * Den gibt es hier nicht, und zwar nicht aus Bequemlichkeit: `holeProfile`
 * fragt `WHERE verwaltet_von = $1` ab, und `verwaltet_von` wird beim
 * Anlegen **nur für Kinder** gesetzt (`api/src/familie.ts`). Ein
 * Erwachsener bekommt ein eigenständiges Konto und taucht in der
 * Familienliste nie auf — dieser Bildschirm kann ihn also gar nicht
 * öffnen. Ein Zweig dafür wäre toter Code mit einer erfundenen Regel.
 *
 * ## Gespeichert wird je Feld
 *
 * `PATCH /familie/:id` nimmt einzelne Felder und lässt den Rest über
 * `COALESCE` stehen. Das Formular schickt deshalb genau das geänderte Feld
 * beim Verlassen — kein „Speichern"-Knopf, der einen halb ausgefüllten
 * Zustand über den ganzen Bildschirm sammelt.
 *
 * Die Rechteprüfung steckt in der `WHERE`-Bedingung der Anweisung
 * (`id = $2 AND verwaltet_von = $1`), nicht in einer Prüfung davor. Ein
 * fremdes Profil ergibt 404 — „gibt es nicht" und „gehört dir nicht"
 * dürfen sich für den Anfragenden nicht unterscheiden.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  aendereProfil,
  altersTag,
  holeProfile,
  loescheProfil,
  statusZeile,
  type Profil,
} from '../../src/data/familie';
import {
  altersHinweis,
  geburtsjahrVorschlaege,
  istPlausiblesJahr,
  vollerName,
} from '../../src/features/familie/formular';
import { AvatarBlatt } from '../../src/features/konto/AvatarBlatt';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../src/theme';
import { Avatar } from '../../src/ui/Avatar';
import { Banner, Card, Chip, Gruppe, LoadingState, Zeile } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

/** Welches Feld gerade offen zum Tippen ist. */
type OffenesFeld = 'name' | 'jahr' | null;

export default function FamilienprofilScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { api } = useKonto();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [profil, setProfil] = useState<Profil | null>(null);
  const [fehlt, setFehlt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<OffenesFeld>(null);
  const [avatarBlatt, setAvatarBlatt] = useState(false);

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [jahrText, setJahrText] = useState('');

  const heute = useMemo(() => new Date(), []);
  const jahrgaenge = useMemo(() => geburtsjahrVorschlaege(heute), [heute]);

  /**
   * Es gibt keinen Endpunkt für ein einzelnes Profil — die Liste ist kurz
   * (höchstens eine Handvoll), und ein eigener Endpunkt für einen Eintrag
   * daraus wäre Aufwand ohne Ertrag.
   */
  const laden = useCallback(async () => {
    if (!id) return;
    try {
      const gefunden = (await holeProfile(api)).find((p) => p.id === id) ?? null;
      setProfil(gefunden);
      setFehlt(gefunden === null);
      if (gefunden) {
        const teile = (gefunden.name ?? '').trim().split(/\s+/).filter(Boolean);
        setVorname(teile[0] ?? '');
        setNachname(teile.slice(1).join(' '));
        setJahrText(gefunden.geburtsjahr ? String(gefunden.geburtsjahr) : '');
      }
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api, id]);

  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  /** Ein einzelnes Feld schicken und die Liste nachziehen. */
  async function aendere(aenderung: { name?: string; geburtsjahr?: number | null; kannBilderHochladen?: boolean }) {
    if (!id) return;
    setFehler(null);
    try {
      await aendereProfil(api, id, aenderung);
      await laden();
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
      // Zurück auf den Stand des Servers — sonst steht im Feld etwas, das
      // nirgends gespeichert ist, und niemand merkt es.
      await laden();
    }
  }

  function nameSichern() {
    setOffen(null);
    const neu = vollerName(vorname, nachname);
    if (neu === '' || neu === (profil?.name ?? '')) return;
    void aendere({ name: neu });
  }

  function jahrSichern(wert: string) {
    setOffen(null);
    if (!istPlausiblesJahr(wert, heute)) return;
    const jahr = Number.parseInt(wert, 10);
    if (jahr === profil?.geburtsjahr) return;
    void aendere({ geburtsjahr: jahr });
  }

  function loeschen() {
    if (!profil) return;
    Alert.alert(
      'Profil löschen?',
      `${profil.name ?? 'Dieses Profil'} verliert den Zugang — das geht nicht zurück.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            void loescheProfil(api, profil.id).then(
              () => router.back(),
              (u: unknown) => setFehler(beschreibeJugendFehler(u)),
            ),
        },
      ],
    );
  }

  if (fehlt) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profil' }} />
        <View style={styles.inhalt}>
          <Banner tone="warning" text="Dieses Profil gibt es nicht mehr." />
        </View>
      </>
    );
  }

  if (!profil) return <LoadingState />;

  return (
    <>
      <Stack.Screen options={{ title: profil.name ?? 'Profil' }} />
      <ScrollView contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {fehler ? <Banner tone="danger" text={fehler} /> : null}

        {/* Das Bild oben und mittig — und damit ist der Bild-Upload für
            Kinder überhaupt erst erreichbar. `AvatarBlatt` nimmt eine
            beliebige Kennung entgegen, es war nie aufs eigene Konto
            begrenzt; es fehlte nur der Weg dorthin. */}
        <View style={styles.bildbereich}>
          <Avatar
            name={profil.name ?? '?'}
            uri={profil.avatarUrl ? api.bildQuelle(profil.avatarUrl).uri : null}
            size={92}
          />
          <Pressable onPress={() => setAvatarBlatt(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.bildKnopf, { color: palette.primary }]}>Bild ändern</Text>
          </Pressable>
        </View>

        <Gruppe>Angaben</Gruppe>
        <Card>
          <Zeile erste>
            {offen === 'name' ? (
              <View style={styles.felder}>
                <TextInput
                  value={vorname}
                  onChangeText={setVorname}
                  autoFocus
                  returnKeyType="next"
                  accessibilityLabel="Vorname"
                  style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
                />
                <Text style={[styles.feldName, { color: palette.textMuted }]}>Vorname</Text>
                <TextInput
                  value={nachname}
                  onChangeText={setNachname}
                  returnKeyType="done"
                  onSubmitEditing={nameSichern}
                  onBlur={nameSichern}
                  accessibilityLabel="Nachname"
                  style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
                />
                <Text style={[styles.feldName, { color: palette.textMuted }]}>Nachname</Text>
              </View>
            ) : (
              <Pressable onPress={() => setOffen('name')} style={styles.zeile} accessibilityRole="button">
                <Text style={[styles.beschriftung, { color: palette.textMuted }]}>Name</Text>
                <Text style={[styles.wert, { color: palette.text }]}>{profil.name ?? '—'}</Text>
                <Ionicons name="pencil" size={16} color={palette.textMuted} />
              </Pressable>
            )}
          </Zeile>

          <Zeile>
            {offen === 'jahr' ? (
              <View style={styles.felder}>
                <Text style={[styles.beschriftung, { color: palette.textMuted }]}>Geburtsjahr</Text>
                <View style={styles.chips}>
                  {jahrgaenge.map((jahr) => (
                    <Chip
                      key={jahr}
                      label={String(jahr)}
                      selected={profil.geburtsjahr === jahr}
                      onPress={() => jahrSichern(String(jahr))}
                    />
                  ))}
                </View>
                <TextInput
                  value={jahrText}
                  onChangeText={setJahrText}
                  onBlur={() => jahrSichern(jahrText)}
                  onSubmitEditing={() => jahrSichern(jahrText)}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={4}
                  accessibilityLabel="Anderes Geburtsjahr"
                  style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
                />
                <Text style={[styles.feldName, { color: palette.textMuted }]}>Anderes Jahr</Text>
              </View>
            ) : (
              <Pressable onPress={() => setOffen('jahr')} style={styles.zeile} accessibilityRole="button">
                <Text style={[styles.beschriftung, { color: palette.textMuted }]}>Geburtsjahr</Text>
                <Text style={[styles.wert, { color: palette.text }]}>
                  {profil.geburtsjahr ?? 'nicht angegeben'}
                </Text>
                <Ionicons name="pencil" size={16} color={palette.textMuted} />
              </Pressable>
            )}
          </Zeile>

          <Zeile>
            <View style={styles.schalterZeile}>
              <View style={styles.schalterText}>
                <Text style={[styles.wert, { color: palette.text }]}>Kann Bilder hochladen</Text>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  Bei Kinderprofilen voreingestellt aus. Du kannst das jederzeit ändern.
                </Text>
              </View>
              <Switch
                value={profil.kannBilderHochladen}
                onValueChange={(wert) => void aendere({ kannBilderHochladen: wert })}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Kann Bilder hochladen"
              />
            </View>
          </Zeile>
        </Card>

        <Gruppe>Status</Gruppe>
        <Card>
          <Zeile erste>
            <Text style={[styles.wert, { color: palette.text }]}>{statusZeile(profil)}</Text>
            <Text style={[styles.hinweis, { color: palette.textMuted }]}>
              {altersTag(profil, heute)}
              {altersHinweis(vorname, profil.geburtsjahr, heute)
                ? ` · ${altersHinweis(vorname, profil.geburtsjahr, heute)}`
                : ''}
            </Text>
          </Zeile>
        </Card>

        <Pressable onPress={loeschen} accessibilityRole="button" style={styles.loeschen}>
          <Text style={[styles.loeschenText, { color: palette.danger }]}>Profil löschen</Text>
        </Pressable>
      </ScrollView>

      <AvatarBlatt
        offen={avatarBlatt}
        beimSchliessen={() => setAvatarBlatt(false)}
        mitgliedId={profil.id}
        name={profil.name ?? '?'}
        avatarUrl={profil.avatarUrl}
        beimAendern={laden}
      />
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: { gap: spacing.md, padding: spacing.lg },
  bildbereich: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  bildKnopf: { fontFamily: font.semibold, fontSize: fontSize.sm, minHeight: 44, paddingTop: spacing.sm },
  zeile: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: 44 },
  beschriftung: { fontFamily: font.regular, fontSize: fontSize.sm, minWidth: 96 },
  wert: { flex: 1, fontFamily: font.semibold, fontSize: fontSize.md },
  hinweis: { fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.xs },
  felder: { gap: spacing.xs },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  feldName: { fontFamily: font.regular, fontSize: fontSize.xs, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  schalterZeile: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  schalterText: { flex: 1 },
  loeschen: { alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: spacing.lg },
  loeschenText: { fontFamily: font.semibold, fontSize: fontSize.md },
});
