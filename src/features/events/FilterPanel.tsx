/**
 * Die Filterleiste über der Terminliste.
 *
 * Aufklappbar statt als eigener Bildschirm: Wer filtert, will die Wirkung
 * sofort sehen. Die Sterne-Filter sind als "höchstens" formuliert, weil das
 * die tatsächliche Frage ist — "was traue ich mir zu", nicht "was suche ich
 * genau".
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EventCategory, SkillLevel } from '../../domain/types';
import { categoryDisplay, fontSize, levelDisplay, radius, spacing } from '../../theme';
import { Chip } from '../../ui/components';
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
        >
          <Ionicons name={expanded ? 'chevron-up' : 'options-outline'} size={16} color={palette.primary} />
          <Text style={[styles.aufklappenText, { color: palette.primary }]}>
            Filter{anzahl > 0 ? ` (${anzahl})` : ''}
          </Text>
        </Pressable>

        {anzahl > 0 ? (
          <Pressable onPress={() => onChange({ ...emptyFilter })} accessibilityRole="button">
            <Text style={[styles.zuruecksetzen, { color: palette.textMuted }]}>Zurücksetzen</Text>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.bereich}>
          <FilterGruppe titel="Art">
            {KATEGORIEN.map((kategorie) => (
              <Chip
                key={kategorie}
                label={`${categoryDisplay[kategorie].icon} ${categoryDisplay[kategorie].label}`}
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

          <FilterGruppe titel="Fahrtechnik höchstens">
            {[1, 2, 3].map((sterne) => (
              <Chip
                key={sterne}
                label={'⭐'.repeat(sterne)}
                selected={filter.maxTechniqueStars === sterne}
                onPress={() => setStars('maxTechniqueStars', sterne)}
              />
            ))}
          </FilterGruppe>

          <FilterGruppe titel="Ausdauer höchstens">
            {[1, 2, 3].map((sterne) => (
              <Chip
                key={sterne}
                label={'⭐'.repeat(sterne)}
                selected={filter.maxEnduranceStars === sterne}
                onPress={() => setStars('maxEnduranceStars', sterne)}
              />
            ))}
          </FilterGruppe>

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
  const { palette } = useTheme();
  return (
    <View style={styles.gruppe}>
      <Text style={[styles.gruppenTitel, { color: palette.textMuted }]}>{titel}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  suchzeile: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sucheingabe: {
    flex: 1,
    fontSize: fontSize.md,
    paddingVertical: 2,
  },
  kopfzeile: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aufklappen: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  aufklappenText: {
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  zuruecksetzen: {
    fontSize: fontSize.sm,
  },
  bereich: {
    gap: spacing.lg,
  },
  gruppe: {
    gap: spacing.sm,
  },
  gruppenTitel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
