/**
 * Was nur Guides in der Einzelansicht sehen und tun.
 *
 * Wer zugesagt und wer abgesagt hat, die eigene Antwort, der
 * Veröffentlichen-Knopf für einen Entwurf und die Absage mit Pflichtgrund —
 * alles Aktionen, die die API ohnehin nur Guides erlaubt (`GET /konto`,
 * Feld `rolle`, siehe `KontoContext`). Diese Karte erscheint nur, wenn
 * `app/jugend/[id].tsx` das schon geprüft hat; sie prüft selbst nichts
 * nach — das wäre eine zweite, überflüssige Kopie derselben Anzeigehilfe.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  sageAb,
  setzeGuideAntwort,
  veroeffentliche,
  type TrainingDetails,
} from '../../data/jugend';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from './jugendFehler';
import { beschreibeGuide, beschreibeStand, eigeneZusage } from './zusagen';

export function GuideKarte({
  training,
  onGeaendert,
}: {
  training: TrainingDetails;
  /** Lädt das Training neu — Zusage, Veröffentlichen und Absage ändern alle seinen Zustand. */
  onGeaendert: () => void;
}) {
  const { palette } = useTheme();
  const { api, mitgliedId } = useKonto();
  const router = useRouter();

  const guides = training.guides ?? [];
  const abgesagt = training.zustand === 'abgesagt';

  /**
   * Die eigene Antwort — `null` heißt „noch nicht beantwortet".
   *
   * **Sie stand vorher nirgends.** „Du hast zugesagt." war eine Meldung
   * unmittelbar nach dem Tippen; wer die Seite neu öffnete, sah seine
   * eigene Antwort nicht mehr und musste raten, ob der Tipp gezählt hat.
   * Genau das kam aus der Beta zurück.
   *
   * Kein neuer Endpunkt nötig: Die Liste liegt schon vor, nur wurde nie
   * die eigene Zeile darin gesucht.
   */
  const meineAntwort = eigeneZusage(guides, mitgliedId);

  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState<'antwort' | 'veroeffentlichen' | 'absagen' | null>(null);
  const [zeigtAbsageform, setZeigtAbsageform] = useState(false);
  const [grund, setGrund] = useState('');

  async function antworte(zusage: boolean) {
    setMeldung(null);
    setLaeuft('antwort');
    try {
      await setzeGuideAntwort(api, training.id, zusage);
      // **Keine Bestätigungsmeldung mehr.** Der Zustand steht jetzt am Feld
      // selbst, und ein Kasten daneben, der dasselbe noch einmal sagt, ist
      // eine Zeile, die man beim zweiten Mal nicht mehr liest. Fehler
      // melden sich weiterhin — die sieht man nirgendwo sonst.
      setMeldung(null);
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(null);
    }
  }

  async function veroeffentlichen() {
    setMeldung(null);
    setLaeuft('veroeffentlichen');
    try {
      await veroeffentliche(api, training.id);
      setMeldung({ text: 'Veröffentlicht. Alle Mitglieder sehen das Training jetzt.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(null);
    }
  }

  async function absagen() {
    setMeldung(null);
    setLaeuft('absagen');
    try {
      await sageAb(api, training.id, grund);
      setZeigtAbsageform(false);
      setGrund('');
      setMeldung({ text: 'Abgesagt. Alle angemeldeten Eltern bekommen eine Mail mit dem Grund.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(null);
    }
  }

  return (
    <Card>
      <Label>Guides</Label>

      <Text style={[styles.hinweis, { color: palette.text }]}>
        {training.guideZusagen} von {training.guidesNoetig} Guides haben zugesagt
      </Text>
      {/*
        `guidesNoetig` ist eine Anzeige, keine Bedingung — ob das reicht,
        hängt an Strecke, Alter und Wetter und ist die Entscheidung der
        Guides. Deshalb steht unten kein gesperrter Veröffentlichen-Knopf,
        der eine Regel erfände, die es nicht gibt.
      */}
      <Text style={[styles.kleingedrucktes, { color: palette.textMuted }]}>
        Das ist eine Anzeige, keine Bedingung — du entscheidest, ob es reicht.
      </Text>

      {guides.length === 0 ? (
        <Text style={[styles.leer, { color: palette.textMuted }]}>Noch niemand gefragt.</Text>
      ) : (
        guides.map((guide) => {
          // Punkt **und** Wort. Farbe allein trüge die Aussage sonst
          // allein — in der Sonne und bei Rot-Grün-Schwäche wäre sie dann
          // gar keine. Vorher standen hier gefüllte Pillen, die aussahen,
          // als könnte man sie antippen.
          const wort = beschreibeStand(guide.zusage);
          const farbe =
            guide.zusage === true
              ? palette.primary
              : guide.zusage === false
                ? palette.danger
                : palette.textMuted;

          return (
            <View key={guide.mitgliedId} style={styles.guideZeile}>
              <View style={[styles.punkt, { backgroundColor: farbe }]} />
              <Text style={[styles.guideName, { color: palette.text }]} numberOfLines={1}>
                {beschreibeGuide(guide, mitgliedId)}
              </Text>
              <Text style={[styles.guideStand, { color: farbe }]}>{wort}</Text>
            </View>
          );
        })
      )}

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone={meldung.fehler ? 'danger' : 'info'} text={meldung.text} />
        </View>
      ) : null}

      {/*
        Die eigene Verfügbarkeit: **eine** Wahl aus zwei Feldern, nicht zwei
        Aufrufe untereinander. Gefüllt ist, was gilt — der Zustand steht
        damit dort, wo man ihn ändert.
      */}
      {abgesagt ? null : (
        <View style={styles.wahl}>
          <Text style={[styles.wahlFrage, { color: palette.text }]}>Kannst du?</Text>
          <View style={styles.wahlReihe}>
            {[
              { zusage: true, label: 'Ich kann', farbe: palette.primary },
              { zusage: false, label: 'Ich kann nicht', farbe: palette.danger },
            ].map((feld) => {
              const gewaehlt = meineAntwort === feld.zusage;
              return (
                <Pressable
                  key={feld.label}
                  onPress={() => void antworte(feld.zusage)}
                  disabled={laeuft === 'antwort'}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: gewaehlt, disabled: laeuft === 'antwort' }}
                  accessibilityLabel={feld.label}
                  style={({ pressed }) => [
                    styles.wahlFeld,
                    {
                      backgroundColor: gewaehlt ? feld.farbe : 'transparent',
                      borderColor: gewaehlt ? feld.farbe : palette.border,
                      opacity: pressed || laeuft === 'antwort' ? 0.7 : 1,
                    },
                  ]}
                >
                  {/* Das Häkchen, damit die Aussage nicht allein an der
                      Farbe hängt. */}
                  {gewaehlt ? (
                    <Ionicons name="checkmark" size={18} color={palette.onPrimary} />
                  ) : null}
                  <Text
                    style={[
                      styles.wahlText,
                      { color: gewaehlt ? palette.onPrimary : palette.text },
                    ]}
                  >
                    {feld.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.kleingedrucktes, { color: palette.textMuted }]}>
            {laeuft === 'antwort'
              ? 'Wird gespeichert …'
              : meineAntwort === null
                ? 'Noch nicht beantwortet.'
                : 'Zum Ändern die andere Seite antippen.'}
          </Text>
        </View>
      )}

      {/*
        Ab hier geht es nicht mehr um mich, sondern um das ganze Training —
        acht Familien hängen daran. Die Linie und die Überschrift trennen
        die beiden Ebenen; vorher standen beide im selben Stapel und sahen
        gleich aus.
      */}
      <View style={[styles.organisator, { borderTopColor: palette.border }]}>
        <Text style={[styles.organisatorTitel, { color: palette.textMuted }]}>Als Organisator</Text>

        {training.zustand === 'entwurf' ? (
          <View style={styles.knopf}>
            {laeuft === 'veroeffentlichen' ? (
              <ActivityIndicator color={palette.primary} />
            ) : (
              <ActionButton
                label="Für Familien veröffentlichen"
                onPress={() => void veroeffentlichen()}
              />
            )}
          </View>
        ) : null}

        {abgesagt ? null : zeigtAbsageform ? (
          <View style={styles.absageform}>
            {/*
              Wörtlich aus der Aufgabenbeschreibung: Wer absagt, muss vorher
              wissen, dass acht Familien eine Mail bekommen — nicht erst danach.
            */}
            <Text style={[styles.kleingedrucktes, { color: palette.textMuted }]}>
              Alle angemeldeten Eltern bekommen eine Mail mit deinem Grund.
            </Text>
            <TextInput
              value={grund}
              onChangeText={setGrund}
              placeholder="Grund für die Absage"
              placeholderTextColor={palette.textMuted}
              multiline
              style={[
                styles.feld,
                { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            />
            <View style={styles.knopfReihe}>
              <ActionButton
                label="Abbrechen"
                tone="secondary"
                onPress={() => {
                  setZeigtAbsageform(false);
                  setGrund('');
                }}
              />
              {laeuft === 'absagen' ? (
                <ActivityIndicator color={palette.primary} />
              ) : (
                <ActionButton label="Training absagen" onPress={() => void absagen()} />
              )}
            </View>
          </View>
        ) : (
          // Flach und rot, nicht gefüllt: Ein Knopf, der so aussieht wie
          // „Veröffentlichen", lädt zum Antippen ein. Dieser hier soll das
          // ausdrücklich nicht.
          <Pressable
            onPress={() => setZeigtAbsageform(true)}
            accessibilityRole="button"
            style={styles.flacherKnopf}
          >
            <Text style={[styles.flacherKnopfText, { color: palette.danger }]}>
              Training absagen
            </Text>
          </Pressable>
        )}

        {/* Bearbeiten gibt es für Entwurf und veröffentlicht, **nicht** für
            abgesagt: `aendereTraining` hat `WHERE … AND zustand <> 'abgesagt'`,
            der Knopf liefe also ins Leere. Stand bis Handoff 14 als eigener
            Knopf oben auf der Seite — er gehört zu den Handlungen am ganzen
            Training und damit hierher. */}
        {abgesagt ? null : (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/jugend/[id]/bearbeiten', params: { id: training.id } })
            }
            accessibilityRole="button"
            style={styles.flacherKnopf}
          >
            <Text style={[styles.flacherKnopfText, { color: palette.primary }]}>
              Training bearbeiten
            </Text>
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hinweis: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
  },
  kleingedrucktes: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  leer: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  guideZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  guideName: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: fontSize.sm,
  },
  guideStand: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
  },
  punkt: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  wahl: {
    marginTop: spacing.lg,
  },
  wahlFrage: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
  },
  wahlReihe: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  wahlFeld: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    // Aus dem Handoff: mindestens 50 pt hoch. Draußen mit Handschuhen ist
    // das kein Luxus.
    minHeight: 50,
    paddingHorizontal: spacing.sm,
  },
  wahlText: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  organisator: {
    borderTopWidth: 2,
    marginTop: spacing.xl,
    paddingTop: spacing.md,
  },
  organisatorTitel: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  flacherKnopf: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 44,
  },
  flacherKnopfText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
  },
  banner: {
    marginTop: spacing.md,
  },
  knopfReihe: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  knopf: {
    marginTop: spacing.md,
  },
  absageform: {
    marginTop: spacing.md,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
