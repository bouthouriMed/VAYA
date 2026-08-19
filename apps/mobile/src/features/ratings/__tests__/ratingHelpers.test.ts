import { describe, it, expect, vi } from 'vitest';
import { submitRating, trustTierBadge } from '../ratingHelpers';

describe('submitRating', () => {
  it('rejects an out-of-range star value without calling createRating', async () => {
    const createRating = vi.fn();
    const trackEvent = vi.fn();
    const result = await submitRating(
      { stars: 0 },
      { createRating, trackEvent, role: 'rider_rates_driver' },
    );
    expect(result).toBe(false);
    expect(createRating).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('rejects a non-integer star value', async () => {
    const createRating = vi.fn();
    const trackEvent = vi.fn();
    const result = await submitRating(
      { stars: 3.5 },
      { createRating, trackEvent, role: 'rider_rates_driver' },
    );
    expect(result).toBe(false);
    expect(createRating).not.toHaveBeenCalled();
  });

  it('submits with the caller role, trims a comment, and tracks rating_submitted', async () => {
    const createRating = vi.fn().mockResolvedValue({ id: 'r1' });
    const trackEvent = vi.fn();
    const result = await submitRating(
      { stars: 5, punctualityFlag: true, comment: '  Great!  ' },
      { createRating, trackEvent, role: 'driver_rates_rider' },
    );
    expect(result).toBe(true);
    expect(createRating).toHaveBeenCalledWith({
      role: 'driver_rates_rider',
      stars: 5,
      punctualityFlag: true,
      comment: 'Great!',
    });
    expect(trackEvent).toHaveBeenCalledWith('rating_submitted', { role: 'driver_rates_rider' });
  });

  it('omits an empty/whitespace-only comment rather than sending an empty string', async () => {
    const createRating = vi.fn().mockResolvedValue({ id: 'r1' });
    const trackEvent = vi.fn();
    await submitRating(
      { stars: 4, comment: '   ' },
      { createRating, trackEvent, role: 'rider_rates_driver' },
    );
    expect(createRating).toHaveBeenCalledWith({
      role: 'rider_rates_driver',
      stars: 4,
      punctualityFlag: undefined,
      comment: undefined,
    });
  });

  it('propagates a submission failure without tracking rating_submitted', async () => {
    const createRating = vi.fn().mockRejectedValue(new Error('window expired'));
    const trackEvent = vi.fn();
    await expect(
      submitRating({ stars: 5 }, { createRating, trackEvent, role: 'rider_rates_driver' }),
    ).rejects.toThrow('window expired');
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe('trustTierBadge', () => {
  it('maps "new" to a neutral default badge', () => {
    expect(trustTierBadge('new')).toEqual({ label: 'Nouveau', variant: 'default' });
  });

  it('maps "trusted" to an info badge', () => {
    expect(trustTierBadge('trusted')).toEqual({ label: 'Confiance', variant: 'info' });
  });

  it('maps "top_rated" to a success badge', () => {
    expect(trustTierBadge('top_rated')).toEqual({ label: 'Top VAYA', variant: 'success' });
  });
});
