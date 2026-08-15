/**
 * Die Gruppe „Meine Familie" in den Einstellungen — Design „7a"/„7b"/„7c".
 *
 * Ein Mitglied legt Profile für seine Kinder selbst an, damit die die App
 * eigenständig nutzen können, ohne dass die Verwaltung jedes Kind einzeln
 * einlädt.
 *
 * **Warum nicht einfach „Mail ans Kind":** Kinder haben oft keine eigene
 * Adresse — eine Bestätigung an ein leeres Postfach läuft ins Leere.
 * Deshalb ein **optionales** Mailfeld, das den Ablauf umschaltet: mit
 * eigener Adresse geht die Bestätigung ans Kind, ohne an die Eltern, die
 * die Zugangsdaten weiterreichen.
 *
 * Der Bestätigungs-Dialog nennt deshalb immer den **tatsächlichen**
 * Empfänger — das ist die Frage, die sich in dem Moment stellt.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  aendereProfil,
  altersTag,
  holeProfile,
  legeProfilAn,
  loescheProfil,
  statusZeile,
  type Profil,
} from '../../data/familie';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { Blatt } from '../../ui/Blatt';
import { ActionButton, Banner, Card, Gruppe, Zeile } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from '../jugend/jugendFehler';

export function FamilienGruppe() {
  const { palette } = useTheme();
  const { angemeldet, api } = useKonto();

  const [profile, setProfile] = useState<Profil[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [blattOffen, setBlattOffen] = useState(false);
  const [bestaetigung, setBestaetigung] = useState<{ name: string; an: string; eigene: boolean } | null>(
    null,
  );

  // Formularzustand des Blatts
  const [art, setArt] = useState<'kind' | 'erwachsen'>('kind');
  const [name, setName] = useState('');
  const [geburtsjahr, setGeburtsjahr] = useState('');
  const [email, setEmail] = useState('');
  const [darfHochladen, setDarfHochladen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const laden = useCallback(async () => {
    if (!angemeldet) return;
    try {
      setProfile(await holeProfile(api));
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    }
  }, [api, angemeldet]);

  // Beim ersten Rendern laden — die Gruppe steht in den Einstellungen, die
  // ohnehin selten geöffnet werden.
  useEffect(() => {
    void laden();
  }, [laden]);

  function blattOeffnen() {
    setArt('kind');
    setName('');
    setGeburtsjahr('');
    setEmail('');
    setDarfHochladen(false);
    setFehler(null);
    setBlattOffen(true);
  }

  async function anlegen() {
    if (name.trim() === '') return;
    setLaeuft(true);
    setFehler(null);
    try {
      const jahr = Number.parseInt(geburtsjahr, 10);
      const ergebnis = await legeProfilAn(api, {
        art,
        name: name.trim(),
        geburtsjahr: art === 'kind' && Number.isFinite(jahr) ? jahr : null,
        email: email.trim() || null,
        kannBilderHochladen: art === 'kind' ? darfHochladen : true,
      });
      setBlattOffen(false);
      setBestaetigung({
        name: name.trim(),
        an: ergebnis.bestaetigungAn,
        eigene: email.trim() !== '',
      });
      await laden();
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  function profilMenue(profil: Profil) {
    Alert.alert(profil.name ?? 'Profil', undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: profil.kannBilderHochladen ? 'Bilder-Upload sperren' : 'Bilder-Upload erlauben',
        onPress: () =>
          void aendereProfil(api, profil.id, { kannBilderHochladen: !profil.kannBilderHochladen })
            .then(laden, (u: unknown) => setFehler(beschreibeJugendFehler(u))),
      },
      {
        text: 'Profil löschen',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Profil löschen?', `${profil.name} verliert den Zugang — das geht nicht zurück.`, [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Löschen',
              style: 'destructive',
              onPress: () =>
                void loescheProfil(api, profil.id).then(laden, (u: unknown) =>
                  setFehler(beschreibeJugendFehler(u)),
                ),
            },
          ]),
      },
    ]);
  }

  if (!angemeldet) return null;

  const kannAnlegen = name.trim() !== '' && (art === 'kind' || email.trim() !== '');

  return (
    <>
      <Gruppe>Meine Familie</Gruppe>
      <Card>
        <Zeile erste>
          <Text style={[styles.erklaerung, { color: palette.textMuted }]}>
            Lege Profile für deine Kinder an, damit sie die App selbst nutzen können. Du verwaltest
            sie und siehst alle Termine gebündelt.
          </Text>
        </Zeile>

        {fehler ? (
          <Zeile>
            <Banner tone="warning" text={fehler} />
          </Zeile>
        ) : null}

        {profile?.map((profil) => (
          <Zeile key={profil.id}>
            <Pressable onPress={() => profilMenue(profil)} style={styles.profilZeile}>
              <Avatar name={profil.name ?? '?'} uri={profil.avatarUrl} size={40} />
              <View style={styles.profilText}>
                <View style={styles.profilKopf}>
                  <Text style={[styles.name, { color: palette.text }]}>{profil.name}</Text>
                  <View style={[styles.tag, { backgroundColor: palette.surfaceMuted }]}>
                    <Text style={[styles.tagText, { color: palette.textMuted }]}>
                      {profil.status === 'einladung_offen'
                        ? 'Einladung offen'
                        : altersTag(profil, new Date())}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.status, { color: palette.textMuted }]}>
                  {statusZeile(profil)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={palette.primary} />
            </Pressable>
          </Zeile>
        ))}

        <Zeile>
          <Pressable onPress={blattOeffnen} style={styles.hinzufuegen}>
            <Ionicons name="add" size={20} color={palette.primary} />
            <Text style={[styles.hinzufuegenText, { color: palette.primary }]}>
              Familienmitglied hinzufügen
            </Text>
          </Pressable>
        </Zeile>
      </Card>

      <Blatt offen={blattOffen} beimSchliessen={() => setBlattOffen(false)}>
        <Text style={[styles.blattTitel, { color: palette.text }]}>Familienmitglied hinzufügen</Text>

        {/* Der Schalter steuert alles Weitere: Bei „Kind" entsteht ein
            verwaltetes Profil mit optionaler Mail, bei „Erwachsener" ein
            eigenständiges Konto — und dafür ist die Adresse Pflicht. */}
        <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Wen legst du an?</Text>
        <View style={[styles.spur, { backgroundColor: palette.surfaceMuted }]}>
          {(
            [
              ['kind', 'Kind'],
              ['erwachsen', 'Erwachsener'],
            ] as const
          ).map(([wert, label]) => (
            <Pressable
              key={wert}
              onPress={() => setArt(wert)}
              style={[styles.segment, art === wert && { backgroundColor: palette.surface }]}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: art === wert ? palette.text : palette.textMuted },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Name</Text>
        <TextInput
          style={[styles.feld, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
          value={name}
          onChangeText={setName}
          placeholder="Mika"
          placeholderTextColor={palette.textMuted}
        />

        {art === 'kind' ? (
          <>
            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Geburtsjahr</Text>
            <TextInput
              style={[styles.feld, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
              value={geburtsjahr}
              onChangeText={setGeburtsjahr}
              placeholder="2015"
              placeholderTextColor={palette.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />
          </>
        ) : null}

        <Text style={[styles.feldLabel, { color: palette.textMuted }]}>
          {art === 'kind' ? 'E-Mail des Kindes — optional' : 'E-Mail — erforderlich'}
        </Text>
        <TextInput
          style={[styles.feld, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
          value={email}
          onChangeText={setEmail}
          placeholder="mika@example.org"
          placeholderTextColor={palette.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        {art === 'kind' ? (
          <>
            <View style={[styles.infoBox, { backgroundColor: palette.background }]}>
              <Ionicons name="information-circle" size={16} color={palette.primary} />
              <Text style={[styles.infoText, { color: palette.text }]}>
                <Text style={styles.fett}>Leer gelassen?</Text> Kein Problem — die Bestätigung geht
                an dein Postfach, und du gibst deinem Kind die Zugangsdaten weiter. Mit eigener Mail
                bekommt das Kind die Bestätigung direkt.
              </Text>
            </View>

            {/* Voreinstellung, keine Zwangsregel — der Schalter ist
                bedienbar, und die Sperre lässt sich später ändern. */}
            <View style={[styles.rechte, { borderColor: palette.border }]}>
              <Ionicons name="lock-closed" size={20} color={palette.textMuted} />
              <View style={styles.rechteText}>
                <Text style={[styles.name, { color: palette.text }]}>Kann Bilder hochladen</Text>
                <Text style={[styles.status, { color: palette.textMuted }]}>
                  Bei Kinderprofilen voreingestellt aus. Du kannst das später ändern.
                </Text>
              </View>
              <Switch
                value={darfHochladen}
                onValueChange={setDarfHochladen}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Kann Bilder hochladen"
              />
            </View>
          </>
        ) : null}

        <View style={styles.blattKnopf}>
          <ActionButton
            label={laeuft ? 'Wird angelegt …' : 'Anlegen & Bestätigung senden'}
            onPress={() => {
              if (kannAnlegen && !laeuft) void anlegen();
            }}
          />
        </View>
      </Blatt>

      {/* „7c": Der Dialog nennt den tatsächlichen Empfänger — das ist die
          Frage, die sich in diesem Moment stellt. */}
      <Modal visible={bestaetigung !== null} transparent animationType="fade">
        <View style={styles.dialogHintergrund}>
          <View style={[styles.dialog, { backgroundColor: palette.surface }]}>
            <View style={styles.dialogKreis}>
              <Ionicons name="mail-unread" size={30} color="#2f8a4e" />
            </View>
            <Text style={[styles.dialogTitel, { color: palette.text }]}>Bestätigung verschickt</Text>
            <Text style={[styles.dialogText, { color: palette.text }]}>
              Die Mail für {bestaetigung?.name} ging an{' '}
              <Text style={styles.fett}>{bestaetigung?.an}</Text>.
            </Text>
            <Text style={[styles.dialogSchritt, { color: palette.textMuted }]}>
              1. Link öffnen und das Profil bestätigen.
            </Text>
            {bestaetigung?.eigene ? null : (
              <Text style={[styles.dialogSchritt, { color: palette.textMuted }]}>
                2. Zugangsdaten weitergeben — das Profil erscheint dann in der App.
              </Text>
            )}
            <View style={styles.blattKnopf}>
              <ActionButton label="Verstanden" onPress={() => setBestaetigung(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  erklaerung: { fontFamily: font.regular, fontSize: fontSize.sm, lineHeight: 20 },
  profilZeile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profilText: { flex: 1 },
  profilKopf: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { fontFamily: font.semibold, fontSize: fontSize.md },
  tag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontFamily: font.label, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  status: { fontFamily: font.regular, fontSize: fontSize.sm, marginTop: 2 },
  hinzufuegen: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  hinzufuegenText: { fontFamily: font.semibold, fontSize: 15 },
  blattTitel: { fontFamily: font.semibold, fontSize: fontSize.lg, marginBottom: spacing.md },
  feldLabel: {
    fontFamily: font.label,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  feld: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 46,
    marginBottom: spacing.md,
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  spur: { flexDirection: 'row', borderRadius: 8, padding: 3, marginBottom: spacing.md },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 6 },
  segmentText: { fontFamily: font.semibold, fontSize: 15 },
  infoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 8,
    padding: 12,
    marginBottom: spacing.md,
  },
  infoText: { flex: 1, fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  fett: { fontFamily: font.semibold },
  rechte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: spacing.md,
  },
  rechteText: { flex: 1 },
  blattKnopf: { marginTop: spacing.sm },
  dialogHintergrund: {
    flex: 1,
    backgroundColor: 'rgba(17, 28, 34, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: { borderRadius: 14, padding: 24, alignItems: 'center', width: '100%' },
  dialogKreis: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eaf3ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  dialogTitel: { fontFamily: font.display, fontSize: 20, marginBottom: spacing.sm },
  dialogText: { fontFamily: font.regular, fontSize: fontSize.md, textAlign: 'center' },
  dialogSchritt: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
