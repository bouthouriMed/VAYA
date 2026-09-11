import { getDictionary, locales, type Locale } from '@/i18n/dictionaries';
import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Journey } from '@/components/Journey';
import { PassengerSection } from '@/components/PassengerSection';
import { DriverSection } from '@/components/DriverSection';
import { MatchingSection } from '@/components/MatchingSection';
import { TrustSection } from '@/components/TrustSection';
import { AppUIMoments } from '@/components/AppUIMoments';
import { FinalCTA } from '@/components/FinalCTA';
import { Footer } from '@/components/Footer';

export function generateStaticParams(): { locale: Locale }[] {
  return locales.map((locale) => ({ locale }));
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  const dict = getDictionary(locale);

  return (
    <>
      <Nav dict={dict} locale={locale} />
      <main>
        <Hero dict={dict} />
        <Journey dict={dict} />
        <PassengerSection dict={dict} locale={locale} />
        <DriverSection dict={dict} locale={locale} />
        <MatchingSection dict={dict} />
        <TrustSection dict={dict} locale={locale} />
        <AppUIMoments dict={dict} locale={locale} />
        <FinalCTA dict={dict} />
      </main>
      <Footer dict={dict} locale={locale} />
    </>
  );
}
