import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useToast } from '@vaya/design-system';
import { useLazyGetBookingContactPhoneQuery } from '../../state/api';

/**
 * Calling the other party of an accepted booking (rider <-> driver) — the
 * phone number is fetched on demand right before dialing, never stored or
 * displayed anywhere on screen, matching bookings.service.ts's
 * getBookingContactPhone privacy scope (accepted bookings only, never a
 * public lookup). `phone: null` (a Google-auth-only counterpart with none
 * on file) and any fetch failure both surface as an honest toast rather
 * than a silent no-op tap.
 */
export function useCallCounterpart(bookingId: string): { call: () => void; isLoading: boolean } {
  const { t } = useTranslation('common');
  const showToast = useToast();
  const [fetchContactPhone, { isFetching }] = useLazyGetBookingContactPhoneQuery();

  function call(): void {
    void (async () => {
      try {
        const { phone } = await fetchContactPhone(bookingId).unwrap();
        if (!phone) {
          showToast({ message: t('common:call.noPhoneOnFile'), tone: 'info' });
          return;
        }
        await Linking.openURL(`tel:${phone}`);
      } catch {
        showToast({ message: t('common:call.error'), tone: 'error' });
      }
    })();
  }

  return { call, isLoading: isFetching };
}
