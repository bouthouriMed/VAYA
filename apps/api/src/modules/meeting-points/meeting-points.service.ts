import { eq, inArray, sql } from 'drizzle-orm';
import type { MeetingPointKind } from '@vaya/domain';
import type { getDatabase } from '../../lib/database.js';
import { meetingPoints, rides } from '../../db/schema/index.js';
import { getLogger } from '../../config/logger.js';
import { createRouteProjector, decodePolyline, type LatLng } from '../../lib/polyline.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { nearestRoad } from '../../lib/routing.js';
import { queryRoadsidePlacesInBbox, type OverpassRoadsideFeature } from '../../lib/overpass.js';

type Database = ReturnType<typeof getDatabase>;

/** Only places this close to a published route are kept — a meeting point
 *  further out costs the driver a real detour (Phase 14). */
export const MEETING_POINT_ROUTE_CORRIDOR_M = 250;
/** A snapped point further than this from the feature isn't the same place. */
const MAX_SNAP_DISTANCE_M = 120;
/** Each Overpass query covers at most this much route, so a long intercity
 *  route becomes several small boxes instead of one country-sized one. */
const SCAN_CHUNK_M = 15_000;

const LOUAGE_NAME = /louage|لواج|taxi collectif|station de transport/i;

/**
 * What kind of meeting point an OpenStreetMap feature is, or null when it
 * isn't one. A bus station named for louages ("Station louage", "محطة
 * اللواج") is a louage station — how louage stations are usually mapped in
 * Tunisia.
 */
export function classifyRoadsideFeature(tags: Record<string, string>): MeetingPointKind | null {
  const name = `${tags.name ?? ''} ${tags['name:fr'] ?? ''} ${tags['name:ar'] ?? ''}`;
  if (tags.amenity === 'fuel') return 'fuel_station';
  if (tags.amenity === 'bus_station') return LOUAGE_NAME.test(name) ? 'louage_station' : 'transit_station';
  if (tags.public_transport === 'station' || ['station', 'halt', 'tram_stop'].includes(tags.railway ?? '')) {
    return 'transit_station';
  }
  if (tags.highway === 'bus_stop') return 'bus_stop';
  if (tags.junction === 'roundabout') return 'roundabout';
  if (tags.highway === 'motorway_junction') return 'highway_exit';
  return null;
}

const GENERIC_LABEL: Record<MeetingPointKind, string> = {
  fuel_station: 'Station-service',
  louage_station: 'Station louage',
  transit_station: 'Station',
  bus_stop: 'Arrêt de bus',
  roundabout: 'Rond-point',
  highway_exit: 'Sortie',
};

/** A name a passenger can look for: the place's own name, its brand for a
 *  petrol station ("Station Total"), the exit number, or a plain kind. */
export function labelRoadsideFeature(kind: MeetingPointKind, tags: Record<string, string>): string {
  const name = tags['name:fr'] ?? tags.name ?? tags['name:ar'];
  if (name) return name.slice(0, 140);
  if (kind === 'fuel_station' && tags.brand) return `Station ${tags.brand}`.slice(0, 140);
  if (kind === 'highway_exit' && tags.ref) return `Sortie ${tags.ref}`;
  return GENERIC_LABEL[kind];
}

/** Bounding boxes covering the route in ~SCAN_CHUNK_M pieces, padded by
 *  the corridor. */
export function routeScanBoxes(route: LatLng[]): { south: number; west: number; north: number; east: number }[] {
  const boxes: { south: number; west: number; north: number; east: number }[] = [];
  let chunk: LatLng[] = [];
  let length = 0;
  const flush = () => {
    if (chunk.length === 0) return;
    const padLat = MEETING_POINT_ROUTE_CORRIDOR_M / 111_320;
    const meanLat = chunk.reduce((sum, p) => sum + p.lat, 0) / chunk.length;
    const padLng = MEETING_POINT_ROUTE_CORRIDOR_M / (111_320 * Math.cos((meanLat * Math.PI) / 180));
    boxes.push({
      south: Math.min(...chunk.map((p) => p.lat)) - padLat,
      north: Math.max(...chunk.map((p) => p.lat)) + padLat,
      west: Math.min(...chunk.map((p) => p.lng)) - padLng,
      east: Math.max(...chunk.map((p) => p.lng)) + padLng,
    });
  };
  for (let i = 0; i < route.length; i++) {
    const point = route[i]!;
    if (i > 0) length += haversineDistanceMeters(route[i - 1]!, point);
    chunk.push(point);
    if (length >= SCAN_CHUNK_M) {
      flush();
      chunk = [point];
      length = 0;
    }
  }
  if (chunk.length > 1 || boxes.length === 0) flush();
  return boxes;
}

export interface ScanResult {
  found: number;
  saved: number;
}

/**
 * Collects the meeting points along one route from OpenStreetMap and saves
 * them (one row per OSM feature — a later scan of an overlapping route
 * refreshes rather than duplicates). Each point is snapped to the nearest
 * drivable road when the routing engine is reachable; a point that snaps
 * far away is skipped as not stoppable. Best-effort throughout: an
 * unreachable Overpass just saves nothing this time.
 */
export async function scanMeetingPointsAlongRoute(db: Database, polyline: string): Promise<ScanResult> {
  const route = decodePolyline(polyline);
  if (route.length < 2) return { found: 0, saved: 0 };
  const project = createRouteProjector(route);

  const features = new Map<string, OverpassRoadsideFeature>();
  for (const box of routeScanBoxes(route)) {
    for (const feature of await queryRoadsidePlacesInBbox(box)) features.set(feature.ref, feature);
  }

  let saved = 0;
  for (const feature of features.values()) {
    const kind = classifyRoadsideFeature(feature.tags);
    if (!kind) continue;
    if (project(feature).distanceM > MEETING_POINT_ROUTE_CORRIDOR_M) continue;

    let lat = feature.lat;
    let lng = feature.lng;
    let roadSnapped = false;
    const snapped = await nearestRoad({ lat, lng });
    if (snapped) {
      if (snapped.snapDistanceM > MAX_SNAP_DISTANCE_M) continue;
      lat = snapped.lat;
      lng = snapped.lng;
      roadSnapped = true;
    }

    await db
      .insert(meetingPoints)
      .values({ kind, label: labelRoadsideFeature(kind, feature.tags), lat, lng, sourceRef: `osm:${feature.ref}`, roadSnapped })
      .onConflictDoUpdate({
        target: meetingPoints.sourceRef,
        // usage_count and active are VAYA's own data: never reset by a re-scan.
        set: { kind, label: sql`excluded.label`, lat, lng, roadSnapped, updatedAt: new Date() },
      });
    saved += 1;
  }
  return { found: features.size, saved };
}

/** The job: scan the meeting points along one published ride's route. */
export async function scanMeetingPointsForRide(db: Database, rideId: string): Promise<ScanResult> {
  const ride = await db.query.rides.findFirst({ where: eq(rides.id, rideId) });
  if (!ride?.routePolyline) return { found: 0, saved: 0 };
  const result = await scanMeetingPointsAlongRoute(db, ride.routePolyline);
  getLogger().info({ rideId, ...result }, 'Meeting points scanned along ride route');
  return result;
}

/**
 * Track E: a completed trip that boarded or dropped the passenger at a
 * meeting point counts as one real use of it — the evidence the pickup
 * choice credits (usageBoostSeconds). Best-effort: never fails the trip.
 */
export async function recordMeetingPointUsage(
  db: Database,
  meetingPointIds: (string | null | undefined)[],
  usedAt: Date,
): Promise<void> {
  const ids = [...new Set(meetingPointIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  try {
    await db
      .update(meetingPoints)
      .set({ usageCount: sql`${meetingPoints.usageCount} + 1`, lastUsedAt: usedAt, updatedAt: usedAt })
      .where(inArray(meetingPoints.id, ids));
  } catch (err) {
    getLogger().warn({ err, ids }, 'Could not record meeting-point usage');
  }
}
