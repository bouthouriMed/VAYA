/**
 * App Store / Google Play CTA structure. Custom-styled (not the official
 * trademarked badge artwork, which this codebase has no licensed asset
 * for) so nothing here fabricates a brand asset — but the href props are
 * real link slots, ready to swap in actual store URLs once VAYA is
 * published on either store.
 */
export function StoreBadges({
  appStoreLabel,
  playLabel,
  appStoreUrl = '#',
  playStoreUrl = '#',
  className = '',
}: {
  appStoreLabel: string;
  playLabel: string;
  appStoreUrl?: string;
  playStoreUrl?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a
        href={appStoreUrl}
        className="group flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-5 py-3 transition-colors hover:border-accent/60"
      >
        <AppleGlyph />
        <span className="text-left">
          <span className="block text-[11px] uppercase tracking-wide text-ink-faint">
            Download on the
          </span>
          <span className="block font-display text-base text-ink">App Store</span>
        </span>
        <span className="sr-only">{appStoreLabel}</span>
      </a>
      <a
        href={playStoreUrl}
        className="group flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface px-5 py-3 transition-colors hover:border-accent/60"
      >
        <PlayGlyph />
        <span className="text-left">
          <span className="block text-[11px] uppercase tracking-wide text-ink-faint">Get it on</span>
          <span className="block font-display text-base text-ink">Google Play</span>
        </span>
        <span className="sr-only">{playLabel}</span>
      </a>
    </div>
  );
}

function AppleGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.5 3c.15 1.1-.3 2.2-1 3-.75.85-1.95 1.5-3.1 1.4-.15-1.05.35-2.2 1.05-2.95C14.2 3.6 15.4 3.05 16.5 3zM20.1 17.2c-.45 1.05-.95 2.05-1.7 2.95-.85 1.05-1.75 2.1-3.05 2.1-1.25.05-1.7-.75-3.15-.75-1.5 0-1.95.75-3.15.8-1.25.05-2.25-1.15-3.1-2.2-1.7-2.15-3-6.1-1.25-8.75.85-1.3 2.4-2.15 4.05-2.15 1.3-.05 2.45.85 3.2.85.75 0 2.2-1.05 3.7-.9.65.05 2.4.25 3.55 1.95-.1.05-2.1 1.25-2.1 3.7.05 2.95 2.55 3.95 2.9 4.4z"
        fill="#F6F1E7"
      />
    </svg>
  );
}

function PlayGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 3.8v16.4c0 .35.4.55.7.35L20 12 5.2 3.45c-.3-.2-.7 0-.7.35z" fill="#3FBE85" />
    </svg>
  );
}
