import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import {
  analyticsEvents,
  bookings,
  driverProfiles,
  rides,
  trips,
  users,
} from '../../db/schema/index.js';

type Database = ReturnType<typeof getDatabase>;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// `any` here is deliberate: a helper generic enough to accept any of this
// file's several Drizzle tables (each its own distinct generated type) and
// any of their equally distinct `where` expressions isn't expressible
// without it — every call site below is still fully typed at the call, this
// is purely the shared plumbing.
async function count(db: Database, table: any, where?: any): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return row?.n ?? 0;
}

/**
 * Marketplace overview (CLAUDE.md sections 7/17) — the dashboard's landing
 * numbers. Deliberately several small, independently-readable queries
 * rather than one mega-join: this runs on-demand from the admin panel, not
 * on any request path a rider/driver ever waits on (CLAUDE.md: "avoid
 * analytics queries degrading ride/search performance"), so query count
 * isn't the thing to optimize for here — clarity is.
 */
export async function getOverviewMetrics(db: Database, windowDays: number) {
  const cutoff = daysAgo(windowDays);

  const [totalUsers, newUsers, activeUsers, passengerRows, driverCount, verifiedDriverCount] =
    await Promise.all([
      count(db, users),
      count(db, users, gte(users.createdAt, cutoff)),
      db
        .select({ n: sql<number>`count(distinct ${analyticsEvents.userId})::int` })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, cutoff))
        .then((r) => r[0]?.n ?? 0),
      db.select({ n: sql<number>`count(distinct ${bookings.riderId})::int` }).from(bookings),
      count(db, driverProfiles),
      count(db, driverProfiles, eq(driverProfiles.verificationStatus, 'approved')),
    ]);

  const rideStatusCounts = await db
    .select({ status: rides.status, n: sql<number>`count(*)::int` })
    .from(rides)
    .groupBy(rides.status);
  const rideStatusMap = Object.fromEntries(rideStatusCounts.map((r) => [r.status, r.n]));

  const [seatsRow] = await db
    .select({
      offered: sql<number>`coalesce(sum(${rides.seatsTotal}), 0)::int`,
      booked: sql<number>`coalesce(sum(${rides.seatsTotal} - ${rides.seatsAvailable}), 0)::int`,
    })
    .from(rides)
    .where(inArray(rides.status, ['published', 'full', 'in_progress', 'completed']));

  const [searchSubmitted, searchResultsShown, searchNoResults, searchResultSelected] =
    await Promise.all([
      count(db, analyticsEvents, and(eq(analyticsEvents.eventName, 'search_submitted'), gte(analyticsEvents.createdAt, cutoff))),
      count(db, analyticsEvents, and(eq(analyticsEvents.eventName, 'search_results_shown'), gte(analyticsEvents.createdAt, cutoff))),
      count(db, analyticsEvents, and(eq(analyticsEvents.eventName, 'search_no_results'), gte(analyticsEvents.createdAt, cutoff))),
      count(db, analyticsEvents, and(eq(analyticsEvents.eventName, 'search_result_selected'), gte(analyticsEvents.createdAt, cutoff))),
    ]);
  const [searchesWithMatches] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventName, 'search_results_shown'),
        gte(analyticsEvents.createdAt, cutoff),
        sql`${analyticsEvents.resultCount} > 0`,
      ),
    );

  const [bookingTotal, bookingAccepted, bookingCancelled] = await Promise.all([
    count(db, bookings, gte(bookings.requestedAt, cutoff)),
    count(db, bookings, and(gte(bookings.requestedAt, cutoff), inArray(bookings.status, ['accepted', 'completed']))),
    count(db, bookings, and(gte(bookings.requestedAt, cutoff), inArray(bookings.status, ['cancelled_by_rider', 'cancelled_by_driver']))),
  ]);

  const [tripTotal, tripCompleted] = await Promise.all([
    count(db, trips, gte(trips.createdAt, cutoff)),
    count(db, trips, and(gte(trips.createdAt, cutoff), eq(trips.status, 'completed'))),
  ]);

  const ratio = (numerator: number, denominator: number) =>
    denominator > 0 ? Math.round((numerator / denominator) * 1000) / 1000 : null;

  return {
    windowDays,
    users: {
      total: totalUsers,
      new: newUsers,
      active: activeUsers,
      passengers: passengerRows[0]?.n ?? 0,
      drivers: driverCount,
      verifiedDrivers: verifiedDriverCount,
    },
    rides: {
      draft: rideStatusMap.draft ?? 0,
      published: rideStatusMap.published ?? 0,
      full: rideStatusMap.full ?? 0,
      inProgress: rideStatusMap.in_progress ?? 0,
      completed: rideStatusMap.completed ?? 0,
      cancelled: rideStatusMap.cancelled ?? 0,
      seatsOffered: seatsRow?.offered ?? 0,
      seatsBooked: seatsRow?.booked ?? 0,
      utilization: ratio(seatsRow?.booked ?? 0, seatsRow?.offered ?? 0),
    },
    marketplace: {
      searches: searchSubmitted,
      searchesWithMatches: searchesWithMatches?.n ?? 0,
      zeroResultSearches: searchNoResults,
      searchResultsShown,
      searchResultSelected,
      searchToResultConversion: ratio(searchesWithMatches?.n ?? 0, searchSubmitted),
      resultToSelectionConversion: ratio(searchResultSelected, searchesWithMatches?.n ?? 0),
      bookingSuccessRate: ratio(bookingAccepted, bookingTotal),
      cancellationRate: ratio(bookingCancelled, bookingTotal),
      completionRate: ratio(tripCompleted, tripTotal),
    },
  };
}

/**
 * Missed-demand analytics (CLAUDE.md section 8) — "Tunis -> Sousse, Friday
 * 17:00-20:00, high search volume, very low supply". Demand comes from
 * `analytics_events` (real search activity); supply is approximated by
 * counting published rides whose own corridorKey matches — a real limit,
 * not a hidden one: a corridor with real *route-passthrough* supply
 * (Phase 13) that never appears as a ride's own origin/destination isn't
 * counted here, so this under-counts supply for pass-through-heavy
 * corridors rather than over-claiming a false gap.
 */
export async function getCorridorDemand(db: Database, windowDays: number) {
  const cutoff = daysAgo(windowDays);

  const demandRows = await db
    .select({
      corridorKey: analyticsEvents.corridorKey,
      originLabel: sql<string | null>`max(${analyticsEvents.originLabel})`,
      destinationLabel: sql<string | null>`max(${analyticsEvents.destinationLabel})`,
      demand: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search_submitted')::int`,
      zeroResult: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search_no_results')::int`,
      matched: sql<number>`count(*) filter (where ${analyticsEvents.eventName} = 'search_results_shown' and ${analyticsEvents.resultCount} > 0)::int`,
    })
    .from(analyticsEvents)
    .where(and(gte(analyticsEvents.createdAt, cutoff), sql`${analyticsEvents.corridorKey} is not null`))
    .groupBy(analyticsEvents.corridorKey)
    .orderBy(sql`count(*) filter (where ${analyticsEvents.eventName} = 'search_submitted') desc`)
    .limit(30);

  const supplyResult = await db.execute<{ corridor_key: string; supply: number }>(sql`
    select lower(split_part(${rides.originLabel}, ',', 1)) || '__' || lower(split_part(${rides.destinationLabel}, ',', 1)) as corridor_key,
           count(*)::int as supply
    from ${rides}
    where ${rides.status} in ('published', 'full', 'in_progress')
    group by 1
  `);
  const supplyByCorridor = new Map(supplyResult.rows.map((r) => [r.corridor_key, r.supply]));

  return demandRows.map((row) => {
    const supply = row.corridorKey ? (supplyByCorridor.get(row.corridorKey) ?? 0) : 0;
    return {
      corridorKey: row.corridorKey,
      originLabel: row.originLabel,
      destinationLabel: row.destinationLabel,
      demand: row.demand,
      supply,
      matched: row.matched,
      matchRate: row.demand > 0 ? Math.round((row.matched / row.demand) * 1000) / 1000 : null,
      unmetDemand: row.zeroResult + Math.max(row.demand - row.matched - row.zeroResult, 0),
    };
  });
}

export async function getSearchFunnel(db: Database, windowDays: number) {
  const cutoff = daysAgo(windowDays);
  const rows = await db
    .select({ eventName: analyticsEvents.eventName, n: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, cutoff))
    .groupBy(analyticsEvents.eventName);

  const byName = Object.fromEntries(rows.map((r) => [r.eventName, r.n]));
  const funnel = [
    'search_started',
    'origin_selected',
    'destination_selected',
    'search_submitted',
    'search_results_shown',
    'search_result_selected',
    'search_no_results',
    'search_abandoned',
  ] as const;

  return funnel.map((name) => ({ eventName: name, count: byName[name] ?? 0 }));
}
