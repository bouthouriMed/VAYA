import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRidesList } from '../api/hooks/rides';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { RideStatusBadge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { formatCurrency, formatDate, truncateId } from '../utils/format';

const LIMIT = 20;
const STATUSES = ['draft', 'published', 'full', 'in_progress', 'completed', 'cancelled'];

const PROGRESS: Record<string, number> = {
  draft: 0,
  published: 20,
  full: 45,
  in_progress: 70,
  completed: 100,
  cancelled: 0,
};

const HEALTH: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  draft: 'neutral',
  published: 'success',
  full: 'success',
  in_progress: 'success',
  completed: 'neutral',
  cancelled: 'error',
};

function shortOrigin(label: string): string {
  const parts = label.split(/[\s,·–—-]/).filter(Boolean);
  return parts
    .slice(0, 3)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export function RidesPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useRidesList({
    page,
    limit: LIMIT,
    status: status || undefined,
    q: q || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Logistics"
        sub="Every published trip on VAYA. Filter by status, search routes, and inspect individual rides."
      />

      <div className="table-toolbar" style={{ border: 'none', padding: '0 0 16px' }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            flex: '0 1 300px',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 12,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-gray-400)',
            }}
          >
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            style={{ minWidth: 200, paddingLeft: 38, width: '100%' }}
            placeholder="Search by origin or destination…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                setQ(searchInput.trim());
              }
            }}
            aria-label="Search rides"
          />
        </div>
        <select
          className="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <span className="table-toolbar__spacer" />
        {data ? <span className="type-mono-data">{data.total} total</span> : null}
      </div>

      <div className="command-panel">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingBlock rows={8} />
          </div>
        ) : isError ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            icon="car"
            title="No rides found"
            hint={
              status || q
                ? 'Try adjusting your filters.'
                : 'Rides will appear here once drivers publish trips.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--logistics">
                <thead>
                  <tr>
                    <th>Route &amp; progress</th>
                    <th>Driver</th>
                    <th>Departure</th>
                    <th>Price/seat</th>
                    <th>Seats</th>
                    <th>Status</th>
                    <th className="table__th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((ride) => {
                    const prog = PROGRESS[ride.status] ?? 0;
                    const health = HEALTH[ride.status] ?? 'neutral';
                    const driverName = ride.driverProfile?.user?.fullName ?? '—';
                    return (
                      <tr key={ride.id} onClick={() => navigate(`/rides/${ride.id}`)}>
                        <td className="table__primary" style={{ verticalAlign: 'middle' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              maxWidth: 260,
                            }}
                          >
                            <div className="journey-endpoints">
                              <span>{shortOrigin(ride.originLabel)}</span>
                              <span>{shortOrigin(ride.destinationLabel)}</span>
                            </div>
                            <div className="journey-line">
                              <div
                                className={`journey-progress journey-progress--${health}`}
                                style={{ width: `${prog}%` }}
                              />
                            </div>
                            <span className="table__cell-user-sub">
                              {ride.originLabel} → {ride.destinationLabel}
                            </span>
                          </div>
                        </td>
                        <td className="table__secondary">
                          {ride.driverProfile?.user ? (
                            <span className="table__cell-user" style={{ minWidth: 0 }}>
                              <Avatar name={driverName} size="sm" variant="sage" />
                              <span style={{ minWidth: 0 }}>
                                <span className="table__cell-user-main" style={{ fontSize: 13 }}>
                                  {driverName}
                                </span>
                                <span className="table__cell-user-sub">
                                  Driver #{truncateId(ride.driverProfileId)}
                                </span>
                              </span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="type-mono-data">{formatDate(ride.departureAt)}</span>
                          </div>
                        </td>
                        <td className="table__secondary">
                          <span className="type-mono-data">
                            {formatCurrency(ride.contributionPerSeat)}
                          </span>
                        </td>
                        <td className="table__secondary">
                          <span className="type-mono-data">
                            {ride.seatsAvailable}/{ride.seatsTotal}
                          </span>
                        </td>
                        <td>
                          <RideStatusBadge status={ride.status} />
                        </td>
                        <td className="table__th-right" onClick={(e) => e.stopPropagation()}>
                          <div className="row-hover-actions">
                            <button
                              type="button"
                              className="row-action"
                              title="View ride"
                              onClick={() => navigate(`/rides/${ride.id}`)}
                            >
                              <Icon name="chevronRight" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} limit={LIMIT} total={data.total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
