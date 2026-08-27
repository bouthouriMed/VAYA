import { useState } from 'react';
import { useCorridorDemand, useOverviewMetrics, useSearchFunnel } from '../api/hooks/analytics';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { formatNumber, formatRatio, humanize } from '../utils/format';
import { isUnderservedCorridor } from '../theme/tokens';

const WINDOW_OPTIONS = [7, 30, 90];

export function AnalyticsPage(): React.JSX.Element {
  const [days, setDays] = useState(30);
  const overview = useOverviewMetrics(days);
  const corridors = useCorridorDemand(days);
  const funnel = useSearchFunnel(days);

  const maxFunnelCount = Math.max(1, ...(funnel.data ?? []).map((f) => f.count));

  return (
    <div>
      <div className="table-toolbar">
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

      {overview.data ? (
        <div className="stat-grid">
          <div className="stat-tile">
            <p className="stat-tile__label">Search → result</p>
            <p className="stat-tile__value">{formatRatio(overview.data.marketplace.searchToResultConversion)}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile__label">Result → booking</p>
            <p className="stat-tile__value">{formatRatio(overview.data.marketplace.resultToSelectionConversion)}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile__label">Zero-result searches</p>
            <p className="stat-tile__value">{formatNumber(overview.data.marketplace.zeroResultSearches)}</p>
          </div>
          <div className="stat-tile">
            <p className="stat-tile__label">Cancellation rate</p>
            <p className="stat-tile__value">{formatRatio(overview.data.marketplace.cancellationRate)}</p>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="section-title">Corridor demand vs. supply — where VAYA needs more drivers</div>
        {corridors.isLoading ? (
          <LoadingBlock rows={6} />
        ) : corridors.isError ? (
          <ErrorState message={(corridors.error as Error).message} onRetry={() => corridors.refetch()} />
        ) : !corridors.data || corridors.data.length === 0 ? (
          <EmptyState icon="🗺️" title="No search activity in this window yet" />
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
                    <tr key={row.corridorKey ?? Math.random()} className={flagged ? 'table__row--flagged' : ''}>
                      <td>
                        {row.originLabel ?? '?'} → {row.destinationLabel ?? '?'}{' '}
                        {flagged ? <span title="Underserved corridor">⚠️</span> : null}
                      </td>
                      <td>{row.demand}</td>
                      <td>{row.supply}</td>
                      <td>{row.matched}</td>
                      <td>{formatRatio(row.matchRate)}</td>
                      <td>{row.unmetDemand}</td>
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
        ) : !funnel.data ? null : (
          <div className="funnel">
            {funnel.data.map((step) => (
              <div className="funnel__step" key={step.eventName}>
                <span>{humanize(step.eventName)}</span>
                <div className="funnel__bar-track">
                  <div className="funnel__bar-fill" style={{ width: `${(step.count / maxFunnelCount) * 100}%` }} />
                </div>
                <span style={{ textAlign: 'right' }}>{step.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
