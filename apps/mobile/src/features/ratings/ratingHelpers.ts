import type { RatingRole, TrustTier } from '../../state/api';

export interface SubmitRatingInput {
  stars: number;
  punctualityFlag?: boolean;
  comment?: string;
}

export interface SubmitRatingDeps {
  createRating: (input: SubmitRatingInput & { role: RatingRole }) => Promise<unknown>;
  trackEvent: (name: string, payload?: Record<string, string | number | boolean | null>) => void;
  role: RatingRole;
}

/**
 * The rating-submission bottom sheet's orchestration, pulled out of the
 * component so it's testable without a React Native rendering harness —
 * same discipline as Phase 8's conversationHelpers.ts's submitMessage (this
 * repo still has no component-render test setup, docs/roadmap/README.md's
 * Phase 7 notes). Client-side star-range validation is a UX nicety only —
 * the server independently re-validates via `createRatingSchema`
 * (packages/validation/src/ratings.ts) and is the actual enforcement point.
 * Fires `rating_submitted` only after a real submission succeeds.
 */
export async function submitRating(input: SubmitRatingInput, deps: SubmitRatingDeps): Promise<boolean> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) return false;

  await deps.createRating({
    role: deps.role,
    stars: input.stars,
    punctualityFlag: input.punctualityFlag,
    comment: input.comment?.trim() ? input.comment.trim() : undefined,
  });
  deps.trackEvent('rating_submitted', { role: deps.role });
  return true;
}

/** VAYA-branded label + existing Badge variant for a computed trust tier
 *  (packages/domain/src/rating/trust-tier.ts) — kept here (not in the
 *  design system) since it's product copy/mapping, not a new visual
 *  pattern (Badge itself is unchanged, Phase 2). */
export function trustTierBadge(tier: TrustTier): {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'error' | 'info';
} {
  switch (tier) {
    case 'top_rated':
      return { label: 'Top VAYA', variant: 'success' };
    case 'trusted':
      return { label: 'Confiance', variant: 'info' };
    case 'new':
    default:
      return { label: 'Nouveau', variant: 'default' };
  }
}
