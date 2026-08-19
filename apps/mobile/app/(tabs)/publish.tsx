import { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '@vaya/design-system';
import { useGetMyDriverProfileQuery } from '../../src/state/api';

// This tab never renders its own content — it exists so "publish a ride" is
// one tap from anywhere in the tab bar (the CTA card on trips.tsx/profile.tsx
// stays as an alternate entry point). Same driverProfile-existence gate those
// two use: routes straight into the publish flow for an onboarded driver, or
// into vehicle/KYC onboarding first for anyone else.
export default function PublishTabScreen(): React.JSX.Element {
  const { data: driverProfile, isLoading } = useGetMyDriverProfileQuery();

  useFocusEffect(
    useCallback(() => {
      if (isLoading) return;
      router.replace(driverProfile ? '/driver/publish' : '/driver/onboarding/vehicle');
    }, [isLoading, driverProfile]),
  );

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.secondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
});
