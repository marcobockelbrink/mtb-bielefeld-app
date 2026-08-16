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
 *
 * ## Tastaturfest seit dem 16.08.2026
 *
 * Aus der Beta gemeldet: „Wenn man in der Familie weitere Eltern einträgt,
 * geht die Tastatur über die Eingabe und man sieht nichts." Ein `Modal`
 * erbt das Tastaturverhalten des Bildschirms **nicht** — die Tastatur legt
 * sich schlicht darüber, und was unter den Rand rutscht, war unerreichbar.
 * Drei Dinge beheben das, und alle drei sind nötig:
 *
 * - `KeyboardAvoidingView` hebt das Blatt auf die Tastatur.
 * - Der Inhalt liegt in einer `ScrollView`, das Blatt ist auf 62 % der
 *   Höhe begrenzt. Angeschnittener Inhalt ist der Hinweis, dass es
 *   weitergeht.
 * - `keyboardShouldPersistTaps="handled"` — **nicht optional**: Ohne das
 *   verschluckt der erste Tipp auf einen Schalter oder Chip nur die
 *   Tastatur, und das Antippen muss wiederholt werden. Genau so ein
 *   „einmal ins Leere tippen" fällt niemandem als Fehler auf; es fühlt
 *   sich nur billig an.
 *
 * Der `PanResponder` sitzt seither auf der **Griff-Zeile**, nicht mehr auf
 * dem ganzen Blatt: Über dem gesamten Blatt fräße er die Scroll-Gesten der
 * `ScrollView` — das Wischen zum Schließen hätte das Scrollen unmöglich
 * gemacht.
 */

import { useEffect, useRef } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { spacing } from '../theme';
import { useTheme } from './theme';

/**
 * Anteil der Bildschirmhöhe, den ein Blatt höchstens einnimmt.
 *
 * Ohne Grenze wüchse es mit seinem Inhalt bis über den oberen Rand hinaus
 * und wäre kein Blatt mehr, sondern ein schlecht sitzender Bildschirm.
 */
const HOECHSTANTEIL = 0.62;

export function Blatt({
  offen,
  beimSchliessen,
  children,
  leiste,
}: {
  offen: boolean;
  beimSchliessen: () => void;
  children: ReactNode;
  /**
   * Feste Zone am Blattboden für die Hauptaktion — sie scrollt nicht mit.
   *
   * Ohne sie stünde der Absende-Knopf am Ende des Inhalts und wäre das
   * erste, was hinter der Tastatur verschwindet. Bleibt sie weg, verhält
   * sich das Blatt wie zuvor.
   */
  leiste?: ReactNode;
}) {
  const { palette } = useTheme();
  const { height } = useWindowDimensions();
  const einfuegungen = useSafeAreaInsets();
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
      {/* Der Hintergrund liegt als Geschwister **unter** dem Blatt, nicht
          um es herum — sonst schlösse jeder Tipp im Blatt es mit. */}
      <Pressable style={styles.hintergrund} onPress={beimSchliessen} accessibilityLabel="Blatt schließen" />
      <KeyboardAvoidingView
        // `padding` auf iOS, `height` auf Android: Android schiebt das
        // Fenster in der Voreinstellung selbst, und beides zusammen
        // hübe das Blatt doppelt an.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.heber}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.blatt,
            {
              backgroundColor: palette.surface,
              maxHeight: height * HOECHSTANTEIL,
              transform: [{ translateY: verschiebung }],
            },
          ]}
        >
          {/* Die Griff-Zeile trägt den Wisch-Responder — und ist mit
              `paddingVertical` 20 pt hoch genug zum Treffen, während der
              Strich optisch 4 pt bleibt. */}
          <View {...wischen.panHandlers} style={styles.griffzeile}>
            <View style={[styles.grabber, { backgroundColor: palette.border }]} />
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.inhalt,
              // Ohne Leiste trägt der Inhalt selbst den Abstand zum
              // unteren Rand samt Home-Indikator; mit Leiste tut das die
              // Leiste, und derselbe Abstand zweimal wäre eine Lücke.
              { paddingBottom: leiste ? spacing.md : einfuegungen.bottom + spacing.lg },
            ]}
          >
            {children}
          </ScrollView>

          {leiste ? (
            <View
              style={[
                styles.leiste,
                {
                  borderTopColor: palette.border,
                  paddingBottom: einfuegungen.bottom + spacing.sm,
                },
              ]}
            >
              {leiste}
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  hintergrund: {
    // Absolut statt `flex: 1`: Er liegt jetzt **unter** dem Heber, statt
    // ihn nach unten zu drücken — sonst teilten sich beide die Höhe.
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17, 28, 34, 0.38)',
  },
  heber: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  blatt: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    // Weder oben noch unten gepolstert: Den Abstand nach oben trägt die
    // Griff-Zeile (deren Polsterung zugleich die Trefffläche ist), den
    // nach unten je nach Fall der Inhalt oder die Leiste.
  },
  griffzeile: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  inhalt: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  leiste: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
});
