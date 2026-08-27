import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerificationsQueue } from '../api/hooks/verifications';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { VerificationStatusBadge } from '../components/Badge';
import { formatDate } from '../utils/format';

const LIMIT = 20;
const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Actionable queue' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'resubmission_required', label: 'Resubmission required' },
];

export function VerificationsPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useVerificationsQueue({
    page,
    limit: LIMIT,
    status: status || undefined,
  });

  return (
    <div>
      <div className="table-toolbar">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`btn btn--sm ${status === tab.value ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
          >
            {tab.label}
            {tab.value === '' && data?.countsByStatus
              ? ` (${(data.countsByStatus.pending ?? 0) + (data.countsByStatus.under_review ?? 0)})`
              : ''}
          </button>
        ))}
      </div>

      <div className="card card--flush">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingBlock rows={8} />
          </div>
        ) : isError ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="✅" title="You're all caught up" hint="No verifications match this filter right now." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Documents</th>
                    <th>Attempt</th>
                    <th>Submitted</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} onClick={() => navigate(`/verifications/${item.id}`)}>
                      <td>{item.user?.fullName ?? item.userId}</td>
                      <td>{item.documents.length} submitted</td>
                      <td>#{item.verificationAttempt}</td>
                      <td>{formatDate(item.verificationSubmittedAt)}</td>
                      <td>
                        <VerificationStatusBadge status={item.verificationStatus} />
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
    </div>
  );
}
