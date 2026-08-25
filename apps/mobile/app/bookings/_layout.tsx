import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@vaya/design-system';

export default function BookingsLayout(): React.JSX.Element {
  const { t } = useTranslation();
  
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.gray100 },
        headerShadowVisible: false,
        headerTintColor: colors.gray900,
        headerTitleStyle: { fontWeight: '700' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="[bookingId]" options={{ headerShown: false }} />
      <Stack.Screen name="confirmed" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="pending" options={{ title: '' }} />
      <Stack.Screen name="pickup" options={{ title: '' }} />
      <Stack.Screen name="live" options={{ title: t('activeTrip.title') }} />
      <Stack.Screen
        name="settlement"
        options={{
          title: '',
          headerTransparent: true,
          headerTintColor: colors.navyText,
        }}
      />
    </Stack>
  );
}
