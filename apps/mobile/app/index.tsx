import { View, StyleSheet } from 'react-native';
import { Text, Button, colors, spacing } from '@vaya/design-system';
import { router } from 'expo-router';

export default function WelcomeScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text variant="h1" style={styles.wordmark}>
          arc.
        </Text>
        <Text variant="body" color={colors.gray600} align="center">
          Un espace pour le trajet, pas pour la carte.
        </Text>
      </View>
      <Button
        label="Commencer"
        size="lg"
        onPress={() => router.push('/(auth)/phone')}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['2xl'],
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing['4xl'],
  },
  wordmark: {
    color: colors.gray900,
    fontWeight: '700',
  },
  cta: {
    width: '100%',
  },
});
