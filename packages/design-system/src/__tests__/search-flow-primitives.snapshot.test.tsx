import React from 'react';
import { describe, it, expect } from 'vitest';
import { DriverListCard, type DriverListCardData } from '../primitives/DriverListCard';
import { ReviewCard, type ReviewCardData } from '../primitives/ReviewCard';
import { EmptyState } from '../primitives/EmptyState';
import { lightPalette, darkPalette } from '../theme/palette';
import { renderJSON } from './test-utils/renderJSON';

/**
 * Real react-test-renderer snapshots (render -> toJSON(), diffed by
 * Vitest's own toMatchSnapshot against .snap files) of the primitives that
 * back the search-results flow — not source-string regression guards.
 * These render the actual component tree, so a prop/structure regression
 * like the one that shipped (search/results.tsx's fallback branch hardcoding
 * `bestMatch={false}` and never reaching DriverListCard's "MEILLEURE
 * CORRESPONDANCE" branch) shows up as a snapshot diff on the affected props
 * directly, not just as a missing string somewhere in the file.
 *
 * `__mocks__/react-native.ts` + this package's `vitest.config.ts` aliases
 * make this possible without jsdom or native modules: RN host components
 * are swapped for opaque string tags (e.g. `View` -> `'View'`), which
 * react-test-renderer treats as ordinary host component types and
 * serializes by that name — enough to snapshot structure, text content, and
 * style/props without an actual mobile runtime.
 */

const baseCardData: DriverListCardData = {
  driverName: 'Mehdi Gharbi',
  ratingAvg: 4.7,
  timeLabel: '21:28',
  priceLabel: '5.5 DT',
  pickupCityLabel: 'La Marsa',
  pickupPlaceLabel: 'Point de rendez-vous',
  pickupWalkLabel: '2 min',
  dropoffCityLabel: 'Avenue Habib Bourguiba',
  seatsAvailable: 4,
};

describe('DriverListCard snapshots', () => {
  it('renders a regular (non-best-match) card in the light theme', () => {
    const tree = renderJSON(<DriverListCard theme={lightPalette} data={baseCardData} bestMatch={false} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders the "MEILLEURE CORRESPONDANCE" best-match card', () => {
    const tree = renderJSON(<DriverListCard theme={lightPalette} data={baseCardData} bestMatch />);
    expect(tree).toMatchSnapshot();
  });

  it('renders with fellow-passenger avatars instead of the seat-count text', () => {
    const data: DriverListCardData = {
      ...baseCardData,
      passengers: [
        { userId: 'u1', name: 'Sarah', avatarUrl: null },
        { userId: 'u2', name: 'Karim', avatarUrl: null },
      ],
    };
    const tree = renderJSON(<DriverListCard theme={lightPalette} data={data} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders with a real dropoff place/walk label and a time-offset note', () => {
    const data: DriverListCardData = {
      ...baseCardData,
      dropoffPlaceLabel: 'Avenue Habib Bourguiba, Tunis',
      dropoffWalkLabel: '4 min à pied',
      timeOffsetNote: "Part 15 min après l'heure demandée, vous prend à 2 min à pied.",
    };
    const tree = renderJSON(<DriverListCard theme={lightPalette} data={data} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders in the dark theme', () => {
    const tree = renderJSON(<DriverListCard theme={darkPalette} data={baseCardData} bestMatch />);
    expect(tree).toMatchSnapshot();
  });
});

const baseReview: ReviewCardData = {
  raterName: 'Emma L.',
  stars: 5,
  when: 'il y a 2 jours',
  comment: 'Trajet impeccable, très ponctuel.',
};

describe('ReviewCard snapshots', () => {
  it('renders with the legacy static palette when no theme prop is given', () => {
    const tree = renderJSON(<ReviewCard review={baseReview} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders themed (light palette) once a screen passes theme', () => {
    const tree = renderJSON(<ReviewCard review={baseReview} theme={lightPalette} />);
    expect(tree).toMatchSnapshot();
  });

  it('renders a partial (non-5-star) rating themed', () => {
    const tree = renderJSON(<ReviewCard review={{ ...baseReview, stars: 3 }} theme={lightPalette} />);
    expect(tree).toMatchSnapshot();
  });
});

describe('EmptyState snapshots', () => {
  it('renders the genuine no-results state with a notify-me action', () => {
    const tree = renderJSON(
      <EmptyState
        title="Personne sur ce trajet pour le moment."
        actionLabel="Me notifier si un trajet apparaît"
        onAction={() => {}}
      />,
    );
    expect(tree).toMatchSnapshot();
  });

  it('renders with the action disabled once notified', () => {
    const tree = renderJSON(
      <EmptyState
        title="Personne sur ce trajet pour le moment."
        actionLabel="Nous vous préviendrons ✓"
        actionDisabled
        onAction={() => {}}
      />,
    );
    expect(tree).toMatchSnapshot();
  });
});
