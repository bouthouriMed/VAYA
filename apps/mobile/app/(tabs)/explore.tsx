import { View, StyleSheet } from 'react-native';
import { Text } from '@vaya/design-system';
import { Screen } from '@vaya/design-system';

export default function ExploreScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={styles.container}>
        <Text variant="h3">Explore Trips</Text>
        <Text variant="body" color="#616161">
          Search for available rides in Tunisia
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
