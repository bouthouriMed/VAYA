import { getDictionary, locales, type Locale } from '@/i18n/dictionaries';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { HeroPhone } from '@/components/cinema/HeroPhone';
import { CoastRide } from '@/components/cinema/CoastRide';
import { PhoneStory } from '@/components/cinema/PhoneStory';
import { TrustScene } from '@/components/cinema/TrustScene';
import { WordReveal } from '@/components/cinema/WordReveal';
import { Finale } from '@/components/cinema/Finale';
import { SmoothScroll } from '@/components/cinema/SmoothScroll';

export function generateStaticParams(): { locale: Locale }[] {
  return locales.map((locale) => ({ locale }));
}

const screen = (name: string): string => `/images/screens/${name}.webp`;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.JSX.Element> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const c = dict.cinema;
  const pp = dict.passenger.points;
  const js = dict.journey.steps;

  return (
    <>
      <SmoothScroll />
      <Nav dict={dict} locale={locale} />
      <main>
        <HeroPhone dict={dict} />
        <CoastRide
          eyebrow={dict.journey.eyebrow}
          title={dict.journey.title}
          steps={[js[0]!, js[1]!, js[2]!]}
          pinLabel={c.pinLabel}
          imageAlt={c.coastAlt}
        />
        <PhoneStory
          id="passengers"
          eyebrow={dict.passenger.eyebrow}
          title={dict.passenger.title}
          steps={[
            { ...pp[0]!, screen: screen('results'), alt: c.altResults },
            { ...pp[2]!, screen: screen('driver_profile'), alt: c.altProfile },
            { title: js[3]!.title, body: js[3]!.body, screen: screen('ride_detail'), alt: c.altRide },
            { title: c.waitTitle, body: c.waitBody, screen: screen('waiting'), alt: c.altWaiting },
          ]}
        />
        <PhoneStory
          id="drivers"
          phoneSide="left"
          eyebrow={dict.driver.eyebrow}
          title={dict.driver.title}
          steps={[
            { title: c.fitTitle, body: c.fitBody, screen: screen('request_details'), alt: c.altRequest },
            { title: js[5]!.title, body: js[5]!.body, screen: screen('my_trip'), alt: c.altTrip },
          ]}
        />
        <WordReveal
          id="matching"
          eyebrow={dict.matching.eyebrow}
          statement={dict.matching.title}
          items={dict.matching.tiers}
        />
        <TrustScene dict={dict} />
        <Finale
          title={dict.finalCta.title}
          body={dict.finalCta.body}
          appStore={dict.finalCta.appStore}
          googlePlay={dict.finalCta.googlePlay}
        />
      </main>
      <Footer dict={dict} locale={locale} />
    </>
  );
}
