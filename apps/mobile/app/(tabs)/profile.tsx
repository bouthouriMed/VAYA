import { View, StyleSheet } from 'react-native';
import { Text, Avatar } from '@vaya/design-system';
import { Screen } from '@vaya/design-system';

export default function ProfileScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={styles.container}>
        <Avatar name="VAYA User" size="lg" />
        <Text variant="h3">Profile</Text>
        <Text variant="body" color="#616161">
          Your account settings
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 12,
  },
});
