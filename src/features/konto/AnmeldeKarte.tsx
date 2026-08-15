/**
 * Der Anmeldebereich in den Einstellungen.
 *
 * Bewusst hier und nicht an der Terminansicht: Wer sich nie anmeldet, soll
 * die App benutzen wie bisher. Die Anmeldung ist ein Zusatz für Mitglieder,
 * keine Hürde vor dem Kalender.
 *
 * Kein Passwort: Die API schickt einen Link an die hinterlegte Adresse. Der
 * Einladungscode ist nur beim ersten Mal nötig — wer schon ein Konto hat,
 * gibt bloß seine Adresse ein.
 *
 * Zwei Fehlerquellen laufen hier zusammen, aber es gibt nur eine Banner-
 * Zeile: der eigene Formularfehler (Anfordern schlug fehl) und
 * `einloesenFehlgeschlagen` aus dem Kontext (der zuletzt angetippte Link
 * ließ sich nicht einlösen). Ohne Letzteres passierte nach dem Antippen
 * eines abgelaufenen Links schlicht gar nichts — die Karte blieb einfach
 * bei „Schau in dein Postfach" stehen.
 *
 * Der Abonnement-Schalter für Jugendtrainings sitzt bewusst hier und nicht
 * im Jugendbereich selbst: Der Zustand hängt am Konto, nicht am Bildschirm,
 * und gehört deshalb neben den Abmelden-Knopf, nicht in eine Liste, die man
 * beim Blättern verlässt.
 */

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { beschreibeAnfordernFehler } from '../../konto/anfordernFehler';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Label } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { beschreibeJugendFehler } from '../jugend/jugendFehler';

export function AnmeldeKarte() {
  const { palette } = useTheme();
  const {
    angemeldet,
    laedt,
    anmeldungAnfordern,
    abmelden,
    // Umbenannt, weil `email` in dieser Datei schon das Formularfeld ist —
    // zwei Bedeutungen für ein Wort in einer Komponente.
    email: kontoEmail,
    zuletztEingeloest,
    einloesenFehlgeschlagen,
    jugendBenachrichtigung,
    setzeJugendBenachrichtigung,
  } = useKonto();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [angefordert, setAngefordert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Eigene Fehlerzeile für den Abonnement-Schalter: Er lebt in derselben
  // Karte wie das Anmeldeformular, aber unabhängig davon — ein Fehlschlag
  // beim Umschalten hat nichts mit einem gescheiterten Anmeldeversuch zu tun.
  const [jugendFehler, setJugendFehler] = useState<string | null>(null);

  // Der Stand von `zuletztEingeloest` beim ersten Einhängen der Karte.
  // `useRef` merkt sich nur den allerersten Aufrufwert — ändert sich
  // `zuletztEingeloest` danach, wurde genau während dieser Sitzung der Karte
  // ein Link eingelöst, und die kurze Bestätigung unten ist angebracht. War
  // die Anmeldung schon vorher da (Einstellungen frisch geöffnet, längst
  // angemeldet), bleibt es bei der ruhigen Standardmeldung.
  const anfangswert = useRef(zuletztEingeloest).current;
  const geradeEingeloggt = zuletztEingeloest !== null && zuletztEingeloest !== anfangswert;

  if (laedt) return null;

  async function schalteJugendBenachrichtigung(an: boolean) {
    setJugendFehler(null);
    try {
      await setzeJugendBenachrichtigung(an);
    } catch (ursache) {
      // `setzeJugendBenachrichtigung` hat die Anzeige schon zurückgenommen —
      // hier fehlt nur noch der Satz, warum.
      setJugendFehler(beschreibeJugendFehler(ursache));
    }
  }

  if (angemeldet) {
    // Design „6b": eine ruhige Zeile — Adresse links, Abmelden rechts als
    // Umriss-Knopf. Der Schalter für neue Jugendtrainings ist von hier in
    // die Gruppe „Benachrichtigungen" gezogen, wo er inhaltlich hingehört.
    return (
      <Card>
        <View style={styles.kontoZeile}>
          <View style={styles.kontoText}>
            <Text style={[styles.zustand, { color: palette.text }]}>
              {kontoEmail ?? (geradeEingeloggt ? 'Angemeldet.' : 'Du bist angemeldet.')}
            </Text>
            <Text style={[styles.hinweis, { color: palette.textMuted }]}>
              Angemeldet — du kannst dich zu Touren an- und abmelden.
            </Text>
          </View>
          <Pressable
            onPress={() => void abmelden()}
            accessibilityLabel="Abmelden"
            style={({ pressed }) => [
              styles.abmelden,
              { borderColor: palette.border, backgroundColor: pressed ? palette.surfaceMuted : 'transparent' },
            ]}
          >
            <Text style={[styles.abmeldenText, { color: palette.text }]}>Abmelden</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  async function anfordern() {
    setFehler(null);
    setLaeuft(true);
    try {
      await anmeldungAnfordern(email.trim(), code.trim() || undefined);
      setAngefordert(true);
    } catch (ursache) {
      // Nicht pauschal „nicht erreichbar": Die API antwortet zwar bei jeder
      // *gültigen* Anfrage gleich, weist eine ungültige Adresse aber mit 400
      // und einem eigenen Satz ab. Wer sich vertippt, würde sonst zum Warten
      // geschickt statt zum Korrigieren. Siehe `anfordernFehler.ts`.
      setFehler(beschreibeAnfordernFehler(ursache));
    } finally {
      setLaeuft(false);
    }
  }

  // Der eigene Formularfehler antwortet auf die Handlung von gerade eben und
  // hat deshalb Vorrang vor einem möglicherweise älteren, fehlgeschlagenen
  // Einlöseversuch. Nie beide gleichzeitig zeigen.
  const anzeigeFehler = fehler ?? einloesenFehlgeschlagen;

  return (
    <Card>
      <Label>Mein Konto</Label>

      {anzeigeFehler ? (
        <View style={styles.banner}>
          <Banner tone="danger" text={anzeigeFehler} />
        </View>
      ) : null}

      {angefordert ? (
        <>
          <Text style={[styles.zustand, { color: palette.text }]}>Schau in dein Postfach.</Text>
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Wenn die Angaben stimmen, ist eine Mail an {email.trim()} unterwegs. Tipp den Link
            darin an — er gilt 15 Minuten.
          </Text>
          <View style={styles.knopf}>
            <ActionButton
              label="Nochmal versuchen"
              tone="secondary"
              onPress={() => setAngefordert(false)}
            />
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Als Mitglied kannst du dich zu Touren anmelden. Du bekommst einen Link per Mail —
            ein Passwort brauchst du nicht.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="deine@adresse.de"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="Einladungscode (nur beim ersten Mal)"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <View style={styles.knopf}>
            <ActionButton
              label={laeuft ? 'Wird angefordert …' : 'Link anfordern'}
              onPress={() => void anfordern()}
            />
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  zustand: {
    fontFamily: font.semibold,
    fontSize: fontSize.lg,
    marginTop: spacing.sm,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  schalterZeile: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  schalterText: {
    flex: 1,
  },
  titel: {
    fontFamily: font.semibold,
    fontSize: fontSize.md,
  },
  feld: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  banner: {
    marginTop: spacing.md,
  },
  kontoZeile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  kontoText: { flex: 1 },
  abmelden: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  abmeldenText: { fontFamily: font.semibold, fontSize: fontSize.sm },
  knopf: {
    marginTop: spacing.lg,
  },
});
