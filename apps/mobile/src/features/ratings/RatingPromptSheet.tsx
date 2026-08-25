import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BottomSheet, Button, Chip, StarRatingInput, Text, useAppTheme, spacing } from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import type { RatingRole } from '../../state/api';

interface RatingPromptSheetProps {
  visible: boolean;
  onClose: () => void;
  role: RatingRole;
  counterpartName: string | null;
  onSubmit: (input: { stars: number; punctualityFlag?: boolean; comment?: string }) => Promise<void>;
}

/**
 * Phase 9's rating-submission bottom sheet (docs/roadmap/phase-09-ratings-trust.md's
 * UX behavior: "a bottom sheet, not a full-screen interrupt — low friction,
 * dismissible"). Reuses BottomSheet (Phase 2), StarRatingInput (this phase's
 * new primitive), and Chip (extended this phase with an optional onPress) —
 * no other new visual pattern, per the phase doc's "largely a data-wiring
 * task" framing.
 */
export function RatingPromptSheet({
  visible,
  onClose,
  role,
  counterpartName,
  onSubmit,
}: RatingPromptSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useAppTheme().colors;
  const [stars, setStars] = useState(0);
  const [punctual, setPunctual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const firstName = counterpartName?.split(' ')[0] ?? (role === 'rider_rates_driver' ? t('booking:driver') : t('booking:passenger'));
  const heading = t('booking:rating.title', { name: firstName });

  async function handleSubmit(): Promise<void> {
    if (stars < 1) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await onSubmit({ stars, punctualityFlag: punctual });
      setStars(0);
      setPunctual(false);
    } catch {
      setError(t('booking:rating.error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={heading} heightRatio={0.45} theme={theme}>
      <View style={styles.content}>
        <StarRatingInput value={stars} onChange={setStars} theme={theme} accessibilityLabel="Votre note" />

        <Chip
          label={t('booking:rating.punctual')}
          tone={punctual ? 'default' : 'dim'}
          selected={punctual}
          onPress={() => setPunctual((p) => !p)}
          theme={theme}
        />

        {error ? (
          <Text variant="bodySmall" color={theme.error}>
            {error}
          </Text>
        ) : null}

        <Button
          label={t('booking:rating.submitCta')}
          size="lg"
          disabled={stars < 1}
          loading={submitting}
          onPress={() => void handleSubmit()}
          style={styles.cta}
          theme={theme}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  cta: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
