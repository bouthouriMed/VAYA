import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { WebSocket } from 'ws';
import {
  registerTripSocket,
  unregisterTripSocket,
  publishTripUpdate,
  getTripRoomSizeForTest,
  isRealtimeSubscriberReadyForTest,
} from '../realtime.js';

/**
 * M-094/INV-06 (docs/unified_driver_and_passenger_journey.md §32, §62) —
 * real Redis pub/sub round-trip (REDIS_URL is configured in this test env,
 * same discipline as every other integration suite in this codebase), not
 * a mocked publish/subscribe pair. Proves the gap this pass found and fixed:
 * `publishTripUpdate`'s broadcast previously sent the exact same raw-GPS
 * `location` payload to every socket in a trip's room regardless of role or
 * trip status — the WS push path bypassed `getTrackingState`'s own
 * pre-boarding redaction entirely. Fake sockets (matching only the `ws`
 * shape `realtime.ts` actually uses — `readyState`/`OPEN`/`send`) stand in
 * for real network connections; the pub/sub delivery itself is real.
 */
function makeFakeSocket(): WebSocket & { sent: unknown[] } {
  const socket = {
    readyState: 1, // WebSocket.OPEN
    OPEN: 1,
    sent: [] as unknown[],
    send(data: string) {
      (socket.sent as unknown[]).push(JSON.parse(data));
    },
  };
  return socket as unknown as WebSocket & { sent: unknown[] };
}

async function waitForMessages(socket: { sent: unknown[] }, count: number, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (socket.sent.length < count) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${count} message(s)`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function waitForSubscriberReady(timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!isRealtimeSubscriberReadyForTest()) {
    if (Date.now() - start > timeoutMs) throw new Error('Redis pub/sub subscriber never became ready');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('realtime.ts — role-aware GPS redaction in the live-tracking WS broadcast (M-094, INV-06)', () => {
  let tripId: string;
  let driverSocket: WebSocket & { sent: unknown[] };
  let riderSocket: WebSocket & { sent: unknown[] };

  beforeEach(() => {
    // A fresh trip id + fresh sockets per test — real Redis pub/sub is a
    // shared broker, so a stale room/subscription from a prior test must
    // never leak a message into this one.
    tripId = `test-trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    driverSocket = makeFakeSocket();
    riderSocket = makeFakeSocket();
  });

  afterEach(() => {
    unregisterTripSocket(tripId, driverSocket);
    unregisterTripSocket(tripId, riderSocket);
  });

  it('sends the driver full raw GPS but redacts the rider while the trip is genuinely pre-boarding', async () => {
    registerTripSocket(tripId, driverSocket, true);
    registerTripSocket(tripId, riderSocket, false);
    expect(getTripRoomSizeForTest(tripId)).toBe(2);
    // The Redis SUBSCRIBE this room's first registration triggers is
    // asynchronous (lib/realtime.ts's ensureSubscriber) — publishing before
    // it actually completes would miss the message entirely, which is a
    // test-timing concern here, not a production bug (a real client
    // reconnects and gets a fresh `snapshot` on connect either way).
    await waitForSubscriberReady();

    await publishTripUpdate(tripId, {
      type: 'location',
      tripStatus: 'driver_approaching', // pre-boarding
      trackingStatus: 'live',
      currentLat: 36.81,
      currentLng: 10.19,
      currentHeadingDeg: 45,
      currentSpeedMps: 8,
      locationUpdatedAt: new Date().toISOString(),
    });

    await waitForMessages(driverSocket, 1);
    await waitForMessages(riderSocket, 1);

    const driverMsg = driverSocket.sent[0] as Record<string, unknown>;
    expect(driverMsg.currentLat).toBe(36.81);
    expect(driverMsg.currentLng).toBe(10.19);

    const riderMsg = riderSocket.sent[0] as Record<string, unknown>;
    expect(riderMsg.currentLat).toBeNull();
    expect(riderMsg.currentLng).toBeNull();
    expect(riderMsg.currentHeadingDeg).toBeNull();
    expect(riderMsg.currentSpeedMps).toBeNull();
    expect(riderMsg.locationUpdatedAt).toBeNull();
    // Non-GPS fields survive redaction unchanged.
    expect(riderMsg.trackingStatus).toBe('live');
    expect(riderMsg.tripStatus).toBe('driver_approaching');
  });

  it('sends the rider full raw GPS once the trip is genuinely post-boarding', async () => {
    registerTripSocket(tripId, driverSocket, true);
    registerTripSocket(tripId, riderSocket, false);

    await publishTripUpdate(tripId, {
      type: 'location',
      tripStatus: 'active', // post-boarding
      trackingStatus: 'live',
      currentLat: 36.82,
      currentLng: 10.2,
      currentHeadingDeg: 90,
      currentSpeedMps: 12,
      locationUpdatedAt: new Date().toISOString(),
    });

    await waitForMessages(driverSocket, 1);
    await waitForMessages(riderSocket, 1);

    const riderMsg = riderSocket.sent[0] as Record<string, unknown>;
    expect(riderMsg.currentLat).toBe(36.82);
    expect(riderMsg.currentLng).toBe(10.2);
  });

  it('never redacts non-location payloads (status/tracking_issue carry no GPS at all)', async () => {
    registerTripSocket(tripId, riderSocket, false);

    await publishTripUpdate(tripId, { type: 'status', tripStatus: 'pickup' });
    await waitForMessages(riderSocket, 1);

    expect(riderSocket.sent[0]).toEqual({ type: 'status', tripStatus: 'pickup' });
  });
});
