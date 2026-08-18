import { View, StyleSheet } from 'react-native';
import { Text } from '@vaya/design-system';
import { Screen } from '@vaya/design-system';

export default function TripsScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="h3">My Trips</Text>
        <Text variant="body" color="#616161">
          Your upcoming and past trips
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
});
