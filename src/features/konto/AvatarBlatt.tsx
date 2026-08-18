/**
 * Das Bild-Auswahl-Blatt — Design „8b" (15.08.2026).
 *
 * Drei Wege, und der dritte ist ausdrücklich gleichwertig: **„Initialen
 * behalten"** ist kein Zurücksetzen, sondern ein gültiger Dauerzustand. Wer
 * kein Foto von sich in der App will, soll das wählen können, ohne dass es
 * nach Verzicht aussieht.
 *
 * Verkleinert wird vor dem Senden (wie bei den Albumbildern); den
 * quadratischen Zuschnitt auf 256×256 macht der Server — Avatare sind klein,
 * es gibt keinen Grund, Originale hochzuladen.
 */

import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ausDatei } from '../../data/dateiUpload';
import { meldeDiagnose } from '../../data/diagnose';
import { entferneAvatar, setzeAvatar } from '../../data/familie';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, spacing } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { Blatt } from '../../ui/Blatt';
import { useTheme } from '../../ui/theme';
import { beschreibeUploadFehler, type UploadSchritt } from '../fotos/uploadFehler';
import { beschreibeJugendFehler } from '../jugend/jugendFehler';

/** 512 statt 256: Der Server schneidet zu, ein wenig Reserve schadet nicht. */
const VORBEREITUNG_KANTE = 512;

export function AvatarBlatt({
  offen,
  beimSchliessen,
  mitgliedId,
  name,
  avatarUrl,
  beimAendern,
}: {
  offen: boolean;
  beimSchliessen: () => void;
  mitgliedId: string;
  name: string;
  avatarUrl: string | null;
  beimAendern: () => void | Promise<void>;
}) {
  const { palette } = useTheme();
  const { api } = useKonto();
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function ausWaehler(quelle: 'kamera' | 'galerie') {
    const erlaubnis =
      quelle === 'kamera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!erlaubnis.granted) {
      setFehler(
        quelle === 'kamera'
          ? 'Ohne Kamera-Erlaubnis geht es nicht — in den Systemeinstellungen freigeben.'
          : 'Ohne Zugriff auf die Fotos geht es nicht — in den Systemeinstellungen freigeben.',
      );
      return;
    }

    const auswahl =
      quelle === 'kamera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
    if (auswahl.canceled || !auswahl.assets[0]) return;

    setLaeuft(true);
    setFehler(null);
    // Welcher Schritt gerade läuft. Bis zum 16.08.2026 meldete jeder
    // Fehler hier „Der Verein ist gerade nicht erreichbar" — auch wenn er
    // aus der Bildverarbeitung kam und nie eine Anfrage gestellt wurde.
    // Siehe `features/fotos/uploadFehler.ts`.
    let schritt: UploadSchritt = 'vorbereiten';
    try {
      const kontext = ImageManipulator.ImageManipulator.manipulate(auswahl.assets[0].uri);
      kontext.resize({ width: VORBEREITUNG_KANTE });
      const bild = await kontext.renderAsync();
      const fertig = await bild.saveAsync({
        format: ImageManipulator.SaveFormat.JPEG,
        compress: 0.9,
      });

      schritt = 'senden';
      await setzeAvatar(api, mitgliedId, ausDatei(fertig.uri));
      await beimAendern();
      beimSchliessen();
    } catch (ursache) {
      setFehler(beschreibeUploadFehler(ursache, schritt));
      // Siehe `data/diagnose.ts` — Behelfsbrücke, bis der Fehler gefunden ist.
      meldeDiagnose(
        api,
        `avatar/${schritt}`,
        `${ursache instanceof Error ? `${ursache.name}: ${ursache.message}` : String(ursache)}`,
      );
    } finally {
      setLaeuft(false);
    }
  }

  async function initialenBehalten() {
    setLaeuft(true);
    setFehler(null);
    try {
      await entferneAvatar(api, mitgliedId);
      await beimAendern();
      beimSchliessen();
    } catch (ursache) {
      setFehler(beschreibeJugendFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  const zeilen: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; tun: () => void }> = [
    { icon: 'camera', label: 'Foto aufnehmen', tun: () => void ausWaehler('kamera') },
    { icon: 'images', label: 'Aus Galerie wählen', tun: () => void ausWaehler('galerie') },
    { icon: 'text', label: 'Initialen behalten', tun: () => void initialenBehalten() },
  ];

  return (
    <Blatt offen={offen} beimSchliessen={beimSchliessen}>
      <View style={styles.kopf}>
        <Avatar name={name} uri={avatarUrl ? api.bildQuelle(avatarUrl).uri : null} size={84} />
        <Text style={[styles.titel, { color: palette.text }]}>Profilbild für {name}</Text>
      </View>

      {fehler ? <Text style={[styles.fehler, { color: palette.danger }]}>{fehler}</Text> : null}

      {laeuft ? (
        <ActivityIndicator style={styles.laden} />
      ) : (
        zeilen.map((zeile) => (
          <Pressable
            key={zeile.label}
            onPress={zeile.tun}
            accessibilityLabel={zeile.label}
            style={({ pressed }) => [
              styles.zeile,
              { backgroundColor: pressed ? palette.surfaceMuted : palette.surface },
            ]}
          >
            <Ionicons
              name={zeile.icon}
              size={22}
              color={zeile.icon === 'text' ? palette.textMuted : palette.primary}
            />
            <Text style={[styles.zeilenText, { color: palette.text }]}>{zeile.label}</Text>
          </Pressable>
        ))
      )}

      <Pressable onPress={beimSchliessen} style={styles.abbrechen} accessibilityLabel="Abbrechen">
        <Text style={[styles.abbrechenText, { color: palette.textMuted }]}>Abbrechen</Text>
      </Pressable>
    </Blatt>
  );
}

const styles = StyleSheet.create({
  kopf: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  titel: { fontFamily: font.semibold, fontSize: fontSize.lg },
  zeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  zeilenText: { fontFamily: font.semibold, fontSize: fontSize.md },
  laden: { marginVertical: spacing.lg },
  abbrechen: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  abbrechenText: { fontFamily: font.semibold, fontSize: fontSize.md },
  fehler: { fontFamily: font.regular, fontSize: fontSize.sm, marginBottom: spacing.sm },
});
