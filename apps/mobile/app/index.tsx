import { View, StyleSheet } from 'react-native';
import { Text, Button, Card } from '@vaya/design-system';
import { Link } from 'expo-router';

export default function HomeScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text variant="h2" align="center">
          VAYA
        </Text>
        <Text variant="body" color="#616161" align="center">
          Carpooling marketplace for Tunisia
        </Text>
      </Card>
      <Link href="/(tabs)/explore" asChild>
        <Button label="Get Started" size="lg" onPress={() => {}} />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 20,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
});
