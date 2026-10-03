import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '@vaya/config';
import { formatCurrency } from '../../utils/localeFormat';

/** Localized copy + currency formatting for every `PriceRangeStepper` in
 *  the app, so the publish wizard and the recurring-draft screen can't
 *  drift (the primitive itself is translation-agnostic). */
export function usePriceStepperProps(): {
  labels: {
    decrease: string;
    increase: string;
    suggested: (formattedPrice: string) => string;
    estimateNote: string;
  };
  formatValue: (value: number) => string;
} {
  const { t, i18n } = useTranslation('driver');
  const locale = i18n.language as SupportedLocale;
  return {
    labels: {
      decrease: t('driver:publish.priceStep.decrease'),
      increase: t('driver:publish.priceStep.increase'),
      suggested: (price) => t('driver:publish.priceStep.suggestedValue', { price }),
      estimateNote: t('driver:publish.priceStep.estimateNote'),
    },
    formatValue: (value) => formatCurrency(value, locale),
  };
}
