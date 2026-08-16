/**
 * Einstellungen — im Wesentlichen die Erinnerungen.
 *
 * Kein Reiter mehr, sondern ein Blatt hinter dem Zahnrad im Kopf. Der Grund
 * ist gemessen, nicht gefühlt: Die Reiterleiste fasst vier Einträge, mit
 * einem fünften steht dort „EINSTELLUN…" (siehe `(tabs)/_layout.tsx`). Von
 * den vier Plätzen führten zwei an Orte, die man einmal besucht — und
 * Einstellungen ist der, den man am seltensten braucht.
 *
 * Hier liegt auch der Weg zur Mitgliederverwaltung — in eine Reiterleiste,
 * die jedes Mitglied sieht, gehört er nicht.
 *
 * Seit dem 15.08.2026 gruppiert („6b"): Abschnittsüberschriften über den
 * Karten, alles zu Benachrichtigungen in **einer** Karte statt in drei, und
 * der Vorlauf eingerückt unter seinem Schalter — die Tönung sagt, dass er
 * daran hängt. Reihenfolge: Benachrichtigungen, Verein, Konto, Daten. Was
 * man täglich stellt, steht oben; was man einmal ansieht, unten.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../src/data/AppDataContext';
import type { EventCategory } from '../src/domain/types';
import { formatAge } from '../src/features/events/format';
import { AnmeldeKarte } from '../src/features/konto/AnmeldeKarte';
import { beschreibeErlaubnis } from '../src/notifications/erlaubnisText';
import { useNotifications } from '../src/notifications/NotificationContext';
import { beschreibeVorlauf, naechsterErinnerterTermin } from '../src/notifications/scheduler';
import { LEAD_TIME_OPTIONS } from '../src/notifications/settings';
import { FamilienGruppe } from '../src/features/familie/FamilienGruppe';
import { FREIGRENZEN } from '../src/features/fotos/netz';
import { useUploadEinstellungen } from '../src/features/fotos/uploadEinstellungen';
import { beschreibeJugendFehler } from '../src/features/jugend/jugendFehler';
import { useKonto } from '../src/konto/KontoContext';
import { categoryDisplay, font, fontSize, spacing } from '../src/theme';
import { Blatt } from '../src/ui/Blatt';
import { ActionButton, Banner, Card, Chip, Gruppe, LoadingState, Zeile } from '../src/ui/components';
import { useTheme } from '../src/ui/theme';

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
  const { rolle, jugendBenachrichtigung, setzeJugendBenachrichtigung } = useKonto();
  const insets = useSafeAreaInsets();
  const { settings, loading, permitted, backgroundAvailable, update, letzteErlaubnis } =
    useNotifications();
  const { events, news } = useAppData();

  // Befund „H2": „2 Stunden vorher" ist eine Rechenaufgabe. Der Satz nimmt
  // sie ab — am nächsten Termin, der zu den gewählten Kategorien passt.
  const vorlaufSatz = useMemo(
    () =>
      beschreibeVorlauf(
        settings.leadMinutes,
        naechsterErinnerterTermin(events.data, settings),
      ),
    [settings, events.data],
  );

  // Befund „H1": Sprang der Schalter zurück, stand da nichts. Jetzt steht
  // dort, warum — und bei blockierten Mitteilungen ein Weg dorthin, wo es
  // sich ändern lässt.
  const erlaubnisHinweis = letzteErlaubnis ? beschreibeErlaubnis(letzteErlaubnis) : null;

  /**
   * In die Systemeinstellungen — im Browser gibt es die nicht.
   *
   * Dort wirft `openSettings()`, und ohne diesen Fänger wäre das eine
   * unbehandelte Zurückweisung in der Web-Fassung. Ein Knopf, der nichts
   * tut, ist dort das erträglichere Verhalten: Ein Browser hat keine
   * App-Berechtigungen, und die Web-Fassung schickt ohnehin keine
   * Erinnerungen.
   */
  function systemEinstellungenOeffnen() {
    void Linking.openSettings().catch(() => {});
  }

  const { werte: uploads, aendere: aendereUploads } = useUploadEinstellungen();
  const [kategorienBlatt, setKategorienBlatt] = useState(false);
  const [jugendFehler, setJugendFehler] = useState<string | null>(null);

  if (loading) return <LoadingState />;

  return (
    <>
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.inhalt, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {/* Reihenfolge nach „6b": Benachrichtigungen zuerst — das ist, was
          man hier wirklich einstellt. Konto und Daten stehen unten, weil
          man sie einmal ansieht und dann nie wieder. */}
      <FamilienGruppe />

      {/* Über den Benachrichtigungen: Wer Bilder von einer Tour mitbringt,
          stellt das einmal ein und will es dann gefunden haben. */}
      <Gruppe>Uploads</Gruppe>
      <Card>
        <Zeile erste>
          <View style={styles.schalterZeile}>
            <View style={styles.schalterText}>
              <Text style={[styles.titel, { color: palette.text }]}>Nur über WLAN hochladen</Text>
              <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                Fotos und Videos warten, bis du im WLAN bist — schont den Datentarif. Du kannst
                einzelne Uploads trotzdem sofort starten.
              </Text>
            </View>
            <Switch
              value={uploads.nurUeberWlan}
              onValueChange={(nurUeberWlan) => void aendereUploads({ nurUeberWlan })}
              trackColor={{ true: palette.primary }}
              accessibilityLabel="Nur über WLAN hochladen"
            />
          </View>
        </Zeile>

        {uploads.nurUeberWlan ? (
          <View style={[styles.unterbereich, { backgroundColor: palette.surfaceMuted }]}>
            <Text style={[styles.unterLabel, { color: palette.text }]}>
              Über Mobilfunk trotzdem erlauben bis
            </Text>
            <View style={styles.chips}>
              {FREIGRENZEN.map((grenze) => (
                <Chip
                  key={grenze.wert}
                  label={grenze.label}
                  selected={uploads.freigrenze === grenze.wert}
                  onPress={() => void aendereUploads({ freigrenze: grenze.wert })}
                />
              ))}
            </View>
            <Text style={[styles.hinweis, { color: palette.textMuted, marginTop: spacing.sm }]}>
              Kleine Bilder gehen sofort raus, große warten aufs WLAN.
            </Text>
          </View>
        ) : null}
      </Card>

      <Gruppe>Benachrichtigungen</Gruppe>
      <Card>
        <Zeile erste>
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

          {/* Zwei verschiedene Lagen, und beide waren vorher stumm:
              `erlaubnisHinweis` erklärt einen gerade zurückgesprungenen
              Schalter, der zweite Fall eine Erlaubnis, die nachträglich
              entzogen wurde — da steht der Schalter noch auf an. */}
          {erlaubnisHinweis ? (
            <View style={styles.bannerAbstand}>
              <Banner tone="warning" text={erlaubnisHinweis.text} />
              {erlaubnisHinweis.zuEinstellungen ? (
                <View style={styles.hinweisKnopf}>
                  <ActionButton
                    label="Handy-Einstellungen öffnen"
                    tone="secondary"
                    onPress={systemEinstellungenOeffnen}
                  />
                </View>
              ) : null}
            </View>
          ) : settings.enabled && !permitted ? (
            <View style={styles.bannerAbstand}>
              <Banner
                tone="warning"
                text="Mitteilungen sind für diese App in den Systemeinstellungen abgeschaltet. Ohne Erlaubnis erscheinen keine Erinnerungen."
              />
              <View style={styles.hinweisKnopf}>
                <ActionButton
                  label="Handy-Einstellungen öffnen"
                  tone="secondary"
                  onPress={systemEinstellungenOeffnen}
                />
              </View>
            </View>
          ) : null}
        </Zeile>

        {/* Eingerückt und getönt: Die Tönung sagt, dass alles hier am
            Schalter darüber hängt. Ist er aus, verschwindet der Bereich —
            ausgegraut stehen zu lassen hieße, etwas anzubieten, das nicht
            wirkt. */}
        {settings.enabled ? (
          <View style={[styles.unterbereich, { backgroundColor: palette.surfaceMuted }]}>
            <Text style={[styles.unterLabel, { color: palette.text }]}>Vorlauf</Text>
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
            <Text style={[styles.hinweis, { color: palette.textMuted, marginTop: spacing.sm }]}>
              {vorlaufSatz}
            </Text>

            <Pressable
              onPress={() => setKategorienBlatt(true)}
              accessibilityLabel="Wofür erinnern?"
              style={styles.navZeile}
            >
              <View style={styles.navText}>
                <Text style={[styles.titel, { color: palette.text }]}>Wofür erinnern?</Text>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  {settings.categories.length === 0
                    ? 'Alle Termine'
                    : settings.categories.map((k) => categoryDisplay[k].label).join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </Pressable>

            <View style={styles.absagenZeile}>
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
          </View>
        ) : null}

        {/* Aus der Konto-Karte hierher gezogen: Es ist eine
            Benachrichtigung, keine Kontoeinstellung. */}
        {jugendBenachrichtigung !== null ? (
          <Zeile>
            <View style={styles.schalterZeile}>
              <View style={styles.schalterText}>
                <Text style={[styles.titel, { color: palette.text }]}>Neue Jugendtrainings</Text>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  Per Mail, sobald ein neues Training veröffentlicht wird — die entstehen oft
                  kurzfristig.
                </Text>
              </View>
              <Switch
                value={jugendBenachrichtigung}
                onValueChange={(an) => {
                  setJugendFehler(null);
                  void setzeJugendBenachrichtigung(an).catch((ursache: unknown) =>
                    setJugendFehler(beschreibeJugendFehler(ursache)),
                  );
                }}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Benachrichtigung über neue Jugendtrainings"
              />
            </View>
            {jugendFehler ? (
              <View style={styles.bannerAbstand}>
                <Banner tone="danger" text={jugendFehler} />
              </View>
            ) : null}
          </Zeile>
        ) : null}
      </Card>

      {/* Nur mit der Rolle sichtbar — reine Anzeigehilfe, die API prüft
          bei jedem Aufruf selbst (dasselbe Muster wie die Guide-Knöpfe).
          Als Navigationszeile statt großem Knopf: Es führt woandershin,
          es tut nichts. */}
      {rolle === 'verwaltung' ? (
        <>
          <Gruppe>Verein</Gruppe>
          <Card>
            <Pressable
              onPress={() => router.push('/verwaltung')}
              accessibilityLabel="Mitglieder verwalten"
              style={styles.navZeile}
            >
              <View style={styles.navText}>
                <Text style={[styles.titel, { color: palette.text }]}>Mitglieder verwalten</Text>
                <Text style={[styles.hinweis, { color: palette.textMuted }]}>
                  Einladen, Rollen vergeben, Jugend-Zugehörigkeit pflegen.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={palette.primary} />
            </Pressable>
          </Card>
        </>
      ) : null}

      <Gruppe>Mein Konto</Gruppe>
      <AnmeldeKarte />

      <Gruppe>Daten</Gruppe>
      <Card>
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

    {/* Die Kategorien im Blatt statt auf einer eigenen Seite: dieselbe
        Mehrfachauswahl wie beim Themenfilter, und die Zeile davor zeigt
        schon, was gewählt ist. */}
    <Blatt offen={kategorienBlatt} beimSchliessen={() => setKategorienBlatt(false)}>
      <Text style={[styles.blattTitel, { color: palette.text }]}>Wofür erinnern?</Text>
      <Text style={[styles.hinweis, { color: palette.textMuted }]}>
        Ohne Auswahl wird an alle Termine erinnert.
      </Text>
      <View style={[styles.chips, styles.blattChips]}>
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
      <ActionButton label="Fertig" onPress={() => setKategorienBlatt(false)} />
    </Blatt>
    </>
  );
}

const styles = StyleSheet.create({
  unterbereich: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(183, 194, 200, 0.55)',
  },
  unterLabel: { fontFamily: font.semibold, fontSize: 13, marginBottom: spacing.sm },
  navZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  navText: { flex: 1 },
  absagenZeile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  blattTitel: { fontFamily: font.semibold, fontSize: fontSize.lg, marginBottom: spacing.xs },
  blattChips: { marginTop: spacing.md, marginBottom: spacing.lg },
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
  hinweisKnopf: {
    marginTop: spacing.sm,
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
