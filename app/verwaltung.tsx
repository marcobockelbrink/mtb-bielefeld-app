/**
 * Mitgliederverwaltung — einladen, Rollen zuteilen, Jugend-Zugehörigkeit.
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
 */

import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
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

const ROLLEN: Rolle[] = ['mitglied', 'guide', 'verwaltung'];

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

  async function stelleUm(zeile: MitgliedZeile, aenderung: { rolle?: Rolle; jugend?: boolean }) {
    if (!zeile.id) return;
    setFehler(null);
    try {
      await aendereMitglied(api, zeile.id, aenderung);
      await laden();
    } catch (ursache) {
      // Der 409 der letzten Verwaltungsrolle kommt mit dem Satz der API an
      // („erst jemand anderem geben, dann abgeben") — durchreichen genügt.
      setFehler(beschreibeJugendFehler(ursache));
    }
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
              <Text style={[styles.email, { color: palette.text }]}>{zeile.email}</Text>
              {zeile.offeneEinladung ? <Badge label="Eingeladen" tone="accent" /> : null}
              {zeile.jugend ? <Badge label="Jugend" tone="primary" /> : null}
            </View>

            {zeile.id === null ? (
              <>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  Noch nie angemeldet — es gibt noch kein Konto.
                </Text>
                <Pressable
                  onPress={() =>
                    Alert.alert('Einladung zurückziehen?', `Der verschickte Link für ${zeile.email} wird wertlos.`, [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Zurückziehen',
                        style: 'destructive',
                        onPress: () => {
                          void zieheEinladungZurueck(api, zeile.email).then(laden, (u: unknown) => setFehler(beschreibeJugendFehler(u)));
                        },
                      },
                    ])
                  }
                >
                  <Text style={[styles.loeschen, { color: palette.danger }]}>Einladung zurückziehen</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.rollen}>
                  {ROLLEN.map((rolle) => (
                    <Pressable
                      key={rolle}
                      onPress={() => {
                        if (rolle === zeile.rolle) return;
                        Alert.alert('Rolle ändern?', `${zeile.email} wird ${rolle}.`, [
                          { text: 'Abbrechen', style: 'cancel' },
                          { text: 'Ändern', onPress: () => void stelleUm(zeile, { rolle }) },
                        ]);
                      }}
                      style={[
                        styles.rolle,
                        { borderColor: palette.border },
                        zeile.rolle === rolle && { backgroundColor: palette.primary, borderColor: palette.primary },
                      ]}
                    >
                      <Text style={[styles.rollentext, { color: zeile.rolle === rolle ? palette.onPrimary : palette.text }]}>
                        {rolle}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable onPress={() => void stelleUm(zeile, { jugend: !zeile.jugend })}>
                  <Text style={[styles.jugend, { color: palette.primary }]}>
                    {zeile.jugend ? 'Jugend-Zugehörigkeit entfernen' : 'Zur Jugend zählen'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Mitglied löschen?', `${zeile.email} verliert sofort den Zugang — das geht nicht zurück.`, [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Löschen',
                        style: 'destructive',
                        onPress: () => {
                          void loescheMitglied(api, zeile.id!).then(laden, (u: unknown) => setFehler(beschreibeJugendFehler(u)));
                        },
                      },
                    ])
                  }
                >
                  <Text style={[styles.loeschen, { color: palette.danger }]}>Mitglied löschen</Text>
                </Pressable>
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
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  email: { fontFamily: font.semibold, fontSize: fontSize.md },
  hinweis: { fontFamily: font.regular, fontSize: fontSize.sm, marginTop: spacing.xs },
  rollen: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  rolle: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  rollentext: { fontFamily: font.semibold, fontSize: fontSize.sm },
  jugend: { fontFamily: font.semibold, fontSize: fontSize.sm, marginTop: spacing.sm },
  loeschen: { fontFamily: font.semibold, fontSize: fontSize.sm, marginTop: spacing.sm },
});
