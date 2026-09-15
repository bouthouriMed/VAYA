import type { Metadata } from 'next';
import { TERMS_CONTENT } from '@vaya/legal';
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
  const document = TERMS_CONTENT[locale === 'en' ? 'en' : 'fr'];
  return {
    title: `${document.title} — VAYA`,
    alternates: { languages: { fr: '/fr/legal/terms', en: '/en/legal/terms' } },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const document = TERMS_CONTENT[locale === 'en' ? 'en' : 'fr'];
  return <LegalPage document={document} dict={dict} locale={locale} />;
}
