import { describe, it, expect } from 'vitest';
import {
  evaluateAutoNoShowClassification,
  AUTO_NO_SHOW_PICKUP_WAIT_MS,
  AUTO_NO_SHOW_DRIVER_GRACE_MS,
} from '../no-show-inference';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-104) — spec §37
 * "No-Show": "VAYA may also automatically classify one when evidence is
 * sufficiently strong." Confirmed 100% missing before this pass: no
 * auto-classification path existed anywhere — no-show could only ever be
 * reported by a human tap (bookings.service.ts's reportNoShow).
 *
 * Only the driver ever broadcasts live location in this codebase, so both
 * branches below are built from the driver's side of the encounter only —
 * conservative by construction whenever that evidence is missing or
 * ambiguous, same discipline `evaluateBoarding`/`evaluateAutoStart` already
 * establish elsewhere in this suite.
 */

describe('evaluateAutoNoShowClassification — automatic no-show classification (M-104)', () => {
  it('passenger no-show: driver confirmed arrival at pickup and waited past the threshold with no boarding', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'pickup',
      msSincePickupConfirmed: AUTO_NO_SHOW_PICKUP_WAIT_MS + 1,
      msSinceDeparture: AUTO_NO_SHOW_PICKUP_WAIT_MS + 1,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: true,
    });
    expect(result.shouldClassify).toBe(true);
    expect(result.reportedParty).toBe('rider');
    expect(result.reason).toBe('passenger_absent_after_driver_waited');
  });

  it('conservative: driver arrived at pickup but hasn\'t waited long enough yet — no classification', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'pickup',
      msSincePickupConfirmed: AUTO_NO_SHOW_PICKUP_WAIT_MS - 1,
      msSinceDeparture: AUTO_NO_SHOW_PICKUP_WAIT_MS - 1,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: true,
    });
    expect(result.shouldClassify).toBe(false);
    expect(result.reportedParty).toBeNull();
    expect(result.reason).toBe('insufficient_evidence');
  });

  it('driver no-show: departure long passed, trip never left scheduled, driver actively tracked but never near origin', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'scheduled',
      msSincePickupConfirmed: null,
      msSinceDeparture: AUTO_NO_SHOW_DRIVER_GRACE_MS + 1,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: false,
    });
    expect(result.shouldClassify).toBe(true);
    expect(result.reportedParty).toBe('driver');
    expect(result.reason).toBe('driver_never_arrived_despite_active_tracking');
  });

  it('conservative (the whole point of this row): trip overdue and stuck scheduled, but the driver\'s phone never produced a single fix — silence is not evidence', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'scheduled',
      msSincePickupConfirmed: null,
      msSinceDeparture: AUTO_NO_SHOW_DRIVER_GRACE_MS + 1,
      driverLocationActiveSinceDeparture: false,
      driverEverNearOrigin: false,
    });
    expect(result.shouldClassify).toBe(false);
    expect(result.reason).toBe('insufficient_evidence');
  });

  it('conservative: driver actively tracked and never near origin, but grace period not yet elapsed', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'scheduled',
      msSincePickupConfirmed: null,
      msSinceDeparture: AUTO_NO_SHOW_DRIVER_GRACE_MS - 1,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: false,
    });
    expect(result.shouldClassify).toBe(false);
  });

  it('driver did arrive near origin at some point — never classifies a driver no-show even well past the grace period', () => {
    const result = evaluateAutoNoShowClassification({
      tripStatus: 'scheduled',
      msSincePickupConfirmed: null,
      msSinceDeparture: AUTO_NO_SHOW_DRIVER_GRACE_MS * 10,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: true,
    });
    expect(result.shouldClassify).toBe(false);
  });

  it('any other trip status never auto-classifies, regardless of timing', () => {
    const active = evaluateAutoNoShowClassification({
      tripStatus: 'active',
      msSincePickupConfirmed: AUTO_NO_SHOW_PICKUP_WAIT_MS * 10,
      msSinceDeparture: AUTO_NO_SHOW_DRIVER_GRACE_MS * 10,
      driverLocationActiveSinceDeparture: true,
      driverEverNearOrigin: false,
    });
    expect(active.shouldClassify).toBe(false);
    expect(active.reason).toBe('insufficient_evidence');
  });
});
