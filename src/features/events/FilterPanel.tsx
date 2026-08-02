/**
 * Die Filterleiste über der Terminliste.
 *
 * Aufklappbar statt als eigener Bildschirm: Wer filtert, will die Wirkung
 * sofort sehen. Die Sterne-Filter sind als "höchstens" formuliert, weil das
 * die tatsächliche Frage ist — "was traue ich mir zu", nicht "was suche ich
 * genau".
 *
 * Die Sterne-Knöpfe zeigen denselben Einstufungsbalken wie die Terminkarte,
 * nur ohne Spanne. Filter und Ergebnis sprechen damit dieselbe Sprache: Wer
 * „zwei Felder" auswählt, sucht danach in der Liste nach zwei Feldern.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { EventCategory, SkillLevel } from '../../domain/types';
import { categoryDisplay, font, fontSize, levelDisplay, MAX_STARS, radius, spacing } from '../../theme';
import { Chip, Label } from '../../ui/components';
import { SpanMarks } from '../../ui/SkillSpan';
import { useTheme } from '../../ui/theme';
import { activeFilterCount, emptyFilter, type EventFilter } from './filter';

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

const STUFEN: SkillLevel[] = ['einsteiger', 'aufsteiger', 'fortgeschritten', 'koenner'];

const STERNE = Array.from({ length: MAX_STARS }, (_, index) => index + 1);

export function FilterPanel({
  filter,
  onChange,
  expanded,
  onToggleExpanded,
}: {
  filter: EventFilter;
  onChange: (filter: EventFilter) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { palette } = useTheme();
  const anzahl = activeFilterCount(filter);

  function toggleInList<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
  }

  /** Sterne-Filter: erneutes Antippen desselben Werts hebt ihn wieder auf. */
  function setStars(key: 'maxTechniqueStars' | 'maxEnduranceStars', value: number) {
    onChange({ ...filter, [key]: filter[key] === value ? undefined : value });
  }

  /** Die drei Sterne-Knöpfe einer Einstufung. */
  function SterneGruppe({
    titel,
    schluessel,
  }: {
    titel: string;
    schluessel: 'maxTechniqueStars' | 'maxEnduranceStars';
  }) {
    return (
      <FilterGruppe titel={`${titel} höchstens`}>
        {STERNE.map((sterne) => {
          const gewaehlt = filter[schluessel] === sterne;
          return (
            <Chip
              key={sterne}
              selected={gewaehlt}
              onPress={() => setStars(schluessel, sterne)}
              accessibilityLabel={`${titel} höchstens ${sterne} von ${MAX_STARS} Sternen`}
            >
              <SpanMarks min={sterne} max={sterne} tone={gewaehlt ? 'onPrimary' : 'grade'} />
            </Chip>
          );
        })}
      </FilterGruppe>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.suchzeile, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Ionicons name="search" size={17} color={palette.textMuted} />
        <TextInput
          value={filter.search}
          onChangeText={(search) => onChange({ ...filter, search })}
          placeholder="Termin, Ort oder Guide suchen"
          placeholderTextColor={palette.textMuted}
          style={[styles.sucheingabe, { color: palette.text }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {filter.search.length > 0 ? (
          <Pressable
            onPress={() => onChange({ ...filter, search: '' })}
            accessibilityRole="button"
            accessibilityLabel="Suche leeren"
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={17} color={palette.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.kopfzeile}>
        <Pressable
          onPress={onToggleExpanded}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.aufklappen}
          hitSlop={6}
        >
          <Ionicons name={expanded ? 'chevron-up' : 'options-outline'} size={15} color={palette.primary} />
          <Label tone="primary">Filter{anzahl > 0 ? ` (${anzahl})` : ''}</Label>
        </Pressable>

        {anzahl > 0 ? (
          <Pressable onPress={() => onChange({ ...emptyFilter })} accessibilityRole="button" hitSlop={6}>
            <Label>Zurücksetzen</Label>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.bereich}>
          <FilterGruppe titel="Art">
            {KATEGORIEN.map((kategorie) => (
              <Chip
                key={kategorie}
                icon={categoryDisplay[kategorie].icon}
                label={categoryDisplay[kategorie].label}
                selected={filter.categories.includes(kategorie)}
                onPress={() => onChange({ ...filter, categories: toggleInList(filter.categories, kategorie) })}
              />
            ))}
          </FilterGruppe>

          <FilterGruppe titel="Für wen">
            {STUFEN.map((stufe) => (
              <Chip
                key={stufe}
                label={levelDisplay[stufe]}
                selected={filter.levels.includes(stufe)}
                onPress={() => onChange({ ...filter, levels: toggleInList(filter.levels, stufe) })}
              />
            ))}
          </FilterGruppe>

          <SterneGruppe titel="Fahrtechnik" schluessel="maxTechniqueStars" />
          <SterneGruppe titel="Ausdauer" schluessel="maxEnduranceStars" />

          <FilterGruppe titel="Sonstiges">
            <Chip
              label="Nur Ladies only"
              selected={filter.ladiesOnly}
              onPress={() => onChange({ ...filter, ladiesOnly: !filter.ladiesOnly })}
            />
            <Chip
              label="Abgesagte anzeigen"
              selected={!filter.hideCancelled}
              onPress={() => onChange({ ...filter, hideCancelled: !filter.hideCancelled })}
            />
          </FilterGruppe>
        </View>
      ) : null}
    </View>
  );
}

function FilterGruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <View style={styles.gruppe}>
      <Label>{titel}</Label>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  suchzeile: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  sucheingabe: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm,
  },
  kopfzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aufklappen: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs + 1,
    paddingVertical: spacing.xs,
  },
  bereich: {
    gap: spacing.lg,
  },
  gruppe: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
