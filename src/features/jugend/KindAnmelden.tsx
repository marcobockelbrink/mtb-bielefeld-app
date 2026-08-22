/**
 * Ein Kind zu einem Jugendtraining anmelden.
 *
 * Der heikelste Teil des Jugendbereichs: Hier entscheiden Eltern, was andere
 * Vereinsmitglieder über ihr Kind erfahren. Deshalb der zweite Schalter mit
 * eigenem Erklärsatz statt eines stillen Standardwerts, und deshalb die
 * datensparsame Vorgabe — Vorname an, Nachname aus.
 *
 * Wie bei `TeilnahmeKarte` laufen Erfolg und Fehlschlag beide über `Banner`,
 * aber nie mit derselben `tone` — sonst stünde „Dieses Training ist voll." in
 * derselben ruhigen Vereinsfarbe da wie „Eingetragen.". Das ging dort schon
 * einmal schief.
 *
 * **Der Zustand kommt aus der API, nicht aus dem Arbeitsspeicher.** Das war
 * einmal anders: Die Komponente merkte sich die `kindId` aus der Antwort
 * selbst. Wer den Bildschirm verließ, konnte sein Kind danach nie wieder
 * abmelden — `DELETE …/kinder/:kindId` braucht genau diese Kennung. Seit
 * `kinder[].eigene` (siehe `src/data/jugend.ts`) steht nach einem Neustart
 * dasselbe da wie vorher, und beide Plätze sind erreichbar statt nur einer.
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { TrainingDetails } from '../../data/jugend';
import { aendereAnmeldung, meldeKindAb, meldeKindAn } from '../../data/jugend';
import { holeProfile, type Profil } from '../../data/familie';
import { useKonto } from '../../konto/KontoContext';
import { font, fontSize, radius, spacing } from '../../theme';
import { ActionButton, Banner, Card, Chip, Label } from '../../ui/components';
import { Blatt } from '../../ui/Blatt';
import { useTheme } from '../../ui/theme';
import { darfNochAnmelden, eigeneKinder } from './eigeneKinder';
import { beschreibeJugendFehler } from './jugendFehler';

export function KindAnmelden({
  training,
  onGeaendert,
}: {
  training: TrainingDetails;
  /**
   * Ruft der Elternbildschirm nach einer geglückten An- oder Abmeldung auf,
   * damit Belegung und Teilnehmerliste dort neu geladen werden. Schlägt
   * dieses Nachladen fehl, darf es die Bestätigung hier nicht mitreißen —
   * dafür ist es Sache des Elternbildschirms, das Nachladen wie
   * `TeilnahmeKarte.laden(false)` fehlertolerant zu halten, nicht diese
   * Komponente.
   */
  onGeaendert: () => void;
}) {
  const { palette } = useTheme();
  const { api } = useKonto();

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  // Die angelegten Familienprofile — ein Tipp trägt sie ein, statt den
  // Namen jedes Mal neu zu tippen. Wer kein Profil hat (Nachbarskind,
  // Besuch), nimmt weiter das Freitextfeld darunter: **beides** geht.
  const [profile, setProfile] = useState<Profil[]>([]);
  // Datensparsam als Standard: Vorname sichtbar, Nachname nicht. Wer mehr
  // zeigen will, tippt einmal.
  const [zeigtVorname, setZeigtVorname] = useState(true);
  const [zeigtNachname, setZeigtNachname] = useState(false);

  /**
   * Die Anmeldung, die gerade bearbeitet wird — samt eigener Feldwerte.
   *
   * Getrennt vom Anmeldeformular darüber: Beide gleichzeitig offen zu
   * haben ist möglich, und ein geteilter Zustand hätte die Eingaben des
   * einen ins andere geschrieben.
   */
  const [bearbeitet, setBearbeitet] = useState<{
    id: string;
    vorname: string;
    nachname: string;
    zeigtVorname: boolean;
    zeigtNachname: boolean;
  } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler: boolean } | null>(null);

  const trainingId = training.id;
  const meine = eigeneKinder(training);

  useEffect(() => {
    // Ein Fehlschlag bleibt still: Die Profile sind eine Abkürzung, kein
    // Weg — ohne sie funktioniert das Formular unverändert.
    void holeProfile(api).then(setProfile, () => setProfile([]));
  }, [api]);

  /**
   * Aus „Mika Meier" werden Vor- und Nachname.
   *
   * Ein Profil trägt einen Anzeigenamen, die Anmeldung zwei Felder. Bei
   * einem einzelnen Wort bleibt der Nachname leer — das ist gültig, und
   * einen zu erfinden wäre schlimmer.
   */
  /**
   * Welches Profil den Namen geliefert hat — `null`, wenn frei getippt.
   *
   * Wird beim ersten Zeichen von Hand wieder verworfen: Wer den
   * vorgeschlagenen Namen ändert, meint womöglich ein anderes Kind, und
   * eine stehengebliebene Kennung hinge die Anmeldung an die falsche
   * Einwilligung.
   */
  const [ausProfilId, setAusProfilId] = useState<string | null>(null);

  function ausProfil(profil: Profil) {
    const teile = (profil.name ?? '').trim().split(/\s+/).filter(Boolean);
    setVorname(teile[0] ?? '');
    setNachname(teile.slice(1).join(' '));
    setAusProfilId(profil.id);
  }

  async function anmelden() {
    setMeldung(null);
    setLaeuft(true);
    try {
      // `kindId` verknüpft die Anmeldung mit dem Familienprofil (Handoff
      // 15) — nur so kommt die Teilnehmerliste an die Bildrechte. Wer den
      // Namen frei tippt, hat keine; für dieses Kind gilt dann dauerhaft
      // „keine Fotos", und das ist richtig so: Es hat auch wirklich
      // niemand eingewilligt.
      await meldeKindAn(api, trainingId, {
        vorname,
        nachname,
        zeigtVorname,
        zeigtNachname,
        kindId: ausProfilId,
      });
      // Zurück auf die datensparsame Vorgabe. Das Formular bleibt stehen,
      // solange noch ein Platz frei ist — ein Elternteil mit zwei Kindern
      // tippt sonst zweimal denselben Weg über die Liste zurück.
      setVorname('');
      setNachname('');
      setAusProfilId(null);
      setZeigtVorname(true);
      setZeigtNachname(false);
      setMeldung({ text: 'Eingetragen.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  /**
   * Was **andere** von diesem Kind sehen.
   *
   * Dieselbe Regel wie in `api/src/jugendtraining.ts` (`holeKinder`): Der
   * Anfragende bekommt seine eigenen Kinder ungefiltert, die Freigabe
   * steuert nur die Sicht der anderen. Hier nachgebildet, damit vor dem
   * Ändern dasteht, was gilt — und nicht zwei Schalterzustände, aus denen
   * man es sich zusammenreimt.
   */
  function sichtbarerName(kindId: string): string {
    const k = bearbeitet?.id === kindId ? bearbeitet : null;
    const kind = meine.find((m) => m.id === kindId);
    if (!kind) return 'nichts';

    // Aus dem laufenden Formular, falls offen — sonst aus dem Stand der API.
    const teile = (kind.anzeige ?? '').trim().split(/\s+/).filter(Boolean);
    const vor = k ? k.vorname : (teile[0] ?? '');
    const nach = k ? k.nachname : teile.slice(1).join(' ');
    const zeigtV = k ? k.zeigtVorname : true;
    const zeigtN = k ? k.zeigtNachname : false;

    const sichtbar = [zeigtV ? vor : '', zeigtN ? nach : ''].filter(Boolean).join(' ');
    return sichtbar || 'nichts';
  }

  function bearbeiten(kind: { id: string; anzeige: string }) {
    const teile = kind.anzeige.trim().split(/\s+/).filter(Boolean);
    setMeldung(null);
    setBearbeitet({
      id: kind.id,
      vorname: teile[0] ?? '',
      nachname: teile.slice(1).join(' '),
      zeigtVorname: true,
      zeigtNachname: false,
    });
  }

  async function aenderungSpeichern() {
    if (!bearbeitet) return;
    setLaeuft(true);
    try {
      await aendereAnmeldung(api, trainingId, bearbeitet.id, {
        vorname: bearbeitet.vorname.trim(),
        nachname: bearbeitet.nachname.trim(),
        zeigtVorname: bearbeitet.zeigtVorname,
        zeigtNachname: bearbeitet.zeigtNachname,
      });
      setBearbeitet(null);
      setMeldung({ text: 'Geändert.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  async function abmelden(kindId: string) {
    setMeldung(null);
    setLaeuft(true);
    try {
      await meldeKindAb(api, trainingId, kindId);
      setMeldung({ text: 'Ausgetragen.', fehler: false });
      onGeaendert();
    } catch (ursache) {
      // Kein Zurücksetzen: Die Liste kommt beim nächsten Laden aus der API,
      // und ein Fehlschlag darf sie nicht so aussehen lassen, als wäre er
      // geglückt.
      setMeldung({ text: beschreibeJugendFehler(ursache), fehler: true });
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card>
      <Label>Kind anmelden</Label>

      {meldung ? (
        <View style={styles.banner}>
          <Banner tone={meldung.fehler ? 'danger' : 'info'} text={meldung.text} />
        </View>
      ) : null}

      {/*
        Während einer laufenden Anfrage ist **alles** weg und nur der
        Kringel da. `ActionButton` kennt kein `disabled` — Ausblenden ist in
        diesem Projekt die einzige Sperre, und ohne sie bliebe der Knopf
        drückbar: Wer im Funkloch zweimal tippt, dessen zweites `DELETE`
        trifft ein bereits abgemeldetes Kind, bekommt 404 „Diese Anmeldung
        gibt es nicht." und sieht einen roten Banner über einem Vorgang, der
        geglückt ist.
      */}
      {laeuft ? (
        <View style={styles.knopf}>
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : null}

      {/*
        Je eigenem Kind ein Knopf mit dem Namen daran. Der Name ist keine
        Zierde: Bei zwei Kindern wüsste sonst niemand, welches er gerade
        austrägt. Er steht hier ungefiltert, weil `holeKinder` dem
        Anfragenden das eigene Kind ungefiltert schickt (`api/src/`
        `jugendtraining.ts`) — die Freigabe regelt, was *andere* sehen.
      */}
      {!laeuft &&
        meine.map((kind) => (
          <View key={kind.id} style={styles.anmeldung}>
            <View style={styles.anmeldungText}>
              <Text style={[styles.anmeldungName, { color: palette.text }]}>{kind.anzeige}</Text>
              {/* Die Freigabe im Klartext statt als zwei Schalterzustaende,
                  die man sich zusammenreimen muss. */}
              <Text style={[styles.anmeldungFreigabe, { color: palette.textMuted }]}>
                Andere sehen: {sichtbarerName(kind.id)}
              </Text>
            </View>
            <Pressable
              onPress={() => bearbeiten(kind)}
              accessibilityRole="button"
              accessibilityLabel={`${kind.anzeige} ändern`}
              hitSlop={8}
            >
              <Text style={[styles.aendern, { color: palette.primary }]}>Ändern</Text>
            </Pressable>
          </View>
        ))}

      {darfNochAnmelden(training) && !laeuft ? (
        <>
          {/* Die eigenen Profile zuerst — der häufige Fall. Antippen füllt
              die Felder darunter, statt eine zweite Anmeldeart zu bauen:
              So sieht man vor dem Absenden, was eingetragen wird, und kann
              es noch ändern. */}
          {profile.length > 0 ? (
            <View style={styles.profile}>
              <Text style={[styles.profileLabel, { color: palette.textMuted }]}>Meine Familie</Text>
              <View style={styles.profilReihe}>
                {profile.map((profil) => (
                  <Chip
                    key={profil.id}
                    label={profil.name ?? 'Profil'}
                    selected={
                      (profil.name ?? '').trim() === `${vorname} ${nachname}`.trim() &&
                      vorname !== ''
                    }
                    onPress={() => ausProfil(profil)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <TextInput
            value={vorname}
            onChangeText={(wert) => {
              setVorname(wert);
              setAusProfilId(null);
            }}
            placeholder="Vorname"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />
          <TextInput
            value={nachname}
            onChangeText={(wert) => {
              setNachname(wert);
              setAusProfilId(null);
            }}
            placeholder="Nachname"
            placeholderTextColor={palette.textMuted}
            style={[
              styles.feld,
              { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface },
            ]}
          />

          <View style={styles.schalterZeile}>
            <Text style={[styles.schalterText, { color: palette.text }]}>Vorname zeigen</Text>
            <Switch
              value={zeigtVorname}
              onValueChange={setZeigtVorname}
              trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
              thumbColor={palette.surface}
            />
          </View>
          <View style={styles.schalterZeile}>
            <Text style={[styles.schalterText, { color: palette.text }]}>Nachname zeigen</Text>
            <Switch
              value={zeigtNachname}
              onValueChange={setZeigtNachname}
              trackColor={{ false: palette.surfaceMuted, true: palette.primary }}
              thumbColor={palette.surface}
            />
          </View>

          {/*
            Das ist keine Zierzeile, sondern die Einwilligung in Kurzform —
            wörtlich aus der Aufgabenbeschreibung, damit sie nicht
            unbeabsichtigt umformuliert wird.
          */}
          <Text style={[styles.hinweis, { color: palette.textMuted }]}>
            Andere Mitglieder sehen nur, was du hier freigibst. Die Guides sehen immer den vollen
            Namen — sie haben die Aufsicht und müssen wissen, wer dabei ist.
          </Text>

          <View style={styles.knopf}>
            <ActionButton label="Anmelden" onPress={() => void anmelden()} />
          </View>
        </>
      ) : null}

      {/* Das Ändern-Blatt. **Austragen steht hier drin**, als letzte Zeile
          und in `palette.danger` — vorher war es der einzige Knopf an einer
          Stelle, an der eigentlich eine Korrektur gebraucht wird. Wer einen
          Namen berichtigen wollte, fand nur „austragen". */}
      <Blatt
        offen={bearbeitet !== null}
        beimSchliessen={() => setBearbeitet(null)}
        leiste={
          bearbeitet ? (
            <ActionButton label="Speichern" onPress={() => void aenderungSpeichern()} />
          ) : undefined
        }
      >
        {bearbeitet ? (
          <>
            <Label>Anmeldung ändern</Label>

            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Vorname</Text>
            <TextInput
              value={bearbeitet.vorname}
              onChangeText={(wert) => setBearbeitet({ ...bearbeitet, vorname: wert })}
              accessibilityLabel="Vorname"
              style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
            />

            <Text style={[styles.feldLabel, { color: palette.textMuted }]}>Nachname</Text>
            <TextInput
              value={bearbeitet.nachname}
              onChangeText={(wert) => setBearbeitet({ ...bearbeitet, nachname: wert })}
              accessibilityLabel="Nachname"
              style={[styles.feld, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
            />

            <View style={styles.schalterZeile}>
              <Text style={[styles.schalterText, { color: palette.text }]}>Vorname zeigen</Text>
              <Switch
                value={bearbeitet.zeigtVorname}
                onValueChange={(wert) => setBearbeitet({ ...bearbeitet, zeigtVorname: wert })}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Vorname zeigen"
              />
            </View>
            <View style={styles.schalterZeile}>
              <Text style={[styles.schalterText, { color: palette.text }]}>Nachname zeigen</Text>
              <Switch
                value={bearbeitet.zeigtNachname}
                onValueChange={(wert) => setBearbeitet({ ...bearbeitet, zeigtNachname: wert })}
                trackColor={{ true: palette.primary }}
                accessibilityLabel="Nachname zeigen"
              />
            </View>

            <Text style={[styles.anmeldungFreigabe, { color: palette.textMuted }]}>
              Andere sehen dann: {sichtbarerName(bearbeitet.id)}
            </Text>

            {/* Die Frage, die sich in diesem Moment stellt. */}
            <Text style={[styles.anmeldungFreigabe, { color: palette.textMuted }]}>
              Der Platz bleibt bestehen — geändert wird die Anmeldung, nicht neu angemeldet.
            </Text>

            <Pressable
              onPress={() => {
                const id = bearbeitet.id;
                setBearbeitet(null);
                void abmelden(id);
              }}
              accessibilityRole="button"
              style={styles.austragen}
            >
              <Text style={[styles.austragenText, { color: palette.danger }]}>Vom Training austragen</Text>
            </Pressable>
          </>
        ) : null}
      </Blatt>
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: spacing.md,
  },
  profile: { marginBottom: spacing.md },
  profileLabel: {
    fontFamily: font.label,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  profilReihe: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  feldLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
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
  schalterZeile: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  schalterText: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
  },
  hinweis: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  knopf: {
    marginTop: spacing.lg,
  },
  anmeldung: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    minHeight: 44,
  },
  anmeldungText: { flex: 1 },
  anmeldungName: { fontFamily: font.semibold, fontSize: fontSize.md },
  anmeldungFreigabe: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  aendern: { fontFamily: font.semibold, fontSize: fontSize.sm },
  austragen: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, minHeight: 44 },
  austragenText: { fontFamily: font.semibold, fontSize: fontSize.md },
});
