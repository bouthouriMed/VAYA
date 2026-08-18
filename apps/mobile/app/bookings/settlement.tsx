import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Chip, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { DRIVERS, CONTRIBUTION_DT, HOME_TO_DIGITAL_CENTER } from '../../src/mocks/seed-data';

const TAGS = ['Ponctuel', 'Agréable', 'Fiable'];

export default function SettlementScreen(): React.JSX.Element {
  const driver = DRIVERS.sarra!;
  const insets = useSafeAreaInsets();
  const [stars, setStars] = useState(4);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Ponctuel']);

  function toggleTag(tag: string): void {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing['3xl'] }]}>
        <Text variant="h1" color={colors.navyText} align="center">
          Bienvenue à {HOME_TO_DIGITAL_CENTER.destinationLabel}.
        </Text>
      </View>

      <View style={styles.sheet}>
        <Text variant="h3">Réflechissez à ce trajet avec {driver.fullName.split(' ')[0]}.</Text>

        <View style={styles.settleRow}>
          <Text variant="bodySmall" color={colors.gray600}>
            Réglez directement
          </Text>
          <Text variant="h3">{CONTRIBUTION_DT} DT</Text>
        </View>

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setStars(n)}>
              <Text style={[styles.star, n <= stars && styles.starFilled]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text variant="label" color={colors.gray600}>
          Tags rapides
        </Text>
        <View style={styles.tagRow}>
          {TAGS.map((tag) => (
            <TouchableOpacity key={tag} onPress={() => toggleTag(tag)}>
              <Chip label={tag} tone={selectedTags.includes(tag) ? 'default' : 'dim'} />
            </TouchableOpacity>
          ))}
        </View>

        <Button
          label="Terminer"
          size="lg"
          onPress={() => router.replace('/(tabs)/explore')}
          style={styles.cta}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  hero: {
    backgroundColor: colors.navySurface,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    marginTop: -radii['2xl'],
    padding: spacing.xl,
    gap: spacing.md,
  },
  settleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  stars: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  star: {
    fontSize: 32,
    color: colors.gray300,
  },
  starFilled: {
    color: colors.secondary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
    marginTop: 'auto',
  },
});
