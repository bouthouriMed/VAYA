import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, colors, spacing } from '@vaya/design-system';
import { CURRENT_USER } from '../../src/mocks/seed-data';

export default function ProfileScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <Avatar name={CURRENT_USER.fullName} size="lg" />
        <Text variant="h3">{CURRENT_USER.fullName}</Text>
        <Text variant="body" color={colors.gray600}>
          Paramètres du compte
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing['2xl'],
  },
});
