/**
 * Mitgliederverwaltung — einladen, Rollen vergeben, aufräumen.
 *
 * Der Weg hierher steht nur mit der Rolle `verwaltung` in den Einstellungen;
 * wer die Adresse trotzdem aufruft, bekommt von der API 403. Dieselbe
 * Arbeitsteilung wie überall: Die App versteckt Knöpfe, die Absicherung
 * liegt beim Server.
 *
 * Die Einladung ist bewusst nur ein Adressfeld: Die API legt den Code an
 * und **verschickt die Mail selbst** — niemand reicht mehr Codes von Hand
 * weiter. Steht der TestFlight-Link auf dem Server, ist die Mail die ganze
 * Einladung.
 *
 * ## Rollen als Tags (Design „5b", 14.08.2026)
 *
 * Vier unabhängig schaltbare Chips statt einer Entweder-oder-Auswahl: Im
 * Verein macht einer oft beides, Touren **und** Jugendtraining. Darunter
 * liegt weiter das schlanke Modell — `rolle` als Einzelwert mit der
 * Hierarchie Verwaltung ⊇ Guide, dazu die zwei Häkchen `jugend` und
 * `jugendGuide`. Der Guide-Chip ist bei einer Verwaltung **gesperrt**, weil
 * sie die Rechte ohnehin erbt; ihn dort abwählen zu können hieße, etwas zu
 * versprechen, das die API nicht hält.
 *
 * Destruktives liegt im „…"-Menü, damit die Karte ruhig bleibt: Wer Rollen
 * verteilt, löscht selten — und wer löscht, soll es absichtlich tun.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  aendereMitglied,
  holeMitglieder,
  ladeEin,
  loescheMitglied,
  zieheEinladungZurueck,
  type MitgliedZeile,
  type Rolle,
} from '../src/data/verwaltung';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler';
import { useKonto } from '../src/konto/KontoContext';
import { font, fontSize, radius, spacing } from '../src/theme';
import { ActionButton, Badge, Banner, Card, Label, LoadingState } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

/** Die vier Tags der Karte — jeder für sich schaltbar. */
type Tag = 'guide' | 'jugendGuide' | 'jugend' | 'verwaltung';
const TAGS: Array<{ schluessel: Tag; label: string }> = [
  { schluessel: 'guide', label: 'Guide' },
  { schluessel: 'jugendGuide', label: 'Jugend-Guide' },
  { schluessel: 'jugend', label: 'Jugend' },
  { schluessel: 'verwaltung', label: 'Verwaltung' },
];

export default function VerwaltungScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { angemeldet, api } = useKonto();

  const [liste, setListe] = useState<MitgliedZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laedtNach, setLaedtNach] = useState(false);
  const [adresse, setAdresse] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      setListe(await holeMitglieder(api));
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (angemeldet) void laden();
    }, [angemeldet, laden]),
  );

  async function einladen() {
    const email = adresse.trim();
    if (email === '') return;
    setLaeuft(true);
    setFehler(null);
    setHinweis(null);
    try {
      await ladeEin(api, email);
      setHinweis(`Einladung an ${email} ist unterwegs — samt Code, per Mail.`);
      setAdresse('');
      await laden();
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  function istAn(zeile: MitgliedZeile, tag: Tag): boolean {
    if (tag === 'verwaltung') return zeile.rolle === 'verwaltung';
    // Eine Verwaltung erbt die Guide-Rechte — der Chip zeigt das an und
    // lässt sich nicht einzeln abwählen.
    if (tag === 'guide') return zeile.rolle === 'guide' || zeile.rolle === 'verwaltung';
    return tag === 'jugend' ? zeile.jugend : zeile.jugendGuide;
  }

  async function schicke(zeile: MitgliedZeile, aenderung: { rolle?: Rolle; jugend?: boolean; jugendGuide?: boolean }) {
    if (!zeile.id) return;
    setFehler(null);
    // Optimistisch: Der Chip springt sofort um, ein Fehlschlag rollt beim
    // Neuladen von selbst zurück — die Liste kommt dann wieder vom Server.
    setListe((alt) => alt?.map((z) => (z.id === zeile.id ? { ...z, ...aenderung } : z)) ?? alt);
    try {
      await aendereMitglied(api, zeile.id, aenderung);
      // Sichtbare Bestätigung: Ein Chip, der still umspringt, lässt offen,
      // ob die Änderung wirklich beim Server ankam — gerade bei Rollen die
      // Frage, die man sich stellt.
      setHinweis(`Gespeichert: ${zeile.email}`);
      await laden();
    } catch (ursache) {
      // Der 409 der letzten Verwaltungsrolle kommt mit dem Satz der API an
      // („erst jemand anderem geben, dann abgeben") — durchreichen genügt.
      setFehler(beschreibeJugendFehler(ursache));
      await laden();
    }
  }

  function tagUmschalten(zeile: MitgliedZeile, tag: Tag) {
    const an = istAn(zeile, tag);

    if (tag === 'jugend') return void schicke(zeile, { jugend: !an });
    if (tag === 'jugendGuide') return void schicke(zeile, { jugendGuide: !an });

    if (tag === 'guide') {
      // Bei einer Verwaltung ist der Chip nur Anzeige — die Rechte kommen
      // aus der Hierarchie, nicht aus diesem Feld.
      if (zeile.rolle === 'verwaltung') return;
      return void schicke(zeile, { rolle: an ? 'mitglied' : 'guide' });
    }

    // Verwaltung: die einzige Änderung mit Rückfrage.
    Alert.alert(
      an ? 'Verwaltung entziehen?' : 'Verwaltung geben?',
      an
        ? `${zeile.email} kann dann keine Mitglieder mehr verwalten.`
        : `${zeile.email} darf dann einladen, Rollen vergeben und Fotos sichten.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: an ? 'Entziehen' : 'Geben',
          onPress: () => void schicke(zeile, { rolle: an ? 'mitglied' : 'verwaltung' }),
        },
      ],
    );
  }

  /** Destruktives aus dem „…"-Menü — die Karte bleibt ruhig. */
  function menueOeffnen(zeile: MitgliedZeile) {
    const eintraege: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Abbrechen', style: 'cancel' },
    ];

    if (zeile.id === null) {
      eintraege.push({
        text: 'Einladung zurückziehen',
        style: 'destructive',
        onPress: () =>
          void zieheEinladungZurueck(api, zeile.email).then(laden, (u: unknown) =>
            setFehler(beschreibeJugendFehler(u)),
          ),
      });
    } else {
      eintraege.push({
        text: 'Mitglied löschen',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Mitglied löschen?', `${zeile.email} verliert sofort den Zugang — das geht nicht zurück.`, [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Löschen',
              style: 'destructive',
              onPress: () =>
                void loescheMitglied(api, zeile.id!).then(laden, (u: unknown) =>
                  setFehler(beschreibeJugendFehler(u)),
                ),
            },
          ]),
      });
    }

    Alert.alert(zeile.email, undefined, eintraege);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Verwaltung' }} />
      <ScrollView
        contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={laedtNach}
            onRefresh={() => {
              setLaedtNach(true);
              void laden().finally(() => setLaedtNach(false));
            }}
          />
        }
      >
        {fehler ? <Banner text={fehler} tone="warning" /> : null}
        {hinweis ? <Banner text={hinweis} tone="info" /> : null}

        <Card>
          <Label>Mitglied einladen</Label>
          <TextInput
            style={[styles.feld, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
            value={adresse}
            onChangeText={setAdresse}
            placeholder="anna@example.org"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <ActionButton
            label={laeuft ? 'Wird verschickt …' : 'Einladen — Code kommt per Mail'}
            onPress={() => void einladen()}
          />
        </Card>

        {liste === null && !fehler ? <LoadingState /> : null}

        {liste?.map((zeile) => (
          <Card key={zeile.email}>
            <View style={styles.kopf}>
              <Text style={[styles.email, { color: palette.text }]} numberOfLines={1}>
                {zeile.email}
              </Text>
              {zeile.offeneEinladung ? <Badge label="Eingeladen" tone="accent" /> : null}
              <Pressable
                onPress={() => menueOeffnen(zeile)}
                accessibilityLabel={`Weitere Aktionen für ${zeile.email}`}
                hitSlop={8}
                style={styles.menue}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={palette.textMuted} />
              </Pressable>
            </View>

            {zeile.id === null ? (
              <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                Noch nie angemeldet — es gibt noch kein Konto. Rollen lassen sich vergeben, sobald es
                eines gibt.
              </Text>
            ) : (
              <>
                <View style={styles.rollen}>
                  {TAGS.map(({ schluessel, label }) => {
                    const an = istAn(zeile, schluessel);
                    // Bei einer Verwaltung ist „Guide" geerbt, nicht gesetzt —
                    // gezeigt, aber nicht schaltbar.
                    const geerbt = schluessel === 'guide' && zeile.rolle === 'verwaltung';
                    return (
                      <Pressable
                        key={schluessel}
                        onPress={() => tagUmschalten(zeile, schluessel)}
                        disabled={geerbt}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: an, disabled: geerbt }}
                        accessibilityLabel={`${label} für ${zeile.email}`}
                        style={({ pressed }) => [
                          styles.rolle,
                          { borderColor: an ? palette.primary : palette.border },
                          an && { backgroundColor: pressed ? '#1b587a' : palette.primary },
                          geerbt && { opacity: 0.6 },
                        ]}
                      >
                        {an ? <Ionicons name="checkmark" size={14} color={palette.onPrimary} /> : null}
                        <Text style={[styles.rollentext, { color: an ? palette.onPrimary : palette.text }]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {zeile.gesehenAm ? (
                  <Text style={[styles.gesehen, { color: palette.textMuted }]}>
                    Zuletzt gesehen: {zeile.gesehenAm.toLocaleDateString('de-DE')}
                  </Text>
                ) : null}
              </>
            )}
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: { padding: spacing.lg, gap: spacing.md },
  feld: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginVertical: spacing.sm,
    minHeight: 44,
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  email: { fontFamily: font.semibold, fontSize: fontSize.md, flexShrink: 1 },
  hinweis: { fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.xs },
  rollen: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  rolle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  gesehen: { fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.sm },
  menue: { marginLeft: 'auto', padding: 4 },
  rollentext: { fontFamily: font.semibold, fontSize: fontSize.sm },
});
