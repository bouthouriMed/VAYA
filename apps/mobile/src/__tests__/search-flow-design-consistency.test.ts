import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(dirname, '../../app');
const designSystemDir = path.resolve(dirname, '../../../../packages/design-system/src');

function readScreen(relativePath: string): string {
  return readFileSync(path.join(appDir, relativePath), 'utf-8');
}

function readPrimitive(relativePath: string): string {
  return readFileSync(path.join(designSystemDir, relativePath), 'utf-8');
}

/** Names imported from '@vaya/design-system' by a screen, e.g. from
 *  `import { Text, useAppTheme, spacing } from '@vaya/design-system';`
 *  Multi-line-safe; strips a leading `type ` from type-only imports. */
function designSystemImports(source: string): string[] {
  const match = /import\s*\{([^}]*)\}\s*from\s*['"]@vaya\/design-system['"]/.exec(source);
  if (!match) return [];
  return match[1]!
    .split(',')
    .map((s) => s.trim().replace(/^type\s+/, ''))
    .filter(Boolean);
}

/**
 * No React Native component-rendering harness exists in this repo (see
 * pickup-point-screen.test.ts's note — same constraint applies here), so
 * these are source-level regression guards, not rendered-output snapshots.
 *
 * They exist because of a real regression: after the "Vaya Passenger
 * Journey UX" Stitch dark-mode migration (docs/design-system/README.md's
 * Colors section) landed most search screens on `useAppTheme()`,
 * search/results.tsx's own "no exact match, here are nearby rides"
 * fallback branch was left routing through `EmptyState` (never migrated
 * off the legacy static `colors` token) and always passed a hardcoded
 * `bestMatch={false}` — so that one state silently drifted from the Stitch
 * reference (screen "Ride Results - Cleaned Nav", project "Vaya Passenger
 * Journey UX") while every other state on the same screen matched it. A
 * plain "does the screen render" check wouldn't have caught this; these
 * assert the exact markers that state's reference has and the previous
 * code didn't.
 */
describe('search screens are fully on useAppTheme(), not the legacy static colors token', () => {
  const migratedScreens = [
    'search/composer.tsx',
    'search/results.tsx',
    'search/trust.tsx',
    'search/reviews.tsx',
    'search/ride-details.tsx',
  ];

  for (const screen of migratedScreens) {
    it(`${screen} imports useAppTheme and never the legacy colors token from @vaya/design-system`, () => {
      const source = readScreen(screen);
      const imports = designSystemImports(source);
      expect(imports).toContain('useAppTheme');
      expect(imports).not.toContain('colors');
    });
  }

  // Known, documented gap (not a regression): pickup-point.tsx predates the
  // Stitch dark-mode pass and was never in its migrated-screens list — see
  // CLAUDE.md's Post-Phase-11 fixes note. Asserted explicitly so a future
  // migration of this screen updates this test instead of it silently
  // staying stale.
  it('search/pickup-point.tsx is a documented, not-yet-migrated exception', () => {
    const source = readScreen('search/pickup-point.tsx');
    const imports = designSystemImports(source);
    expect(imports).toContain('colors');
    expect(imports).not.toContain('useAppTheme');
  });
});

// Phase 13 (docs/roadmap/phase-13-search-engine.md) replaced the old
// client-orchestrated two-endpoint (matching/search + matching/
// corridor-fallback) pair — a separate `fallbackSorted` list with its own
// hardcoded banner text and a `fallbackBestMatchId` — with one server-tiered
// `useMatchingSearchQuery` response (`{tier, candidates, message}`) and a
// single rendering path. These assertions were rewritten for that
// architecture rather than deleted, so a future regression back toward a
// second hardcoded fallback list/banner still gets caught here.
//
// Matching-engine architecture plan §D/§M (Phase B) moved "best match"
// off a client-side score comparison entirely: the server now decides
// (rankMatchCandidates, matching.service.ts) and returns `standoutRideId`,
// null whenever two or more candidates are comparably good rather than
// forcing a winner (§Decisions #3 — "don't chase a perfect ordering"). The
// assertion below was rewritten again for that, not deleted, so a
// regression back toward a client-side `sort((a,b) => b.score - a.score)`
// tiebreaker — which would silently reintroduce a manufactured single
// winner the server deliberately declined to crown — still gets caught.
describe('search/results.tsx: non-exact tiers render through the same list, server-driven banner', () => {
  const source = readScreen('search/results.tsx');

  it('renders the banner from the server-provided message, not a hardcoded client string', () => {
    expect(source).toContain('searchResult?.message');
    expect(source).not.toMatch(/Aucun trajet exactement à l['’]heure demandée[^`]*proches\./);
  });

  it('reads best-match from the server-provided standoutRideId, never re-derived from a local score comparison', () => {
    expect(source).toContain('bestMatchId');
    expect(source).toContain('searchResult?.standoutRideId');
    expect(source).not.toMatch(/sort\(\(a,\s*b\)\s*=>\s*b\.score\s*-\s*a\.score\)/);
    expect(source).toContain('bestMatch={candidate.rideId === bestMatchId}');
    expect(source).not.toContain('bestMatch={false}');
  });

  it('reserves EmptyState for the genuine zero-results (tier "none") case, not for wrapping real ride cards', () => {
    const emptyStateBlock = /<EmptyState[\s\S]*?\/>/.exec(source)?.[0] ?? '';
    expect(emptyStateBlock).not.toContain('RideResultCard');
    expect(emptyStateBlock).not.toContain('.map');
  });

  it('renders every tier\'s ride list through the same themed DriverListCard-backed component', () => {
    const listBranch = /sorted\.length > 0 \? \([\s\S]*?\) : \(/.exec(source)?.[0] ?? '';
    expect(listBranch).toContain('RideResultCard');
    expect(listBranch).toContain('theme={theme}');
  });

  it('badges a route-passthrough match distinctly instead of folding it into the score alone', () => {
    expect(source).toContain("candidate.matchType === 'route_passthrough'");
    expect(source).toContain('routeBadgeLabel');
  });
});

describe('theme-aware primitives keep accepting an explicit theme prop', () => {
  it('DriverListCard requires theme (no silent fallback to the legacy static palette)', () => {
    const source = readPrimitive('primitives/DriverListCard.tsx');
    expect(source).toMatch(/theme:\s*AppPalette;/);
  });

  it('ReviewCard accepts an optional theme override, and reviews.tsx passes it', () => {
    const cardSource = readPrimitive('primitives/ReviewCard.tsx');
    expect(cardSource).toMatch(/theme\?:\s*AppPalette/);
    const reviewsScreen = readScreen('search/reviews.tsx');
    expect(reviewsScreen).toContain('theme={theme}');
  });
});
