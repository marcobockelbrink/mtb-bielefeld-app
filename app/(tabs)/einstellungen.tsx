/**
 * Einstellungen — im Wesentlichen die Erinnerungen.
 */

import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../../src/data/AppDataContext';
import type { EventCategory } from '../../src/domain/types';
import { formatAge } from '../../src/features/events/format';
import { useNotifications } from '../../src/notifications/NotificationContext';
import { LEAD_TIME_OPTIONS } from '../../src/notifications/settings';
import { categoryDisplay, font, fontSize, spacing } from '../../src/theme';
import { Banner, Card, Chip, LoadingState } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

const KATEGORIEN: EventCategory[] = [
  'tour',
  'fahrtechnik',
  'treff',
  'ausflug',
  'werkstatt',
  'jugend',
  'racing',
  'verein',
];

export default function EinstellungenScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, loading, permitted, backgroundAvailable, update } = useNotifications();
  const { events, news } = useAppData();

  if (loading) return <LoadingState />;

  return (
    <ScrollView contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Card>
        <View style={styles.schalterZeile}>
          <View style={styles.schalterText}>
            <Text style={[styles.titel, { color: palette.text }]}>Termin-Erinnerungen</Text>
            <Text style={[styles.hinweis, { color: palette.textMuted }]}>
              Das Handy erinnert dich rechtzeitig vor einem Termin. Die Erinnerungen entstehen auf
              dem Gerät — es wird nichts an den Verein oder an Dritte übertragen.
            </Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(enabled) => void update({ enabled })}
            trackColor={{ true: palette.primary }}
            accessibilityLabel="Termin-Erinnerungen einschalten"
          />
        </View>

        {settings.enabled && !permitted ? (
          <View style={styles.bannerAbstand}>
            <Banner
              tone="warning"
              text="Mitteilungen sind für diese App in den Systemeinstellungen abgeschaltet. Ohne Erlaubnis erscheinen keine Erinnerungen."
            />
          </View>
        ) : null}
      </Card>

      {settings.enabled ? (
        <>
          <Card>
            <Text style={[styles.titel, { color: palette.text }]}>Wann erinnern?</Text>
            <View style={styles.chips}>
              {LEAD_TIME_OPTIONS.map((option) => (
                <Chip
                  key={option.minutes}
                  label={option.label}
                  selected={settings.leadMinutes === option.minutes}
                  onPress={() => void update({ leadMinutes: option.minutes })}
                />
              ))}
            </View>
          </Card>

          <Card>
            <Text style={[styles.titel, { color: palette.text }]}>Wofür erinnern?</Text>
            <Text style={[styles.hinweis, { color: palette.textMuted }]}>
              Ohne Auswahl wird an alle Termine erinnert.
            </Text>
            <View style={styles.chips}>
              {KATEGORIEN.map((kategorie) => (
                <Chip
                  key={kategorie}
                  icon={categoryDisplay[kategorie].icon}
                  label={categoryDisplay[kategorie].label}
                  selected={settings.categories.includes(kategorie)}
                  onPress={() =>
                    void update({
                      categories: settings.categories.includes(kategorie)
                        ? settings.categories.filter((eintrag) => eintrag !== kategorie)
                        : [...settings.categories, kategorie],
                    })
                  }
                />
              ))}
            </View>
          </Card>

          <Card>
            <View style={styles.schalterZeile}>
              <View style={styles.schalterText}>
                <Text style={[styles.titel, { color: palette.text }]}>Bei Absagen melden</Text>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  Sagt der Verein einen vorgemerkten Termin ab, meldet sich die App — statt dass du
                  umsonst zum Treffpunkt fährst.
                </Text>
              </View>
              <Switch
                value={settings.notifyOnCancellation}
                onValueChange={(notifyOnCancellation) => void update({ notifyOnCancellation })}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Bei Absagen melden"
              />
            </View>

            {settings.notifyOnCancellation ? (
              <View style={styles.bannerAbstand}>
                {/*
                  Bewusst deutlich formuliert: Wann das Betriebssystem die App im
                  Hintergrund aufweckt, lässt sich nicht zusagen — besonders auf
                  iOS. Ein Versprechen, das die App nicht halten kann, wäre hier
                  schlimmer als gar keins.
                */}
                <Banner
                  tone={backgroundAvailable ? 'info' : 'warning'}
                  text={
                    backgroundAvailable
                      ? 'Die App sieht dazu etwa alle drei Stunden im Hintergrund nach. Wann genau, entscheidet das Betriebssystem — verlässlich ist nur der Blick in die App.'
                      : 'Dein Gerät lässt Aktualisierungen im Hintergrund derzeit nicht zu (etwa im Energiesparmodus). Absagen bemerkt die App dann erst, wenn du sie öffnest.'
                  }
                />
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      <Card>
        <Text style={[styles.titel, { color: palette.text }]}>Daten</Text>
        <View style={styles.datenZeile}>
          <Ionicons name="calendar-outline" size={15} color={palette.textMuted} />
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            {events.data.length} Termine · {formatAge(events.fetchedAt)}
          </Text>
        </View>
        <View style={styles.datenZeile}>
          <Ionicons name="newspaper-outline" size={15} color={palette.textMuted} />
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            {news.data.length} Beiträge · {formatAge(news.fetchedAt)}
          </Text>
        </View>
        <Text style={[styles.quelle, { color: palette.textMuted }]}>
          Termine stammen aus dem öffentlichen Vereinskalender, Beiträge aus dem RSS-Feed von
          mtb-bielefeld.de. Beides wird auf dem Gerät zwischengespeichert, damit die App auch ohne
          Empfang funktioniert.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inhalt: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  schalterZeile: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  schalterText: {
    flex: 1,
  },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  bannerAbstand: {
    marginTop: spacing.md,
  },
  datenZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quelle: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.lg,
  },
});
