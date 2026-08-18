import { View, StyleSheet } from 'react-native';
import {
  Text,
  Button,
  MapPreview,
  FieldCard,
  FieldRow,
  colors,
  spacing,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { CURRENT_USER, HOME_TO_DIGITAL_CENTER } from '../../src/mocks/seed-data';

export default function HomeSearchScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="body" color={colors.gray600}>
          Bonjour, {CURRENT_USER.fullName}
        </Text>
        <Text variant="h2">Où allons-nous aujourd&apos;hui ?</Text>
      </View>

      <MapPreview height={200} />

      <FieldCard>
        <FieldRow
          label="Départ"
          value={HOME_TO_DIGITAL_CENTER.originLabel}
          dotColor={colors.secondary}
        />
        <FieldRow
          label="Arrivée"
          value={HOME_TO_DIGITAL_CENTER.destinationLabel}
          dotColor={colors.primary}
          dotFilled={false}
          last
        />
      </FieldCard>

      <Button
        label="Rechercher"
        size="lg"
        onPress={() => router.push('/search/results')}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: 2,
  },
  cta: {
    width: '100%',
  },
});
