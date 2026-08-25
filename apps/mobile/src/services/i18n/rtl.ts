import { I18nManager } from 'react-native';
import { isRtlLocale, type SupportedLocale } from '@vaya/config';

/** React Native's native layout direction is a *process-level* flag, not a
 *  per-render one — flipping `I18nManager.forceRTL` only takes effect after
 *  the JS bundle (and on a real device, the native layer) fully reloads. It
 *  cannot be animated or applied mid-session the way theme/appearance can.
 *  Returns whether a reload is actually required, so the caller can decide
 *  how to prompt the user. */
export function applyRtlDirection(locale: SupportedLocale): { reloadRequired: boolean } {
  const shouldBeRtl = isRtlLocale(locale);
  const alreadyCorrect = I18nManager.isRTL === shouldBeRtl;

  I18nManager.allowRTL(shouldBeRtl);
  I18nManager.forceRTL(shouldBeRtl);

  return { reloadRequired: !alreadyCorrect };
}

export function isCurrentLayoutRtl(): boolean {
  return I18nManager.isRTL;
}
