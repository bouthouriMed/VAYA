import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRidesList } from '../api/hooks/rides';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { RideStatusBadge } from '../components/Badge';
import { formatCurrency, formatDate } from '../utils/format';

const LIMIT = 20;
const STATUSES = ['draft', 'published', 'full', 'in_progress', 'completed', 'cancelled'];

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
    <div className="card card--flush">
      <div style={{ padding: 20 }}>
        <form
          className="table-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(searchInput.trim());
          }}
        >
          <input
            className="input"
            style={{ minWidth: 260 }}
            placeholder="Search by origin or destination…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className="select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn--secondary btn--sm">
            Search
          </button>
        </form>
      </div>

      {isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingBlock rows={8} />
        </div>
      ) : isError ? (
        <div style={{ padding: 20 }}>
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon="🚗" title="No rides found" hint={status || q ? 'Try adjusting your filters.' : undefined} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Departure</th>
                  <th>Seats</th>
                  <th>Price/seat</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((ride) => (
                  <tr key={ride.id} onClick={() => navigate(`/rides/${ride.id}`)}>
                    <td>
                      {ride.originLabel} → {ride.destinationLabel}
                    </td>
                    <td>{ride.driverProfile?.user?.fullName ?? '—'}</td>
                    <td>{formatDate(ride.departureAt)}</td>
                    <td>
                      {ride.seatsAvailable}/{ride.seatsTotal}
                    </td>
                    <td>{formatCurrency(ride.contributionPerSeat)}</td>
                    <td>
                      <RideStatusBadge status={ride.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
