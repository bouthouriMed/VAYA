import { Stack, router } from 'expo-router';
import { TouchableOpacity, Text } from 'react-native';
import { colors, spacing } from '@vaya/design-system';

function CloseButton(): React.JSX.Element {
  return (
    <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ padding: spacing.xs }}>
      <Text style={{ fontSize: 22, color: colors.gray700 }}>✕</Text>
    </TouchableOpacity>
  );
}

export default function SearchLayout(): React.JSX.Element {
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
      <Stack.Screen name="results" options={{ title: '' }} />
      <Stack.Screen name="cluster" options={{ title: '' }} />
      <Stack.Screen
        name="trust"
        options={{ title: '', presentation: 'modal', headerLeft: () => <CloseButton /> }}
      />
    </Stack>
  );
}
