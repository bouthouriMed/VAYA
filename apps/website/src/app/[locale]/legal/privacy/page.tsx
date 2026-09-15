import type { Metadata } from 'next';
import { PRIVACY_CONTENT } from '@vaya/legal';
import { getDictionary, locales, type Locale } from '@/i18n/dictionaries';
import { LegalPage } from '@/components/LegalPage';

export function generateStaticParams(): { locale: Locale }[] {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const document = PRIVACY_CONTENT[locale === 'en' ? 'en' : 'fr'];
  return {
    title: `${document.title} — VAYA`,
    alternates: { languages: { fr: '/fr/legal/privacy', en: '/en/legal/privacy' } },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const document = PRIVACY_CONTENT[locale === 'en' ? 'en' : 'fr'];
  return <LegalPage document={document} dict={dict} locale={locale} />;
}
