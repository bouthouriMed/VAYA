import { useCallback } from 'react';
import { Alert } from 'react-native';
import { LOCALE_NATIVE_NAMES, type SupportedLocale } from '@vaya/config';
import i18n from '../services/i18n';
import { applyRtlDirection } from '../services/i18n/rtl';
import { tryReloadApp } from '../services/i18n/restart';
import { saveLanguagePreference } from '../services/settings/languageStorage';
import { setLanguage } from '../state/languageSlice';
import { useAppDispatch } from '../state/store';

/** The single place that performs an explicit language change — used by
 *  profile.tsx's language picker and by the cold-start reconciliation in
 *  _layout.tsx when a persisted choice disagrees with this session's
 *  device-locale guess. Keeps the four steps (Redux, i18next, persistence,
 *  native RTL direction) in one order everywhere rather than letting each
 *  call site reimplement the sequence slightly differently. */
export function useLanguage(): { changeLanguage: (locale: SupportedLocale) => Promise<void> } {
  const dispatch = useAppDispatch();

  const changeLanguage = useCallback(
    async (locale: SupportedLocale) => {
      dispatch(setLanguage(locale));
      await i18n.changeLanguage(locale);
      // Best-effort — a storage failure shouldn't block the language from
      // applying for the rest of this session, only its persistence.
      await saveLanguagePreference(locale).catch(() => undefined);

      const { reloadRequired } = applyRtlDirection(locale);
      if (!reloadRequired) return;

      // Native RTL direction only takes effect after a full reload. Dev
      // gets a fast automatic one; production has no in-app reload
      // mechanism (no expo-updates in this app), so the honest move is to
      // say so plainly rather than offer a "Restart now" button that would
      // silently do nothing.
      if (!tryReloadApp()) {
        Alert.alert(
          i18n.t('common:language.restartTitle'),
          i18n.t('common:language.restartMessage', { language: LOCALE_NATIVE_NAMES[locale] }),
          [{ text: i18n.t('common:actions.gotIt') }],
        );
      }
    },
    [dispatch],
  );

  return { changeLanguage };
}
