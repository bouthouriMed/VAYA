import type { LegalDocument, LegalSection } from './types';
import { PRIVACY_CONTENT } from './privacy';

/**
 * Standalone "delete your VAYA account" page content — the public web URL
 * Google Play's Data safety form requires for account deletion. The actual
 * deletion rules are taken verbatim from the Privacy Policy's own deletion
 * section (one source of text, never a second copy that can drift); only the
 * short intro naming the app and the off-app request route is added here.
 */
function deletionSection(locale: 'fr' | 'en'): LegalSection {
  const section = PRIVACY_CONTENT[locale].sections.find((s) => s.heading.startsWith('15.'));
  if (!section) {
    throw new Error(`Privacy Policy (${locale}) has no section 15 (account deletion)`);
  }
  return section;
}

const fr: LegalDocument = {
  title: 'Supprimer votre compte VAYA',
  version: PRIVACY_CONTENT.fr.version,
  effectiveDateLabel: PRIVACY_CONTENT.fr.effectiveDateLabel,
  languageNote: PRIVACY_CONTENT.fr.languageNote,
  sections: [
    {
      heading: 'Comment demander la suppression',
      body: [
        "Cette page concerne l'application VAYA (covoiturage en Tunisie), éditée par VAYA.",
        "Le moyen le plus rapide est de supprimer votre compte directement depuis l'application, comme décrit ci-dessous.",
        "Si vous n'avez plus accès à l'application, écrivez au Support VAYA à l'adresse électronique indiquée sur la page de VAYA dans Google Play, depuis l'adresse ou en mentionnant le numéro de téléphone lié à votre compte. Nous vérifions votre identité puis supprimons le compte selon les règles ci-dessous.",
      ],
    },
    deletionSection('fr'),
  ],
};

const en: LegalDocument = {
  title: 'Delete your VAYA account',
  version: PRIVACY_CONTENT.en.version,
  effectiveDateLabel: PRIVACY_CONTENT.en.effectiveDateLabel,
  languageNote: PRIVACY_CONTENT.en.languageNote,
  sections: [
    {
      heading: 'How to request deletion',
      body: [
        'This page is about the VAYA app (carpooling in Tunisia), published by VAYA.',
        'The fastest way is to delete your account directly in the app, as described below.',
        "If you no longer have access to the app, write to VAYA Support at the email address shown on VAYA's Google Play listing, from the email address or quoting the phone number linked to your account. We verify your identity, then delete the account under the rules below.",
      ],
    },
    deletionSection('en'),
  ],
};

export const ACCOUNT_DELETION_CONTENT: Record<'fr' | 'en', LegalDocument> = { fr, en };
