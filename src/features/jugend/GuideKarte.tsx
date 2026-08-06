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

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  sageAb,
  setzeGuideAntwort,
  veroeffentliche,
  type TrainingDetails,
} from '../../data/jugend';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Badge, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from './jugendFehler';

export function GuideKarte({
  training,
  onGeaendert,
}: {
  training: TrainingDetails;
  /** Lädt das Training neu — Zusage, Veröffentlichen und Absage ändern alle seinen Zustand. */
  onGeaendert: () => void;
}) {
  const { palette } = useTheme();
  const { api } = useKonto();

  const guides = training.guides ?? [];
  const abgesagt = training.zustand === 'abgesagt';

  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  const [laeuft, setLaeuft] = useState<'antwort' | 'veroeffentlichen' | 'absagen' | null>(null);
  const [zeigtAbsageform, setZeigtAbsageform] = useState(false);
  const [grund, setGrund] = useState('');

  async function antworte(zusage: boolean) {
    setMeldung(null);
    setLaeuft('antwort');
    try {
      await setzeGuideAntwort(api, training.id, zusage);
      setMeldung({ text: zusage ? 'Du hast zugesagt.' : 'Du hast abgesagt.', fehler: false });
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
        <Text style={[styles.leer, { color: palette.textMuted }]}>Noch niemand geantwortet.</Text>
      ) : (
        guides.map((guide) => (
          <View key={guide.mitgliedId} style={styles.guideZeile}>
            <Text style={[styles.guideEmail, { color: palette.text }]} numberOfLines={1}>
              {guide.email}
            </Text>
            <Badge label={guide.zusage ? 'Zugesagt' : 'Abgesagt'} tone={guide.zusage ? 'primary' : 'neutral'} />
          </View>
        ))
      )}

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone={meldung.fehler ? 'danger' : 'info'} text={meldung.text} />
        </View>
      ) : null}

      {abgesagt ? null : (
        <View style={styles.knopfReihe}>
          {laeuft === 'antwort' ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <>
              <ActionButton label="Ich kann" onPress={() => void antworte(true)} />
              <ActionButton label="Ich kann nicht" tone="secondary" onPress={() => void antworte(false)} />
            </>
          )}
        </View>
      )}

      {training.zustand === 'entwurf' ? (
        <View style={styles.knopf}>
          {laeuft === 'veroeffentlichen' ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <ActionButton label="Veröffentlichen" onPress={() => void veroeffentlichen()} />
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
        <View style={styles.knopf}>
          <ActionButton label="Absagen" tone="secondary" onPress={() => setZeigtAbsageform(true)} />
        </View>
      )}
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
  guideEmail: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: fontSize.sm,
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
