import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUsersList } from '../api/hooks/users';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { Badge } from '../components/Badge';
import { formatDate, truncateId } from '../utils/format';

const LIMIT = 20;

export function UsersPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useUsersList({ page, limit: LIMIT, q: q || undefined });

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
            placeholder="Search by name, phone, or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
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
        <EmptyState icon="👤" title="No users found" hint={q ? 'Try a different search term.' : undefined} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
                    <td>{user.fullName}</td>
                    <td>{user.phone ?? user.email ?? truncateId(user.id)}</td>
                    <td>
                      {user.driverProfile ? <Badge label="Driver" tone="info" /> : null}{' '}
                      {user.riderProfile || !user.driverProfile ? <Badge label="Rider" tone="neutral" /> : null}
                    </td>
                    <td>
                      {user.suspendedAt ? <Badge label="Suspended" tone="error" /> : <Badge label="Active" tone="success" />}
                    </td>
                    <td>{formatDate(user.createdAt)}</td>
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
