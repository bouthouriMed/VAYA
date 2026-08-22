import { useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { colors } from '@vaya/design-system';

// This tab never renders its own content — it exists so "publish a ride" is
// one tap from anywhere in the tab bar. Always opens the ride-creation
// wizard (driver/publish.tsx), whether or not the user has a driver profile
// yet — that screen itself handles the no-vehicle case (a shortened
// form → review path with an honest "available after verification"
// preview) and only routes into KYC onboarding when the driver actually
// tries to publish (stitch/verification/publish-verification-requirement-prompt.html).
// Profile's standalone "Become a driver" CTA remains a separate, direct
// entry into onboarding for someone who wants to verify without publishing
// a ride first.
export default function PublishTabScreen(): React.JSX.Element {
  useFocusEffect(
    useCallback(() => {
      router.replace('/driver/publish');
    }, []),
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
