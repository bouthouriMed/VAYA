import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUsersList } from '../api/hooks/users';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { formatDate, truncateId } from '../utils/format';

const LIMIT = 20;

export function UsersPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useUsersList({
    page,
    limit: LIMIT,
    q: q || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Directory"
        sub="Every passenger and driver on VAYA. Search, inspect profiles, and manage account status."
      />

      <div className="command-panel">
        <div className="command-panel__head">
          <input
            className="input"
            style={{ maxWidth: 340, paddingLeft: 38 }}
            placeholder="Search by name, phone, or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                setQ(searchInput.trim());
              }
            }}
            aria-label="Search users"
          />
          <span className="type-mono-data">{data ? `${data.total} total` : '…'}</span>
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
          <EmptyState
            icon="users"
            title="No users found"
            hint={q ? 'Try a different search term.' : 'Users will appear here as they join VAYA.'}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--selectable table--directory">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Role</th>
                    <th>Trust level</th>
                    <th>Activity</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((user) => {
                    const isDriver = !!user.driverProfile;
                    const suspended = !!user.suspendedAt;
                    return (
                      <tr key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
                        <td>
                          <span className="table__cell-user">
                            <Avatar name={user.fullName} />
                            <span>
                              <span className="table__cell-user-main">{user.fullName}</span>
                              <span className="table__cell-user-sub">
                                ID: {truncateId(user.id)}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="type-label table__cell-muted" style={{ fontWeight: 400 }}>
                          {isDriver ? (user.riderProfile ? 'Both' : 'Driver') : 'Passenger'}
                        </td>
                        <td>
                          {isDriver ? (
                            <span className="pill pill--primary">Driver</span>
                          ) : (
                            <span className="pill pill--neutral">Rider</span>
                          )}
                        </td>
                        <td className="table__cell-muted">
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 13 }}>
                              {user.phone ?? user.email ?? (
                                <span className="mono">{truncateId(user.id)}</span>
                              )}
                            </span>
                            <span className="table__cell-user-sub">
                              Joined {formatDate(user.createdAt)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 7,
                              fontSize: 13,
                              color: suspended ? 'var(--color-muted)' : 'var(--color-ink)',
                            }}
                          >
                            <span
                              className={`state-dot ${
                                suspended ? 'state-dot--error' : 'state-dot--success'
                              }`}
                            />
                            {suspended ? 'Suspended' : 'Active'}
                          </span>
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
