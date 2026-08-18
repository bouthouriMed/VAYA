import { View, StyleSheet } from 'react-native';
import { Text, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { useEffect } from 'react';

export default function LiveScreen(): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(() => router.replace('/bookings/settlement'), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <MapPreview height={300} badge="● En route" style={styles.map} />

      <View style={styles.card}>
        <Text variant="h1">24 min</Text>
        <Text variant="body" color={colors.gray600}>
          Arrivée à 08:52 · Tunis Digital Center
        </Text>
        <View style={styles.track}>
          <View style={styles.trackFill} />
        </View>
        <Text variant="bodySmall" color={colors.gray600} style={styles.footnote}>
          3 personnes voyagent ensemble sur ce trajet.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  map: {
    borderRadius: 0,
    flex: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.xl,
    gap: spacing.xs,
  },
  track: {
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  trackFill: {
    width: '46%',
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radii.full,
  },
  footnote: {
    marginTop: spacing.sm,
  },
});
