import { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';

export default function PhoneScreen(): React.JSX.Element {
  const [phone, setPhone] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h2">Entrez votre numéro</Text>
        <Text variant="body" color={colors.gray600}>
          Nous vous envoyons un code de vérification.
        </Text>
      </View>

      <View style={styles.inputRow}>
        <Text style={styles.prefix}>+216</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="5X XXX XXX"
          placeholderTextColor={colors.gray500}
          keyboardType="phone-pad"
          style={styles.input}
          autoFocus
        />
      </View>

      <Button
        label="Envoyer le code"
        size="lg"
        disabled={phone.trim().length < 8}
        onPress={() => router.push('/(auth)/otp')}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing['2xl'],
  },
  header: {
    gap: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    height: 56,
    gap: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  prefix: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    color: colors.gray900,
  },
  cta: {
    width: '100%',
  },
});
