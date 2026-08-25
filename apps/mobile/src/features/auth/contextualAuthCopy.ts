import type { TFunction } from 'i18next';
import type { ContextualAuthTrigger } from './useContextualAuth';

/** stitch/landing/contextual-authentication-sheet.html ("Contextual
 *  Authentication Sheet", Vaya Passenger Journey UX project): the header
 *  copy is meant to name the specific action the guest is about to
 *  complete, not just a generic "please sign in". */
export function contextualAuthCopy(trigger: ContextualAuthTrigger, t: TFunction): { title: string; subtitle: string } {
  switch (trigger) {
    case 'publishing':
      return {
        title: t('auth:contextual.publishing.title'),
        subtitle: t('auth:contextual.publishing.subtitle'),
      };
    case 'messages':
      return {
        title: t('auth:contextual.messages.title'),
        subtitle: t('auth:contextual.messages.subtitle'),
      };
    case 'account':
      return {
        title: t('auth:contextual.account.title'),
        subtitle: t('auth:contextual.account.subtitle'),
      };
    case 'booking':
    default:
      return {
        title: t('auth:contextual.booking.title'),
        subtitle: t('auth:contextual.booking.subtitle'),
      };
  }
}
