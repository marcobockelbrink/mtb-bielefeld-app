/**
 * Die Albumübersicht.
 *
 * Kein eigener Reiter — die Leiste fasst vier, mit einem fünften stünde dort
 * „EINSTELLUN…" (README, auf einem Gerät nachgemessen). Der Einstieg ist der
 * Knopf auf dem Verein-Reiter; Alben zu einem Termin verlinkt später
 * zusätzlich die Terminansicht.
 *
 * Wie beim Jugend-Reiter gilt: Alles hier braucht Konto und Server. Wer
 * nicht angemeldet ist, sieht die Aufforderung statt einer leeren Liste.
 */

import { Link, Stack, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { holeAlben, type Album } from '../../src/data/fotos';
import { AlbumKarte } from '../../src/features/fotos/AlbumKarte';
import { beschreibeJugendFehler } from '../../src/features/jugend/jugendFehler';
import { useKonto } from '../../src/konto/KontoContext';
import { spacing } from '../../src/theme';
import { ActionButton, Banner, EmptyState, LoadingState } from '../../src/ui/components';

export default function FotoAlbenScreen() {
  const insets = useSafeAreaInsets();
  const { angemeldet, laedt: kontoLaedt, api } = useKonto();

  const [alben, setAlben] = useState<Album[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedtNach, setLaedtNach] = useState(false);

  const laden = useCallback(async () => {
    setFehler(null);
    try {
      setAlben(await holeAlben(api));
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      if (angemeldet) void laden();
    }, [angemeldet, laden]),
  );

  // Seit dem 13.08.2026 darf jedes Mitglied Alben anlegen.
  const darfAnlegen = angemeldet;

  return (
    <>
      <Stack.Screen options={{ title: 'Fotos' }} />
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

        {!angemeldet && !kontoLaedt ? (
          <EmptyState
            title="Nur für Mitglieder"
            hint="Melde dich in den Einstellungen an, um die Fotoalben zu sehen."
          />
        ) : null}

        {angemeldet && alben === null && !fehler ? <LoadingState /> : null}

        {angemeldet && alben?.length === 0 ? (
          <EmptyState
            title="Noch keine Alben"
            hint={
              darfAnlegen
                ? 'Leg das erste an — zum Beispiel für die letzte Tour.'
                : 'Sobald ein Guide ein Album anlegt, erscheint es hier.'
            }
          />
        ) : null}

        {alben?.map((album) => (
          <Link key={album.id} href={`/fotos/${album.id}`} asChild>
            <Pressable>
              {({ pressed }) => (
                <AlbumKarte album={album} api={api} style={pressed ? styles.gedrueckt : undefined} />
              )}
            </Pressable>
          </Link>
        ))}

        {angemeldet && darfAnlegen ? (
          <ActionButton label="Album anlegen" onPress={() => router.push('/fotos/neu')} />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  gedrueckt: {
    opacity: 0.7,
  },
});
