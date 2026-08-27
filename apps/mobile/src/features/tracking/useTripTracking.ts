import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { skipToken } from '@reduxjs/toolkit/query/react';
import Constants from 'expo-constants';
import { deriveTrackingStatus } from '@vaya/domain';
import { useAppSelector } from '../../state/store';
import { useGetTrackingStateQuery, type TrackingState } from '../../state/api';

function getApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  return extra?.apiBaseUrl ?? 'http://localhost:3000/api/v1';
}

/** `GET /ws/trips/:id?token=` (docs/domain/live-tracking.md) — auth travels
 *  as a query param since RN's WebSocket client can't set a custom
 *  Authorization header on the handshake. */
function buildWsUrl(tripId: string, token: string): string {
  const wsBase = getApiBaseUrl().replace(/^http/, 'ws');
  return `${wsBase}/ws/trips/${tripId}?token=${encodeURIComponent(token)}`;
}

export type TrackingConnectionState = 'connecting' | 'live' | 'polling' | 'unauthorized';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 20000;
const POLL_INTERVAL_MS = 5000;
// How often to recompute trackingStatus locally against wall-clock time —
// a server push can go stale from the client's own point of view even
// between pushes (docs/domain/live-tracking.md's two-orthogonal-state-
// machines rule: never trust "live" just because the last message said so).
const LOCAL_RECOMPUTE_INTERVAL_MS = 5000;

interface WsSnapshotMessage extends TrackingState {
  type: 'snapshot';
}
interface WsStatusMessage {
  type: 'status';
  tripStatus: TrackingState['tripStatus'];
}
interface WsLocationMessage {
  type: 'location';
  tripStatus: TrackingState['tripStatus'];
  trackingStatus: TrackingState['trackingStatus'];
  currentLat: number | null;
  currentLng: number | null;
  currentHeadingDeg: number | null;
  currentSpeedMps: number | null;
  locationUpdatedAt: string | null;
  etaSec?: number | null;
  distanceRemainingM?: number | null;
}
interface WsTrackingIssueMessage {
  type: 'tracking_issue';
}
type WsMessage = WsSnapshotMessage | WsStatusMessage | WsLocationMessage | WsTrackingIssueMessage;

function isWsMessage(value: unknown): value is WsMessage {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

export interface UseTripTrackingResult {
  trackingState: TrackingState | undefined;
  connectionState: TrackingConnectionState;
  isLoading: boolean;
  error: unknown;
  /** True from the moment a `tracking_issue` push arrives until the screen
   *  calls `acknowledgeTrackingIssue` — a one-time banner, not a persistent
   *  fatal state (tracking may resume on its own). */
  trackingIssueReported: boolean;
  acknowledgeTrackingIssue: () => void;
  /** Real ETA/distance from the most recent location push — null whenever
   *  the server didn't recompute one on that particular ping (throttled
   *  server-side to ETA_RECOMPUTE_INTERVAL_MS) or none has arrived yet.
   *  Never synthesize a value here when this is null. */
  etaSec: number | null;
  distanceRemainingM: number | null;
}

/**
 * WebSocket-primary, REST-polling-fallback live tracking feed
 * (docs/domain/live-tracking.md). Never runs both transports "live" at
 * once: `useGetTrackingStateQuery`'s pollingInterval is 0 whenever the
 * socket itself is connected, and re-enables the instant it disconnects.
 */
export function useTripTracking(tripId: string | undefined): UseTripTrackingResult {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [connectionState, setConnectionState] = useState<TrackingConnectionState>('connecting');
  const [wsState, setWsState] = useState<TrackingState | undefined>(undefined);
  const [etaSec, setEtaSec] = useState<number | null>(null);
  const [distanceRemainingM, setDistanceRemainingM] = useState<number | null>(null);
  const [trackingIssueReported, setTrackingIssueReported] = useState(false);
  const [, forceTick] = useState(0);

  const reconnectRequestRef = useRef<() => void>(() => {});

  const restQuery = useGetTrackingStateQuery(
    tripId && connectionState !== 'unauthorized' ? tripId : skipToken,
    { pollingInterval: connectionState === 'live' ? 0 : POLL_INTERVAL_MS },
  );

  useEffect(() => {
    if (!tripId || !accessToken) {
      setConnectionState('connecting');
      return;
    }
    const currentTripId = tripId;
    const currentToken = accessToken;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = RECONNECT_BASE_MS;
    let unauthorized = false;

    function clearTimer(): void {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect(): void {
      clearTimer();
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX_MS);
        openSocket();
      }, reconnectDelay);
    }

    function applyMessage(msg: WsMessage): void {
      if (msg.type === 'snapshot') {
        setWsState({
          tripStatus: msg.tripStatus,
          trackingStatus: msg.trackingStatus,
          currentLat: msg.currentLat,
          currentLng: msg.currentLng,
          currentHeadingDeg: msg.currentHeadingDeg,
          currentSpeedMps: msg.currentSpeedMps,
          locationUpdatedAt: msg.locationUpdatedAt,
          routePolyline: msg.routePolyline,
          pickup: msg.pickup,
          destination: msg.destination,
        });
      } else if (msg.type === 'status') {
        setWsState((prev) => (prev ? { ...prev, tripStatus: msg.tripStatus } : prev));
      } else if (msg.type === 'location') {
        if (msg.etaSec !== undefined) setEtaSec(msg.etaSec);
        if (msg.distanceRemainingM !== undefined) setDistanceRemainingM(msg.distanceRemainingM);
        setWsState((prev) => ({
          tripStatus: msg.tripStatus,
          trackingStatus: msg.trackingStatus,
          currentLat: msg.currentLat,
          currentLng: msg.currentLng,
          currentHeadingDeg: msg.currentHeadingDeg,
          currentSpeedMps: msg.currentSpeedMps,
          locationUpdatedAt: msg.locationUpdatedAt,
          routePolyline: prev?.routePolyline ?? null,
          pickup: prev?.pickup ?? { lat: 0, lng: 0, label: '' },
          destination: prev?.destination ?? { lat: 0, lng: 0, label: '' },
        }));
      } else if (msg.type === 'tracking_issue') {
        setTrackingIssueReported(true);
      }
    }

    function openSocket(): void {
      if (cancelled || unauthorized) return;
      setConnectionState((prev) => (prev === 'live' ? prev : 'connecting'));

      let ws: WebSocket;
      try {
        ws = new WebSocket(buildWsUrl(currentTripId, currentToken));
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        reconnectDelay = RECONNECT_BASE_MS;
      };
      ws.onmessage = (event) => {
        if (cancelled) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (!isWsMessage(parsed)) return;
        setConnectionState('live');
        applyMessage(parsed);
      };
      ws.onclose = (event) => {
        socket = null;
        if (cancelled) return;
        if (event.code === 4401) {
          unauthorized = true;
          setConnectionState('unauthorized');
          return;
        }
        setConnectionState('polling');
        scheduleReconnect();
      };
      // onclose always fires immediately after onerror in both RN's
      // WebSocket implementation and the browser spec — no separate
      // handling needed here.
      ws.onerror = () => {};
    }

    function forceReconnect(): void {
      if (unauthorized) return;
      clearTimer();
      reconnectDelay = RECONNECT_BASE_MS;
      socket?.close();
      openSocket();
    }
    reconnectRequestRef.current = forceReconnect;

    openSocket();

    return () => {
      cancelled = true;
      clearTimer();
      socket?.close();
      socket = null;
    };
  }, [tripId, accessToken]);

  // App background/foreground: a backgrounded socket may die silently
  // (fine — we don't fight to keep it alive) but on return to foreground we
  // force a fresh reconnect attempt plus one manual refetch, so the screen
  // is never left showing stale state after a backgrounding.
  useEffect(() => {
    function onChange(state: AppStateStatus): void {
      if (state === 'active') {
        reconnectRequestRef.current();
        void restQuery.refetch();
      }
    }
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local staleness recompute — a ticking clock, not just server pushes,
  // decides whether "live" still holds (see this hook's own top comment).
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), LOCAL_RECOMPUTE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // While the socket is actually connected, it's the freshest source by
  // definition. The moment it isn't (polling/connecting/unauthorized),
  // `restQuery.data` — actively refetching on POLL_INTERVAL_MS — is fresher
  // than whatever `wsState` was last set to, which otherwise would sit
  // stale forever (wsState is never cleared back to undefined once a
  // socket has connected once, by design — it's a cache of the last-known
  // push, not a liveness flag). Falls back to wsState only if REST hasn't
  // returned anything yet (e.g. the very first render before either
  // transport has responded).
  const rawState = connectionState === 'live' ? wsState : (restQuery.data ?? wsState);
  const trackingState: TrackingState | undefined = rawState
    ? {
        ...rawState,
        trackingStatus: deriveTrackingStatus({
          tripStatus: rawState.tripStatus,
          locationUpdatedAt: rawState.locationUpdatedAt ? new Date(rawState.locationUpdatedAt) : null,
          now: new Date(),
        }),
      }
    : undefined;

  return {
    trackingState,
    connectionState,
    isLoading: Boolean(tripId) && restQuery.isLoading && !trackingState,
    error: restQuery.error,
    trackingIssueReported,
    acknowledgeTrackingIssue: () => setTrackingIssueReported(false),
    etaSec,
    distanceRemainingM,
  };
}
