import type { ContextualAuthTrigger } from './useContextualAuth';

/** stitch/landing/contextual-authentication-sheet.html ("Contextual
 *  Authentication Sheet", Vaya Passenger Journey UX project): the header
 *  copy is meant to name the specific action the guest is about to
 *  complete, not just a generic "please sign in". */
export function contextualAuthCopy(trigger: ContextualAuthTrigger): { title: string; subtitle: string } {
  switch (trigger) {
    case 'publishing':
      return {
        title: 'Rejoignez VAYA pour publier ce trajet',
        subtitle: 'Créez un compte ou connectez-vous pour continuer et publier votre trajet.',
      };
    case 'messages':
      return {
        title: 'Rejoignez VAYA pour voir vos messages',
        subtitle: 'Créez un compte ou connectez-vous pour accéder à vos conversations.',
      };
    case 'account':
      return {
        title: 'Rejoignez VAYA pour accéder à votre profil',
        subtitle: 'Créez un compte ou connectez-vous pour gérer votre profil et vos trajets.',
      };
    case 'booking':
    default:
      return {
        title: 'Rejoignez VAYA pour réserver ce trajet',
        subtitle: 'Créez un compte ou connectez-vous pour continuer votre réservation.',
      };
  }
}
