'use client';

import { useEffect, useState } from 'react';
import type { Dictionary } from '@/i18n/dictionaries';
import { LanguageSwitch } from './LanguageSwitch';

export function Nav({ dict, locale }: { dict: Dictionary; locale: string }): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={
        'fixed inset-x-0 top-0 z-50 transition-all duration-300 ' +
        (scrolled ? 'border-b border-outline-variant/60 bg-background/80 backdrop-blur-md' : 'bg-transparent')
      }
    >
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4 md:px-10">
        <a
          href="#top"
          className="font-display text-lg font-semibold tracking-[0.14em] text-ink"
        >
          VAYA
        </a>
        <nav className="hidden items-center gap-8 text-sm text-ink-muted md:flex">
          <a href="#passengers" className="transition-colors hover:text-ink">
            {dict.nav.passengers}
          </a>
          <a href="#drivers" className="transition-colors hover:text-ink">
            {dict.nav.drivers}
          </a>
          <a href="#trust" className="transition-colors hover:text-ink">
            {dict.nav.trust}
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <LanguageSwitch current={locale} />
          <a
            href="#download"
            className="hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition-transform hover:scale-[1.03] sm:inline-block"
          >
            {dict.nav.download}
          </a>
        </div>
      </div>
    </header>
  );
}
