import { Link } from 'react-router-dom';
import { useOverviewMetrics, useCorridorDemand, useSearchFunnel } from '../api/hooks/analytics';
import { useVerificationsQueue } from '../api/hooks/verifications';
import { useAuditLogs } from '../api/hooks/auditLogs';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Icon } from '../components/Icon';
import { formatDate, formatNumber, formatRatio, humanize } from '../utils/format';
import { isUnderservedCorridor } from '../theme/tokens';

const WINDOW_DAYS = 30;

export function DashboardPage(): React.JSX.Element {
  const overview = useOverviewMetrics(WINDOW_DAYS);
  const corridors = useCorridorDemand(WINDOW_DAYS);
  const funnel = useSearchFunnel(WINDOW_DAYS);
  const pendingVerifications = useVerificationsQueue({ page: 1, limit: 5 });
  const auditLogs = useAuditLogs();

  const d = overview.data;
  const funnelRows = (funnel.data ?? []).filter((r) => r.eventName !== 'search_abandoned');
  const maxFunnel = Math.max(1, ...funnelRows.map((r) => r.count));
  const topUnmet = (corridors.data ?? [])
    .filter((c) => isUnderservedCorridor(c.demand, c.supply))
    .slice(0, 4);
  const pendingWaiting = pendingVerifications.isLoading
    ? []
    : (pendingVerifications.data?.items ?? []);

  const bookingRate = d?.marketplace.bookingSuccessRate ?? 0;

  return (
    <div>
      <div className="context-header">
        <div>
          <h1 className="context-header__title">Operations overview</h1>
          <p className="context-header__sub">
            Real-time marketplace health, the review queue, and the corridors that need supply —
            across the last {WINDOW_DAYS} days.
          </p>
        </div>
        <div className="context-header__right">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span className="sparkline__label">Booking success (30d)</span>
            <div className="sparkline" aria-hidden="true">
              <div className="sparkline__bar" style={{ height: '60%' }} />
              <div className="sparkline__bar" style={{ height: '72%' }} />
              <div className="sparkline__bar" style={{ height: '66%' }} />
              <div className="sparkline__bar" style={{ height: '84%' }} />
              <div className="sparkline__bar" style={{ height: '92%' }} />
            </div>
            <span className="sparkline__value">{formatRatio(bookingRate)}</span>
          </div>
        </div>
      </div>

      {overview.isLoading ? (
        <div className="skeleton-card" style={{ marginBottom: 24 }}>
          <LoadingBlock rows={5} />
        </div>
      ) : overview.isError ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <ErrorState
            message={(overview.error as Error).message}
            onRetry={() => overview.refetch()}
          />
        </div>
      ) : d ? (
        <>
          <div className="stat-grid">
            {[
              {
                label: 'Total users',
                value: formatNumber(d.users.total),
                sub: `${formatNumber(d.users.new)} new`,
              },
              {
                label: 'Verified drivers',
                value: formatNumber(d.users.verifiedDrivers),
                sub: `of ${formatNumber(d.users.drivers)} drivers`,
              },
              {
                label: 'Published rides',
                value: formatNumber(d.rides.published + d.rides.full),
                sub: 'live on marketplace',
              },
              {
                label: 'Completed rides',
                value: formatNumber(d.rides.completed),
                sub: `${formatRatio(d.rides.utilization)} seat utilization`,
              },
            ].map((s) => (
              <div className="stat-tile" key={s.label}>
                <div className="stat-tile__top">
                  <span className="stat-tile__label">{s.label}</span>
                </div>
                <div className="stat-tile__value">{s.value}</div>
                <div className="stat-tile__sub">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="split-grid">
            <div className="split-main">
              <div className="pane-head">
                <h3 className="type-headline-sm">Marketplace pulse</h3>
                <span className="pane-count pane-count--primary">
                  {formatNumber(d.marketplace.searches)} SEARCHES
                </span>
              </div>

              <div className="data-list">
                <div
                  className="data-list__head"
                  style={{ gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr' }}
                >
                  <span>Metric</span>
                  <span style={{ textAlign: 'right' }}>Value</span>
                  <span style={{ textAlign: 'right' }}>State</span>
                </div>

                {funnelRows.length > 0 ? (
                  funnelRows.map((r) => {
                    const pct = maxFunnel ? Math.round((r.count / maxFunnel) * 100) : 0;
                    return (
                      <div
                        className="data-list__row"
                        key={r.eventName}
                        style={{ gridTemplateColumns: 'minmax(0,2fr) 1fr 1fr' }}
                        onClick={() => undefined}
                      >
                        <span className="type-label">{humanize(r.eventName)}</span>
                        <span className="type-mono-data" style={{ textAlign: 'right' }}>
                          {formatNumber(r.count)}
                        </span>
                        <span style={{ textAlign: 'right', paddingLeft: 8 }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 90,
                              height: 6,
                              borderRadius: 3,
                              background: 'var(--color-surface-muted)',
                              overflow: 'hidden',
                              verticalAlign: 'middle',
                            }}
                          >
                            <span
                              style={{
                                display: 'block',
                                height: '100%',
                                width: `${Math.max(4, pct)}%`,
                                background: 'var(--color-primary)',
                                borderRadius: 3,
                              }}
                            />
                          </span>
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="state-block" style={{ padding: '24px 4px' }}>
                    <Icon name="chart" size={20} />
                    <span>No search activity in this window yet</span>
                  </div>
                )}
              </div>
            </div>

            <div className="split-rail">
              <div className="pane-head">
                <h3 className="type-headline-sm">Needs attention</h3>
                <span className="pane-count pane-count--error">
                  {topUnmet.length + pendingWaiting.length} ACTION
                </span>
              </div>

              {pendingWaiting.length > 0 ? (
                <div key="verify" className="exception exception--warning">
                  <div className="exception__head">
                    <span className="exception__tag">Pending verification</span>
                    <span className="exception__time">{pendingWaiting.length} awaiting</span>
                  </div>
                  <div className="exception__title">Driver review queue</div>
                  <div className="exception__body">
                    {pendingWaiting.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        style={{ display: 'flex', justifyContent: 'space-between' }}
                      >
                        <span>{item.user?.fullName ?? item.userId}</span>
                        <span className="type-mono-data">
                          {formatDate(item.verificationSubmittedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="exception__actions">
                    <Link to="/verifications" className="exception__action">
                      Review queue
                    </Link>
                  </div>
                </div>
              ) : null}

              {topUnmet.map((c) => (
                <div key={c.corridorKey} className="exception exception--error">
                  <div className="exception__head">
                    <span className="exception__tag">Underserved corridor</span>
                    <span className="exception__time">{c.unmetDemand} unmet</span>
                  </div>
                  <div className="exception__title">
                    {c.originLabel ?? '?'} → {c.destinationLabel ?? '?'}
                  </div>
                  <div className="exception__body">
                    {c.demand} searches vs {c.supply} rides — supply covers under a third of demand.
                  </div>
                  <div className="exception__actions">
                    <Link to="/analytics" className="exception__action">
                      View breakdown
                    </Link>
                    <span className="exception__dot-sep">•</span>
                    <Link to="/rides" className="exception__action">
                      Open logistics
                    </Link>
                  </div>
                </div>
              ))}

              {topUnmet.length === 0 && pendingWaiting.length === 0 ? (
                <div className="state-block">
                  <Icon name="check" size={20} style={{ color: 'var(--color-success)' }} />
                  <span>No open exceptions right now.</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="split-grid" style={{ marginTop: 32 }}>
            <div className="split-main">
              <div className="pane-head">
                <h3 className="type-headline-sm">Recent admin activity</h3>
              </div>
              {auditLogs.isLoading ? (
                <LoadingBlock rows={4} />
              ) : auditLogs.isError ? (
                <ErrorState message={(auditLogs.error as Error).message} />
              ) : auditLogs.data && auditLogs.data.length > 0 ? (
                <div className="data-list">
                  <div
                    className="data-list__head"
                    style={{ gridTemplateColumns: 'minmax(0,1fr) 1fr' }}
                  >
                    <span>Action</span>
                    <span style={{ textAlign: 'right' }}>When</span>
                  </div>
                  {auditLogs.data.slice(0, 6).map((log) => (
                    <div
                      className="data-list__row"
                      key={log.id}
                      style={{ gridTemplateColumns: 'minmax(0,1fr) 1fr' }}
                      onClick={() => undefined}
                    >
                      <span className="type-label">{humanize(log.action)}</span>
                      <span className="type-mono-data" style={{ textAlign: 'right' }}>
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="clock" title="No admin actions yet" />
              )}
            </div>

            <div className="split-rail">
              <div className="pane-head">
                <h3 className="type-headline-sm">Top corridors</h3>
                <Link to="/analytics" className="exception__action">
                  All →
                </Link>
              </div>
              {corridors.isLoading ? (
                <LoadingBlock rows={4} />
              ) : corridors.isError ? (
                <ErrorState message={(corridors.error as Error).message} />
              ) : corridors.data && corridors.data.length > 0 ? (
                <div className="data-list">
                  {corridors.data.slice(0, 5).map((c) => {
                    const flagged = isUnderservedCorridor(c.demand, c.supply);
                    return (
                      <div
                        className="data-list__row"
                        key={c.corridorKey ?? c.originLabel}
                        onClick={() => undefined}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span className="type-label" style={{ fontSize: 13 }}>
                            {c.originLabel ?? '?'} → {c.destinationLabel ?? '?'}
                          </span>
                          {flagged ? <span className="pill pill--warning">Underserved</span> : null}
                        </div>
                        <div
                          className="type-mono-data"
                          style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}
                        >
                          <span>{c.supply} rides</span>
                          <span>{c.demand} searches</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon="map" title="No corridor data" />
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
