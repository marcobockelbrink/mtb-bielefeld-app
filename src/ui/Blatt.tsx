/**
 * Ein Bottom-Sheet — von unten eingeschoben, Grabber oben, Backdrop-Tap und
 * Runterwischen schließen.
 *
 * Eingeführt mit dem Design-Review vom 14.08.2026 (Themenfilter „2a" und
 * Upload-Blatt „4b"). Bewusst eine eigene kleine Komponente statt einer
 * Sheet-Bibliothek: Gebraucht werden genau Einschieben (~250 ms), Grabber,
 * Backdrop und Wisch-Schließen — jede Bibliothek brächte ein Vielfaches
 * davon mit, und Expo müsste sie mitsegnen.
 *
 * Anders als `presentation: 'formSheet'` des Routers liegt dieses Blatt
 * **im** Bildschirm: Es braucht keinen Routenwechsel und kann deshalb
 * Zustand mit dem Bildschirm teilen (die Themenauswahl, die gewählten
 * Bilder), statt ihn durch die Navigation zu reichen.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import type { ReactNode } from 'react';

import { spacing } from '../theme';
import { useTheme } from './theme';

export function Blatt({
  offen,
  beimSchliessen,
  children,
}: {
  offen: boolean;
  beimSchliessen: () => void;
  children: ReactNode;
}) {
  const { palette } = useTheme();
  const { height } = useWindowDimensions();
  const verschiebung = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (offen) {
      Animated.timing(verschiebung, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      verschiebung.setValue(height);
    }
  }, [offen, height, verschiebung]);

  // Runterwischen: Ab 80 Punkten gilt es als Schließen, alles darunter
  // schnappt zurück. Der Responder greift erst bei klarer Abwärtsbewegung,
  // damit Tippen auf Chips im Blatt nicht als Wischen gedeutet wird.
  const wischen = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, geste) => geste.dy > 12 && Math.abs(geste.dx) < Math.abs(geste.dy),
      onPanResponderMove: (_e, geste) => {
        if (geste.dy > 0) verschiebung.setValue(geste.dy);
      },
      onPanResponderRelease: (_e, geste) => {
        if (geste.dy > 80) {
          beimSchliessen();
        } else {
          Animated.timing(verschiebung, { toValue: 0, duration: 150, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={offen} transparent animationType="none" onRequestClose={beimSchliessen}>
      <Pressable style={styles.hintergrund} onPress={beimSchliessen} accessibilityLabel="Blatt schließen" />
      <Animated.View
        style={[
          styles.blatt,
          { backgroundColor: palette.surface, transform: [{ translateY: verschiebung }] },
        ]}
        {...wischen.panHandlers}
      >
        <View style={[styles.grabber, { backgroundColor: palette.border }]} />
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hintergrund: {
    flex: 1,
    backgroundColor: 'rgba(17, 28, 34, 0.38)',
  },
  blatt: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 28,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
});
