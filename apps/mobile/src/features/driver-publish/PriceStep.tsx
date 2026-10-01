import { View, Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text, GlassSurface, PriceRangeStepper, useAppTheme, spacing } from '@vaya/design-system';
import type { SuggestedPrice } from '../../state/api';
import { publishStyles as styles } from './publishStyles';
import { PrimaryButton, StepHeader } from './PublishChrome';
import { usePriceStepperProps } from './usePriceStepperProps';

interface PriceStepProps {
  title: string;
  onBack: () => void;
  pricing: SuggestedPrice | null;
  price: number;
  onChangePrice: (value: number) => void;
  routeIsEstimate: boolean;
  errorMessage?: string | null;
  isUpdatingPrice: boolean;
  onContinue: () => void;
  /** The wizard's shared step-enter animation. */
  motionStyle: StyleProp<ViewStyle>;
}

/** Publish wizard — adjust the per-seat contribution within the server's bounds. */
export function PriceStep({
  title,
  onBack,
  pricing,
  price,
  onChangePrice,
  routeIsEstimate,
  errorMessage,
  isUpdatingPrice,
  onContinue,
  motionStyle,
}: PriceStepProps): React.JSX.Element {
  const { t } = useTranslation(['driver', 'common']);
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
  const priceStepperProps = usePriceStepperProps();

    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader title={title} onBack={onBack} />
        </View>

        <Animated.View style={[styles.priceBody, motionStyle]}>
          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            {t('driver:publish.priceStep.title')}
          </Text>
          <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.priceCard}>
            {pricing ? (
              <PriceRangeStepper
                min={pricing.min}
                max={pricing.max}
                recommended={pricing.recommended}
                value={price}
                onChange={onChangePrice}
                isEstimate={routeIsEstimate}
                label={t('driver:publish.priceStep.contributionLabel')}
                {...priceStepperProps}
              />
            ) : null}
          </GlassSurface>
          <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.hint}>
            {t('driver:publish.priceStep.description')}
          </Text>
        </Animated.View>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            label={t('common:actions.continue')}
            loading={isUpdatingPrice}
            disabled={!pricing}
            onPress={onContinue}
          />
        </View>
      </View>
    );
}
