'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales } from '@/i18n/dictionaries';

export function LanguageSwitch({ current }: { current: string }): React.JSX.Element {
  const pathname = usePathname();
  const rest = pathname.replace(/^\/(fr|en)/, '') || '';

  return (
    <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface/60 p-1 text-xs font-medium">
      {locales.map((locale) => (
        <Link
          key={locale}
          href={`/${locale}${rest}`}
          className={
            'rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors ' +
            (locale === current ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink')
          }
          aria-current={locale === current ? 'true' : undefined}
        >
          {locale}
        </Link>
      ))}
    </div>
  );
}
