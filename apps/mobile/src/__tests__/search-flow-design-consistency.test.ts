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
    // Migrated off the legacy static `colors`/`lightPalette` tokens in the
    // same pass that replaced their fixed-height footer with a draggable
    // map sheet (DraggableMapSheet) — previously the one documented,
    // not-yet-migrated exception in this list.
    'search/pickup-point.tsx',
    'search/dropoff-point.tsx',
  ];

  for (const screen of migratedScreens) {
    it(`${screen} imports useAppTheme and never the legacy colors token from @vaya/design-system`, () => {
      const source = readScreen(screen);
      const imports = designSystemImports(source);
      expect(imports).toContain('useAppTheme');
      expect(imports).not.toContain('colors');
    });
  }
});

// Phase 13 (docs/roadmap/phase-13-search-engine.md) replaced the old
// client-orchestrated two-endpoint (matching/search + matching/
// corridor-fallback) pair — a separate `fallbackSorted` list with its own
// hardcoded banner text and a `fallbackBestMatchId` — with one server-tiered
// `useMatchingSearchQuery` response (`{tier, candidates, message}`) and a
// single rendering path. These assertions were rewritten for that
// architecture rather than deleted, so a future regression back toward a
// second hardcoded fallback list/banner still gets caught here.
describe('search/results.tsx: non-exact tiers render through the same list, server-driven banner', () => {
  const source = readScreen('search/results.tsx');

  it('renders the banner from the server-provided message, not a hardcoded client string', () => {
    expect(source).toContain('searchResult?.message');
    expect(source).not.toMatch(/Aucun trajet exactement à l['’]heure demandée[^`]*proches\./);
  });

  it('computes a single best-match id from candidate score, not a hardcoded false', () => {
    expect(source).toContain('bestMatchId');
    expect(source).toMatch(/sort\(\(a, b\) => b\.score - a\.score\)\[0\]\?\.rideId/);
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
