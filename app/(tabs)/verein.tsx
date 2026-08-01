/**
 * Der Reiter "Verein" — wer wir sind, was es gibt, wie man mitmacht.
 *
 * Alle Angaben verlinken auf mtb-bielefeld.de. Die Website bleibt die
 * verbindliche Quelle; die App gibt sie nur bequemer wieder.
 */

import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CALENDAR_SUBSCRIBE_URL, CONTACT } from '../../src/config';
import { CLUB_INTRO, CLUB_SECTIONS, MEMBERSHIP_FEES, ORGA_TEAM_NOTE } from '../../src/content/club';
import { fontSize, spacing } from '../../src/theme';
import { ActionButton, Card } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

/** Öffnet Web-Adressen im eingebetteten Browser, alles andere (mailto:) im System. */
function open(url: string) {
  if (url.startsWith('http')) {
    void WebBrowser.openBrowserAsync(url);
  } else {
    void Linking.openURL(url);
  }
}

export default function VereinScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <View>
        <Text style={[styles.name, { color: palette.text }]}>MTB Bielefeld e.V.</Text>
        <Text style={[styles.intro, { color: palette.textMuted }]}>{CLUB_INTRO}</Text>
      </View>

      {CLUB_SECTIONS.map((abschnitt) => (
        <Card key={abschnitt.title}>
          <Text style={[styles.abschnittTitel, { color: palette.text }]}>{abschnitt.title}</Text>
          {abschnitt.paragraphs.map((absatz) => (
            <Text key={absatz.slice(0, 24)} style={[styles.absatz, { color: palette.text }]}>
              {absatz}
            </Text>
          ))}
          <LinkZeile label={abschnitt.sourceLabel} onPress={() => open(abschnitt.sourceUrl)} />
        </Card>
      ))}

      <Card>
        <Text style={[styles.abschnittTitel, { color: palette.text }]}>Mitglied werden</Text>

        {MEMBERSHIP_FEES.entries.map((eintrag) => (
          <View key={eintrag.label} style={styles.beitragszeile}>
            <Text style={[styles.beitragLabel, { color: palette.text }]}>{eintrag.label}</Text>
            <Text style={[styles.beitragBetrag, { color: palette.primary }]}>{eintrag.amount}</Text>
          </View>
        ))}

        <Text style={[styles.stichtag, { color: palette.textMuted }]}>
          Jahresbeiträge, Stand {MEMBERSHIP_FEES.effectiveFrom}. Verbindlich ist die Website.
        </Text>

        <Text style={[styles.zwischenTitel, { color: palette.text }]}>Enthalten</Text>
        {MEMBERSHIP_FEES.benefits.map((vorteil) => (
          <View key={vorteil} style={styles.aufzaehlung}>
            <Ionicons name="checkmark-circle-outline" size={15} color={palette.accent} />
            <Text style={[styles.aufzaehlungText, { color: palette.text }]}>{vorteil}</Text>
          </View>
        ))}

        <View style={styles.knopfreihe}>
          <ActionButton label="Jetzt Mitglied werden" onPress={() => open(MEMBERSHIP_FEES.signupUrl)} />
          <ActionButton
            label="Beiträge auf der Website"
            tone="secondary"
            onPress={() => open(MEMBERSHIP_FEES.overviewUrl)}
          />
        </View>

        <Text style={[styles.hinweis, { color: palette.textMuted }]}>{ORGA_TEAM_NOTE}</Text>
      </Card>

      <Card>
        <Text style={[styles.abschnittTitel, { color: palette.text }]}>Kontakt & Links</Text>
        <LinkZeile label="Kontakt aufnehmen" icon="mail-outline" onPress={() => open(CONTACT.contactPage)} />
        <LinkZeile label="Instagram" icon="logo-instagram" onPress={() => open(CONTACT.instagram)} />
        <LinkZeile label="mtb-bielefeld.de" icon="globe-outline" onPress={() => open(CONTACT.website)} />
        <LinkZeile
          label="Vereinskalender abonnieren"
          icon="calendar-outline"
          onPress={() => open(CALENDAR_SUBSCRIBE_URL)}
        />
        <LinkZeile label="Impressum" icon="document-text-outline" onPress={() => open(CONTACT.imprint)} />
        <LinkZeile label="Datenschutz" icon="lock-closed-outline" onPress={() => open(CONTACT.privacy)} />
      </Card>
    </ScrollView>
  );
}

function LinkZeile({
  label,
  icon = 'open-outline',
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkZeile, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={palette.primary} />
      <Text style={[styles.linkText, { color: palette.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
  },
  intro: {
    fontSize: fontSize.md,
    lineHeight: 23,
    marginTop: spacing.sm,
  },
  abschnittTitel: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  zwischenTitel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  absatz: {
    fontSize: fontSize.md,
    lineHeight: 23,
    marginBottom: spacing.md,
  },
  beitragszeile: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  beitragLabel: {
    flex: 1,
    fontSize: fontSize.md,
  },
  beitragBetrag: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  stichtag: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  aufzaehlung: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 3,
  },
  aufzaehlungText: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: 21,
  },
  knopfreihe: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  hinweis: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.lg,
  },
  linkZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontSize: fontSize.md,
    fontWeight: '500',
  },
});
