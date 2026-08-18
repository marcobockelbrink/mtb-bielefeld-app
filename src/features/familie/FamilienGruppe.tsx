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
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { altersTag, holeProfile, statusZeile, type Profil } from '../../data/familie';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, spacing } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { Banner, Card, Gruppe, Zeile } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from '../jugend/jugendFehler';

export function FamilienGruppe() {
  const { palette } = useTheme();
  const { angemeldet, api } = useKonto();

  const [profile, setProfile] = useState<Profil[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);


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

  if (!angemeldet) return null;


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
            {/* Das Chevron versprach einen Bildschirm und oeffnete ein
                Alert-Menue mit zwei Punkten. Jetzt loest es ein. */}
            <Pressable
              onPress={() => router.push(`/familie/${profil.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${profil.name ?? 'Profil'} bearbeiten`}
              style={styles.profilZeile}
            >
              {/* `profil.avatarUrl` ist ein Serverpfad, keine ladbare Adresse —
                  ohne `bildQuelle` blieb es bei den Initialen, obwohl ein
                  Bild gesetzt war. */}
              <Avatar
                name={profil.name ?? '?'}
                uri={profil.avatarUrl ? api.bildQuelle(profil.avatarUrl).uri : null}
                size={40}
              />
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

        {/* Zwei Zeilen statt eines Knopfs (Handoff 11, Teil B): Die Art
            steht damit in der Adresse, und jede Seite zeigt nur ihre
            eigenen Felder. „Weitere Eltern eintragen" ist dadurch ein
            Formular mit zwei Feldern statt mit fünf, von denen drei nicht
            gelten. */}
        {([
          ['kind', 'Kind anlegen'],
          ['erwachsen', 'Erwachsenen einladen'],
        ] as const).map(([art, label]) => (
          <Zeile key={art}>
            <Pressable
              onPress={() => router.push({ pathname: '/familie/neu', params: { art } })}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={styles.hinzufuegen}
            >
              <Ionicons name="add" size={20} color={palette.primary} />
              <Text style={[styles.hinzufuegenText, { color: palette.primary }]}>{label}</Text>
              <View style={styles.schieber} />
              <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
            </Pressable>
          </Zeile>
        ))}
      </Card>


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
  // Schiebt das Chevron an den rechten Rand, ohne die Zeile zu dehnen.
  schieber: { flex: 1 },
  hinzufuegen: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  hinzufuegenText: { fontFamily: font.semibold, fontSize: 15 },
  dialog: { borderRadius: 14, padding: 24, alignItems: 'center', width: '100%' },
});
