import Link from 'next/link';
import type { Dictionary } from '@/i18n/dictionaries';
import { LanguageSwitch } from './LanguageSwitch';

export function Footer({ dict, locale }: { dict: Dictionary; locale: string }): React.JSX.Element {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-outline-variant/50 bg-background px-6 py-14 md:px-10">
      <div className="mx-auto flex max-w-content flex-col gap-10 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <span className="font-display text-lg font-semibold tracking-[0.14em] text-ink">VAYA</span>
          <p className="mt-3 text-sm text-ink-muted">{dict.footer.tagline}</p>
          <div className="mt-5">
            <LanguageSwitch current={locale} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {dict.footer.product}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
              <li>
                <a href="#passengers" className="transition-colors hover:text-ink">
                  {dict.footer.passengers}
                </a>
              </li>
              <li>
                <a href="#drivers" className="transition-colors hover:text-ink">
                  {dict.footer.drivers}
                </a>
              </li>
              <li>
                <a href="#trust" className="transition-colors hover:text-ink">
                  {dict.footer.trust}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {dict.footer.legal}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
              <li>
                <Link href={`/${locale}/legal/terms`} className="transition-colors hover:text-ink">
                  {dict.footer.terms}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/legal/privacy`} className="transition-colors hover:text-ink">
                  {dict.footer.privacy}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-content border-t border-outline-variant/40 pt-6 text-xs text-ink-faint">
        © {year} {dict.footer.rights}
      </div>
    </footer>
  );
}
