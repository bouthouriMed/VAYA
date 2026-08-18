import { useState } from 'react';
import { View, StyleSheet, TextInput } from 'react-native';
import { Text, Button, colors, spacing, radii, typography } from '@vaya/design-system';
import { router } from 'expo-router';

const CODE_LENGTH = 6;

export default function OtpScreen(): React.JSX.Element {
  const [code, setCode] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h2">Entrez le code envoyé</Text>
        <Text variant="body" color={colors.gray600}>
          Un code à {CODE_LENGTH} chiffres a été envoyé par SMS.
        </Text>
      </View>

      <View style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.box, i < code.length && styles.boxFilled]}>
            <Text style={styles.boxText}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <TextInput
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH))}
        keyboardType="number-pad"
        style={styles.hiddenInput}
        autoFocus
        maxLength={CODE_LENGTH}
      />

      <Button
        label="Vérifier"
        size="lg"
        disabled={code.length < CODE_LENGTH}
        onPress={() => router.replace('/(tabs)/explore')}
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
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  box: {
    width: 44,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  boxFilled: {
    backgroundColor: colors.secondaryLight + '3D',
  },
  boxText: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  cta: {
    width: '100%',
  },
});
