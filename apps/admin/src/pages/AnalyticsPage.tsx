import { useState } from 'react';
import { useCorridorDemand, useOverviewMetrics, useSearchFunnel } from '../api/hooks/analytics';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { StatTile } from '../components/StatTile';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/Badge';
import { formatNumber, formatRatio, humanize } from '../utils/format';
import { isUnderservedCorridor } from '../theme/tokens';
import { Icon } from '../components/Icon';

const WINDOW_OPTIONS = [7, 30, 90];

export function AnalyticsPage(): React.JSX.Element {
  const [days, setDays] = useState(30);
  const overview = useOverviewMetrics(days);
  const corridors = useCorridorDemand(days);
  const funnel = useSearchFunnel(days);

  const maxFunnelCount = Math.max(1, ...(funnel.data ?? []).map((f) => f.count));

  return (
    <div>
      <PageHeader
        title="Analytics"
        sub="Search and marketplace performance. Demand/supply health drives where VAYA should recruit supply."
        actions={
          <div className="table-toolbar" style={{ border: 'none', padding: 0 }}>
            {WINDOW_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn--sm ${days === d ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setDays(d)}
              >
                Last {d} days
              </button>
            ))}
          </div>
        }
      />

      {overview.data ? (
        <div className="stat-grid">
          <StatTile
            label="Search → result"
            value={formatRatio(overview.data.marketplace.searchToResultConversion)}
            icon="chevronRight"
            accent
          />
          <StatTile
            label="Result → booking"
            value={formatRatio(overview.data.marketplace.resultToSelectionConversion)}
            icon="chevronRight"
            accent
          />
          <StatTile
            label="Zero-result searches"
            value={formatNumber(overview.data.marketplace.zeroResultSearches)}
            icon="alert"
          />
          <StatTile
            label="Cancellation rate"
            value={formatRatio(overview.data.marketplace.cancellationRate)}
            icon="clock"
          />
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">
          Corridor demand vs. supply
          <span className="section-title__desc">Where VAYA needs more drivers</span>
        </div>
        {corridors.isLoading ? (
          <LoadingBlock rows={6} />
        ) : corridors.isError ? (
          <ErrorState
            message={(corridors.error as Error).message}
            onRetry={() => corridors.refetch()}
          />
        ) : !corridors.data || corridors.data.length === 0 ? (
          <EmptyState icon="map" title="No search activity in this window yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Corridor</th>
                  <th>Demand (searches)</th>
                  <th>Supply (rides)</th>
                  <th>Matched</th>
                  <th>Match rate</th>
                  <th>Unmet demand</th>
                </tr>
              </thead>
              <tbody>
                {corridors.data.map((row) => {
                  const flagged = isUnderservedCorridor(row.demand, row.supply);
                  return (
                    <tr
                      key={row.corridorKey ?? Math.random()}
                      className={flagged ? 'table__row--flagged' : ''}
                    >
                      <td className="table__primary">
                        <span className="table__cell-route">
                          <span className="route-pill">
                            <Icon name="route" size={14} />
                          </span>
                          <span>
                            <span className="table__cell-user-main">
                              {row.originLabel ?? '?'} → {row.destinationLabel ?? '?'}
                            </span>
                            {flagged ? <Badge label="Underserved" tone="warning" /> : null}
                          </span>
                        </span>
                      </td>
                      <td className="table__secondary">{row.demand}</td>
                      <td className="table__secondary">{row.supply}</td>
                      <td className="table__secondary">{row.matched}</td>
                      <td className="table__secondary">{formatRatio(row.matchRate)}</td>
                      <td className="table__secondary">
                        <strong>{row.unmetDemand}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">Search funnel</div>
        {funnel.isLoading ? (
          <LoadingBlock rows={8} />
        ) : funnel.isError ? (
          <ErrorState message={(funnel.error as Error).message} onRetry={() => funnel.refetch()} />
        ) : !funnel.data || funnel.data.length === 0 ? (
          <EmptyState icon="chart" title="No search activity yet" />
        ) : (
          <div className="funnel">
            {funnel.data.map((step) => (
              <div className="funnel__step" key={step.eventName}>
                <span className="funnel__step-label">{humanize(step.eventName)}</span>
                <div className="funnel__bar-track">
                  <div
                    className="funnel__bar-fill"
                    style={{ width: `${(step.count / maxFunnelCount) * 100}%` }}
                  />
                </div>
                <span className="funnel__step-count">{step.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
