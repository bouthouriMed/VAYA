/**
 * The current version of the Terms of Use and Privacy Policy, and what
 * changed in it — one record read by the website ("what's changing" box),
 * the app (notification + "what's changing" screen) and the API script that
 * sends the notice (`pnpm --filter @vaya/api legal:notify`).
 *
 * Rule (Terms, article 20): an IMPORTANT change — one that reduces Members'
 * rights or adds obligations (new documents or information required, new
 * fees, stricter cancellation/no-show consequences, wider sharing of
 * personal data, new grounds to restrict an account) — takes effect at
 * least 30 days after the notice. Any other change (clarification, new
 * feature, more protection) may take effect on publication. Either way the
 * notice is sent. `checkLegalUpdate` enforces the 30 days in a test.
 */
export interface LegalUpdate {
  /** Must equal TERMS_CONTENT[*].version and PRIVACY_CONTENT[*].version. */
  version: string;
  /** Day the text is published (website + app), ISO yyyy-mm-dd. */
  publishedOn: string;
  /** Day it takes effect, ISO yyyy-mm-dd. */
  effectiveOn: string;
  /** True when the update contains an important change (see above). */
  important: boolean;
  /** What changes, in plain words, per language. */
  summary: Record<'fr' | 'en' | 'ar', string[]>;
}

export const NOTICE_PERIOD_DAYS = 30;

export const LEGAL_UPDATE: LegalUpdate = {
  version: '2.1',
  publishedOn: '2026-10-16',
  effectiveOn: '2026-10-16',
  // Clarifications of how the app already works, plus more privacy (the
  // plate): nothing here reduces Members' rights or adds obligations.
  important: false,
  summary: {
    fr: [
      "La plaque d'immatriculation n'est plus publique : comme le numéro de téléphone, elle n'est montrée qu'à l'autre partie d'une réservation acceptée.",
      "La messagerie s'ouvre dès la demande de réservation : le passager peut joindre un message, puis écrire à nouveau après chaque réponse du conducteur, jusqu'à l'acceptation.",
      'VAYA propose les points de prise en charge et de dépose à partir de l’itinéraire et des zones du conducteur ; le passager ne les place plus lui-même.',
      'Un trajet préparé pendant la vérification du conducteur est publié automatiquement à son approbation ; un trajet jamais démarré est clôturé automatiquement.',
      'Les modifications importantes des conditions sont définies et annoncées dans l’application 30 jours avant de s’appliquer.',
      'La politique de confidentialité décrit aussi le numéro de contact, l’historique de trajets en commun, les lieux de rendez-vous utilisés et le contenu des notifications.',
    ],
    en: [
      "The number plate is no longer public: like the phone number, it is shown only to the other party of an accepted booking.",
      'Messaging opens with the booking request: the passenger can add a message, then write again after each reply from the driver, until the request is accepted.',
      "VAYA proposes the pickup and drop-off points from the driver's route and areas; passengers no longer place them.",
      'A ride prepared during driver verification is published automatically on approval; a ride that is never started is closed automatically.',
      'Important changes to the terms are defined, and announced in the app 30 days before they apply.',
      'The privacy policy also covers the contact number, shared-trip history, meeting places used and what notifications contain.',
    ],
    ar: [
      'لم يعد رقم تسجيل السيارة عاماً: مثل رقم الهاتف، لا يُعرض إلا على الطرف الآخر في حجز مقبول.',
      'تُفتح المحادثة منذ طلب الحجز: يمكن للراكب إرفاق رسالة، ثم الكتابة مجدداً بعد كل ردّ من السائق، إلى أن يُقبل الطلب.',
      'تقترح VAYA نقطتي الصعود والنزول من مسار السائق ومناطقه، ولم يعد الراكب يحددهما بنفسه.',
      'تُنشر آلياً الرحلة المُعدّة أثناء التحقق من السائق عند الموافقة عليه، وتُغلق آلياً الرحلة التي لم تبدأ أبداً.',
      'أصبحت التغييرات المهمة في الشروط محددة، ويُعلن عنها في التطبيق قبل 30 يوماً من تطبيقها.',
      'تشمل سياسة الخصوصية أيضاً رقم الاتصال وسجل المشاوير المشتركة وأماكن الالتقاء المستعملة ومحتوى الإشعارات.',
    ],
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Problems with an update record, empty when it's valid. */
export function checkLegalUpdate(update: LegalUpdate, documentVersions: string[]): string[] {
  const problems: string[] = [];
  const published = Date.parse(`${update.publishedOn}T00:00:00Z`);
  const effective = Date.parse(`${update.effectiveOn}T00:00:00Z`);
  if (Number.isNaN(published) || Number.isNaN(effective)) problems.push('dates must be ISO yyyy-mm-dd');
  if (effective < published) problems.push('effectiveOn is before publishedOn');
  if (update.important && effective - published < NOTICE_PERIOD_DAYS * DAY_MS) {
    problems.push(`an important change needs at least ${NOTICE_PERIOD_DAYS} days between publishedOn and effectiveOn`);
  }
  for (const v of documentVersions) {
    if (v !== update.version) problems.push(`document version ${v} differs from LEGAL_UPDATE.version ${update.version}`);
  }
  for (const locale of ['fr', 'en', 'ar'] as const) {
    if (update.summary[locale].length === 0) problems.push(`summary.${locale} is empty`);
  }
  if (new Set([update.summary.fr.length, update.summary.en.length, update.summary.ar.length]).size !== 1) {
    problems.push('summary has a different number of points per language');
  }
  return problems;
}

/** "16 octobre 2026" / "16 October 2026" / "16 أكتوبر 2026". */
export function formatLegalDate(isoDate: string, locale: 'fr' | 'en' | 'ar'): string {
  const tag = locale === 'en' ? 'en-GB' : `${locale}-TN`;
  return new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
    numberingSystem: 'latn',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
