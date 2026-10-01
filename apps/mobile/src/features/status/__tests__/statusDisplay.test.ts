import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BOOKING_PHASES, RIDE_STATUSES } from '@vaya/domain';
import { bookingStatusDisplay, rideStatusDisplay } from '../statusDisplay';

const t = ((key: string) => key) as never;

describe('status labels', () => {
  it.each(['fr', 'en', 'ar'])('every booking phase and ride status has a %s label', (locale) => {
    const booking = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, `../../../services/i18n/locales/${locale}/booking.json`), 'utf8'),
    ) as { phase: Record<string, string>; ridePhase: Record<string, string> };
    for (const phase of BOOKING_PHASES) expect(booking.phase[phase], phase).toBeTruthy();
    for (const status of RIDE_STATUSES) expect(booking.ridePhase[status], status).toBeTruthy();
  });

  it('an accepted booking on a ride that has not started is "confirmed" everywhere', () => {
    expect(bookingStatusDisplay(t, 'accepted', { rideStatus: 'published' })).toMatchObject({
      phase: 'confirmed',
      label: 'booking:phase.confirmed',
      tone: 'success',
    });
  });

  it('handles the superseded status the client type used to be missing', () => {
    expect(bookingStatusDisplay(t, 'superseded').label).toBe('booking:phase.superseded');
  });

  it('ride statuses map to ridePhase labels', () => {
    expect(rideStatusDisplay(t, 'full')).toEqual({ label: 'booking:ridePhase.full', tone: 'info' });
  });
});
