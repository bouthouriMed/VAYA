import { describe, it, expect } from 'vitest';
import { computeRatingAggregate } from '../rating-aggregate';

describe('computeRatingAggregate', () => {
  it('returns zeros for no ratings', () => {
    expect(computeRatingAggregate([])).toEqual({ ratingAvg: 0, punctualityScore: 0 });
  });

  it('averages stars across all ratings', () => {
    const result = computeRatingAggregate([
      { stars: 5, punctualityFlag: null },
      { stars: 3, punctualityFlag: null },
      { stars: 4, punctualityFlag: null },
    ]);
    expect(result.ratingAvg).toBeCloseTo(4, 5);
  });

  it('computes punctualityScore only over ratings that set the flag, ignoring nulls', () => {
    const result = computeRatingAggregate([
      { stars: 5, punctualityFlag: true },
      { stars: 5, punctualityFlag: true },
      { stars: 5, punctualityFlag: false },
      { stars: 5, punctualityFlag: null }, // skipped by the rater — must not count as "not punctual"
    ]);
    expect(result.punctualityScore).toBeCloseTo(2 / 3, 5);
  });

  it('is 0 (not NaN) when no rating ever set a punctuality flag', () => {
    const result = computeRatingAggregate([
      { stars: 4, punctualityFlag: null },
      { stars: 5, punctualityFlag: null },
    ]);
    expect(result.punctualityScore).toBe(0);
  });

  it('recomputes from scratch — reflects removal of a rating rather than decrementing', () => {
    const withThree = computeRatingAggregate([
      { stars: 5, punctualityFlag: true },
      { stars: 1, punctualityFlag: false },
      { stars: 3, punctualityFlag: true },
    ]);
    expect(withThree.ratingAvg).toBeCloseTo(3, 5);

    // Same inputs minus the removed rating — "recompute from all ratings"
    // means this is just a different input list, not a stateful decrement.
    const afterRemoval = computeRatingAggregate([
      { stars: 5, punctualityFlag: true },
      { stars: 3, punctualityFlag: true },
    ]);
    expect(afterRemoval.ratingAvg).toBeCloseTo(4, 5);
    expect(afterRemoval.punctualityScore).toBe(1);
  });
});
