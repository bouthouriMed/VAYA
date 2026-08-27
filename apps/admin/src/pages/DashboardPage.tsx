import { Link } from 'react-router-dom';
import { useOverviewMetrics, useCorridorDemand } from '../api/hooks/analytics';
import { useVerificationsQueue } from '../api/hooks/verifications';
import { useAuditLogs } from '../api/hooks/auditLogs';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { formatDate, formatNumber, formatRatio, humanize } from '../utils/format';
import { isUnderservedCorridor } from '../theme/tokens';

const WINDOW_DAYS = 30;

export function DashboardPage(): React.JSX.Element {
  const overview = useOverviewMetrics(WINDOW_DAYS);
  const corridors = useCorridorDemand(WINDOW_DAYS);
  const pendingVerifications = useVerificationsQueue({ page: 1, limit: 5 });
  const auditLogs = useAuditLogs();

  const topUnmet = (corridors.data ?? [])
    .filter((c) => isUnderservedCorridor(c.demand, c.supply))
    .slice(0, 3);

  return (
    <div>
      {overview.isLoading ? (
        <LoadingBlock rows={4} />
      ) : overview.isError ? (
        <ErrorState message={(overview.error as Error).message} onRetry={() => overview.refetch()} />
      ) : overview.data ? (
        <>
          <div className="section-title">Marketplace — last {overview.data.windowDays} days</div>
          <div className="stat-grid">
            <StatTile label="Total users" value={formatNumber(overview.data.users.total)} sub={`+${overview.data.users.new} new`} />
            <StatTile label="Active users" value={formatNumber(overview.data.users.active)} sub="analytics-activity proxy" />
            <StatTile
              label="Verified drivers"
              value={formatNumber(overview.data.users.verifiedDrivers)}
              sub={`of ${formatNumber(overview.data.users.drivers)} drivers`}
            />
            <StatTile label="Passengers" value={formatNumber(overview.data.users.passengers)} />
          </div>
          <div className="stat-grid">
            <StatTile label="Published rides" value={formatNumber(overview.data.rides.published + overview.data.rides.full)} />
            <StatTile label="Completed rides" value={formatNumber(overview.data.rides.completed)} />
            <StatTile label="Cancelled rides" value={formatNumber(overview.data.rides.cancelled)} />
            <StatTile label="Seat utilization" value={formatRatio(overview.data.rides.utilization)} sub={`${overview.data.rides.seatsBooked}/${overview.data.rides.seatsOffered} seats`} />
          </div>
          <div className="stat-grid">
            <StatTile label="Searches" value={formatNumber(overview.data.marketplace.searches)} />
            <StatTile label="Zero-result searches" value={formatNumber(overview.data.marketplace.zeroResultSearches)} />
            <StatTile label="Search → result" value={formatRatio(overview.data.marketplace.searchToResultConversion)} />
            <StatTile label="Booking success rate" value={formatRatio(overview.data.marketplace.bookingSuccessRate)} />
          </div>
        </>
      ) : null}

      <div className="callout">
        <div className="callout__title">⚠ Highest unmet demand corridors — where VAYA needs more drivers</div>
        {corridors.isLoading ? (
          <LoadingBlock rows={3} />
        ) : topUnmet.length === 0 ? (
          <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
            No corridor is currently flagged as underserved (demand ≥ 5 searches and supply covering less than a third
            of it) in the last {WINDOW_DAYS} days.
          </p>
        ) : (
          <>
            {topUnmet.map((c) => (
              <div className="callout__row" key={c.corridorKey}>
                <span>
                  {c.originLabel ?? '?'} → {c.destinationLabel ?? '?'}
                </span>
                <span>
                  {c.demand} searches · {c.supply} rides · {c.unmetDemand} unmet
                </span>
              </div>
            ))}
            <div style={{ marginTop: 12 }}>
              <Link to="/analytics" className="link-button">
                View full corridor breakdown →
              </Link>
            </div>
          </>
        )}
      </div>

      <div className="detail-grid">
        <div className="card">
          <div className="section-title">
            Verification queue
            <Link to="/verifications" className="link-button">
              Open queue →
            </Link>
          </div>
          {pendingVerifications.isLoading ? (
            <LoadingBlock rows={3} />
          ) : pendingVerifications.isError ? (
            <ErrorState message={(pendingVerifications.error as Error).message} />
          ) : pendingVerifications.data && pendingVerifications.data.items.length > 0 ? (
            <div className="kv-list">
              {pendingVerifications.data.items.map((item) => (
                <div className="kv-row" key={item.id}>
                  <span className="kv-row__label">{item.user?.fullName ?? item.userId}</span>
                  <span className="kv-row__value">{formatDate(item.verificationSubmittedAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="✅" title="You're all caught up" hint="No pending verifications right now." />
          )}
        </div>

        <div className="card">
          <div className="section-title">Recent admin activity</div>
          {auditLogs.isLoading ? (
            <LoadingBlock rows={3} />
          ) : auditLogs.isError ? (
            <ErrorState message={(auditLogs.error as Error).message} />
          ) : auditLogs.data && auditLogs.data.length > 0 ? (
            <div className="kv-list">
              {auditLogs.data.slice(0, 6).map((log) => (
                <div className="kv-row" key={log.id}>
                  <span className="kv-row__label">{humanize(log.action)}</span>
                  <span className="kv-row__value">{formatDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="📋" title="No admin actions yet" />
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }): React.JSX.Element {
  return (
    <div className="stat-tile">
      <p className="stat-tile__label">{label}</p>
      <p className="stat-tile__value">{value}</p>
      {sub ? <p className="stat-tile__sub">{sub}</p> : null}
    </div>
  );
}
