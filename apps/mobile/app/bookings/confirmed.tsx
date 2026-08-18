import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, colors, spacing } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { getDriverByKey } from '../../src/mocks/seed-data';

const ADVANCE_AFTER_MS = 1600;

export default function ConfirmedScreen(): React.JSX.Element {
  const { driverId } = useLocalSearchParams<{ driverId?: string }>();
  const driver = getDriverByKey(driverId);

  const badgeScale = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1.9,
          duration: 1100,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 1100,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    const timer = setTimeout(
      () => router.replace({ pathname: '/bookings/pending', params: { driverId } }),
      ADVANCE_AFTER_MS,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId]);

  return (
    <View style={styles.container}>
      <View style={styles.badgeWrap}>
        <Animated.View
          style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
        <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
          <Ionicons name="checkmark" size={40} color={colors.white} />
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: textOpacity }}>
        <Text variant="h2" align="center" style={styles.title}>
          Demande envoyée !
        </Text>
        <Text variant="body" color={colors.gray600} align="center" style={styles.subtitle}>
          {driver.fullName.split(' ')[0]} recevra une notification instantanée.
        </Text>
        <Text variant="bodySmall" color={colors.gray500} align="center">
          Vous serez averti dès qu&apos;elle répond.
        </Text>
      </Animated.View>
    </View>
  );
}

const BADGE_SIZE = 84;
const RING_SIZE = 84;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  badgeWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.secondaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xs,
  },
});
