/**
 * Die Sperre bei einer zu alten App (Handoff 16, Abschnitt 16a).
 *
 * Sie liegt **über** der Navigation, nicht darin: Ein Bildschirm im Stapel
 * ließe sich wegwischen, und der Sinn ist gerade, dass es keinen Weg
 * dahinter gibt. Wer hier landet, würde bei jedem Aufruf ohnehin ein `426`
 * bekommen — eine App, die man bedienen kann und die bei jedem Tippen
 * einen Fehler zeigt, ist schlimmer als eine, die ehrlich sagt, dass sie
 * nicht mehr geht.
 *
 * ## Warum das selten sein muss
 *
 * Der Server sperrt erst unterhalb von `MINDEST_APP_VERSION`, und die
 * steht in der Umgebung, nicht im Quelltext (siehe `api/src/version.ts`).
 * Wer sie bei jedem Release anhebt, sperrt Eltern am Trainingsmorgen aus,
 * und beim dritten Mal installiert niemand mehr freiwillig etwas.
 */

import { Ionicons } from '@expo/vector-icons';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_VERSION } from '../../data/api';
import { font, fontSize, radius, spacing } from '../../theme';
import { useTheme } from '../../ui/theme';

/**
 * Der Weg in den App Store.
 *
 * `itms-apps://` öffnet die Store-App direkt statt über den Browser — ohne
 * das Schema landet man auf einer Webseite, die dann ihrerseits fragt, ob
 * sie den Store öffnen darf. Zwei Tipps für etwas, das keinen Umweg
 * verträgt: Wer hier steht, kann sonst nichts mehr tun.
 *
 * Ohne Kennung im Store gibt es noch keine Adresse — dann führt der Knopf
 * auf die Suche, und das ist ehrlicher als ein Link ins Leere. Sobald die
 * App veröffentlicht ist, gehört die Kennung hierher.
 */
const STORE_ADRESSE =
  Platform.OS === 'ios'
    ? 'itms-apps://itunes.apple.com/de/app/id0000000000'
    : 'market://details?id=de.mtbbielefeld.app';

export function VersionsSperre({ mindestVersion }: { mindestVersion: string }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.rahmen,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}
    >
      <Ionicons name="arrow-up-circle-outline" size={64} color={palette.primary} />

      <Text style={[styles.titel, { color: palette.text }]}>Diese App ist zu alt</Text>

      <Text style={[styles.text, { color: palette.textMuted }]}>
        Der Verein hat etwas geändert, mit dem diese Fassung nicht mehr zurechtkommt. Ein Update im
        App Store bringt dich wieder rein — deine Anmeldung bleibt bestehen.
      </Text>

      <Pressable
        onPress={() => void Linking.openURL(STORE_ADRESSE)}
        accessibilityRole="button"
        accessibilityLabel="Im App Store aktualisieren"
        style={({ pressed }) => [
          styles.knopf,
          { backgroundColor: pressed ? '#1b587a' : palette.primary },
        ]}
      >
        <Text style={[styles.knopfText, { color: palette.onPrimary }]}>
          Im App Store aktualisieren
        </Text>
      </Pressable>

      {/*
        Die beiden Nummern klein darunter: Wer anruft, weil es nicht geht,
        wird als Erstes danach gefragt — und muss sie sonst in den
        Einstellungen suchen, die er von hier aus nicht erreicht.
      */}
      <Text style={[styles.fussnote, { color: palette.textMuted }]}>
        Deine Fassung {APP_VERSION} · nötig ist {mindestVersion}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rahmen: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  titel: { fontFamily: font.display, fontSize: fontSize.xl, textAlign: 'center' },
  text: { fontFamily: font.regular, fontSize: fontSize.md, lineHeight: 24, textAlign: 'center' },
  knopf: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  knopfText: { fontFamily: font.semibold, fontSize: fontSize.md },
  fussnote: { fontFamily: font.regular, fontSize: fontSize.xs },
});
