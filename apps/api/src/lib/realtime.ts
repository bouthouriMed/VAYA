import IORedis from 'ioredis';
import type { WebSocket } from 'ws';
import type { TripStatus } from '@vaya/domain';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';

/**
 * Live-tracking realtime fan-out (docs/domain/live-tracking.md). One room
 * (open WebSocket connections, keyed by socket, each tagged with its role)
 * per trip, kept in this process's memory. When REDIS_URL is configured, every publish also goes through a
 * Redis pub/sub channel — the *only* path any instance uses to deliver to
 * its own local sockets too (a single instance is simply subscribed to its
 * own channel), so this is correct unmodified whether the API runs as one
 * process or many, with zero special-casing. Falls back to pure in-process
 * delivery when Redis isn't configured (matches this repo's existing
 * REDIS_URL-optional pattern in lib/queue.ts).
 *
 * Deliberately not BullMQ/the notification queue: this is fire-and-forget,
 * highest-recency-wins fan-out, not a durable job that needs retries or a
 * dead-letter queue — pub/sub is the right primitive, not a second queue.
 */
const CHANNEL_PREFIX = 'trip-location:';

interface TripUpdateMessage {
  tripId: string;
  payload: unknown;
}

// M-094/INV-06 (docs/unified_driver_and_passenger_journey.md §32, §62):
// each socket's role is tracked alongside it (not just a bare Set) so a
// `location` payload can be redacted per-recipient at delivery time —
// mirrors `getTrackingState`'s (apps/api/src/modules/trips/trips.service.ts)
// same pre-boarding-rider-never-sees-raw-GPS rule, applied to the
// real-time push path too. Confirmed live (this pass) that this room
// previously broadcast the exact same raw-GPS payload to every connected
// socket regardless of role or trip status — the poll-based
// `getTrackingState` fix alone left this push path wide open.
const rooms = new Map<string, Map<WebSocket, { isDriver: boolean }>>();

// Mirrors trips.service.ts's own PRE_BOARDING_TRIP_STATUSES exactly —
// duplicated (not imported) to avoid a circular import (trips.service.ts
// already imports `publishTripUpdate` from this module). Boarding is
// `pickup -> active` (see trip/boarding-inference.ts).
const PRE_BOARDING_TRIP_STATUSES: readonly TripStatus[] = ['scheduled', 'driver_approaching', 'pickup'];

/** A `location`-type payload's raw GPS fields, redacted the same way
 *  `getTrackingState` redacts them for a pre-boarding rider. Any other
 *  payload type (`status`/`tracking_issue`) is returned unchanged — it
 *  never carries raw position data. */
function redactForRider(payload: unknown): unknown {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    (payload as { type?: unknown }).type !== 'location'
  ) {
    return payload;
  }
  const p = payload as Record<string, unknown> & { tripStatus?: TripStatus };
  if (!p.tripStatus || !PRE_BOARDING_TRIP_STATUSES.includes(p.tripStatus)) return payload;

  return {
    ...p,
    currentLat: null,
    currentLng: null,
    currentHeadingDeg: null,
    currentSpeedMps: null,
    locationUpdatedAt: null,
  };
}

let publisher: IORedis | null = null;
let subscriber: IORedis | null = null;
let subscriberReady = false;

function getPublisher(): IORedis | null {
  const env = getEnv();
  if (!env.REDIS_URL) return null;
  if (!publisher) {
    publisher = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    publisher.on('error', (err) => getLogger().error({ err }, 'Realtime publisher Redis error'));
  }
  return publisher;
}

function deliverLocally(tripId: string, payload: unknown): void {
  const sockets = rooms.get(tripId);
  if (!sockets || sockets.size === 0) return;
  // Two candidate messages, computed once per broadcast (not per socket) —
  // the driver's own view is always the full payload; a rider's view is
  // redacted only while genuinely pre-boarding (redactForRider is a no-op
  // otherwise, or for non-`location` payload types).
  const fullMessage = JSON.stringify(payload);
  const riderMessage = JSON.stringify(redactForRider(payload));
  for (const [socket, { isDriver }] of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(isDriver ? fullMessage : riderMessage);
    }
  }
}

function ensureSubscriber(): void {
  const env = getEnv();
  if (!env.REDIS_URL || subscriber) return;
  subscriber = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => getLogger().error({ err }, 'Realtime subscriber Redis error'));
  subscriber.on('ready', () => {
    subscriberReady = true;
  });
  subscriber.psubscribe(`${CHANNEL_PREFIX}*`).catch((err) => {
    getLogger().error({ err }, 'Failed to psubscribe to trip-location channels');
  });
  subscriber.on('pmessage', (_pattern, _channel, raw) => {
    try {
      const message = JSON.parse(raw) as TripUpdateMessage;
      deliverLocally(message.tripId, message.payload);
    } catch (err) {
      getLogger().error({ err }, 'Failed to parse realtime pub/sub message');
    }
  });
}

/** Registers a passenger/driver's open WebSocket into a trip's room. `isDriver`
 *  is captured once at connection time (the caller already resolved it via
 *  `getTrackingState`'s own party check) so every subsequent broadcast to
 *  this socket can be redacted correctly without re-deriving role per
 *  message. Caller is responsible for removing it (see
 *  `unregisterTripSocket`) on close. */
export function registerTripSocket(tripId: string, socket: WebSocket, isDriver: boolean): void {
  ensureSubscriber();
  let room = rooms.get(tripId);
  if (!room) {
    room = new Map();
    rooms.set(tripId, room);
  }
  room.set(socket, { isDriver });
}

export function unregisterTripSocket(tripId: string, socket: WebSocket): void {
  const room = rooms.get(tripId);
  if (!room) return;
  room.delete(socket);
  if (room.size === 0) rooms.delete(tripId);
}

/** Broadcasts a trip-tracking payload to every socket subscribed to this
 *  trip, across every API instance. Never throws — a broadcast failure must
 *  never fail the location-update request that triggered it. */
export async function publishTripUpdate(tripId: string, payload: unknown): Promise<void> {
  const redis = getPublisher();
  if (!redis) {
    // No Redis configured — single-instance fallback, deliver directly.
    deliverLocally(tripId, payload);
    return;
  }
  try {
    await redis.publish(`${CHANNEL_PREFIX}${tripId}`, JSON.stringify({ tripId, payload }));
  } catch (err) {
    getLogger().error({ err, tripId }, 'Failed to publish trip location update');
    // Best-effort local delivery even if Redis publish failed, so a same-
    // process subscriber isn't left hanging on a transient Redis blip.
    deliverLocally(tripId, payload);
  }
}

export function getTripRoomSizeForTest(tripId: string): number {
  return rooms.get(tripId)?.size ?? 0;
}

export function isRealtimeSubscriberReadyForTest(): boolean {
  return subscriberReady;
}
