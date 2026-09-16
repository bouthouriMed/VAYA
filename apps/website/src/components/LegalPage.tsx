import Link from 'next/link';
import type { LegalDocument } from '@vaya/legal';
import type { Dictionary } from '@/i18n/dictionaries';

/**
 * Renders a `LegalDocument` (shared with the mobile app via `@vaya/legal`,
 * so this page and the in-app screen always show the exact same text) as a
 * standalone marketing-site page. This is the "real, permanently-reachable
 * public URL" the App Store/Play Store require for a Privacy Policy —
 * `docs/legal/README.md` tracks that this only satisfies that requirement
 * once the site itself is deployed to a real domain.
 */
export function LegalPage({
  document,
  dict,
  locale,
}: {
  document: LegalDocument;
  dict: Dictionary;
  locale: string;
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-outline-variant/50 px-6 py-6 md:px-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link
            href={`/${locale}`}
            className="font-display text-lg font-semibold tracking-[0.14em] text-ink"
          >
            VAYA
          </Link>
          <Link
            href={`/${locale}`}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            {dict.legal.backToHome}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14 md:px-10">
        <h1 className="font-display text-3xl font-semibold text-ink md:text-4xl">
          {document.title}
        </h1>
        <p className="mt-2 text-sm text-ink-faint">{document.effectiveDateLabel}</p>
        <p className="mt-1 text-sm italic text-ink-faint">{document.languageNote}</p>

        <div className="mt-10 space-y-10">
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-lg font-semibold text-ink">{section.heading}</h2>
              <div className="mt-3 space-y-3">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
