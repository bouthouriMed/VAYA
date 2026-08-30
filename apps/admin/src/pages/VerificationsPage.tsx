import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVerificationsQueue } from '../api/hooks/verifications';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { VerificationStatusBadge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { formatDate } from '../utils/format';

const LIMIT = 20;
const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Actionable queue' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'resubmission_required', label: 'Resubmission required' },
];

function waitLabel(submittedAt: string | null): string {
  if (!submittedAt) return 'no submitted time';
  const ms = Date.now() - new Date(submittedAt).getTime();
  if (ms < 0) return 'submitted just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m waiting`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h waiting`;
  return `${Math.floor(hours / 24)}d waiting`;
}

export function VerificationsPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useVerificationsQueue({
    page,
    limit: LIMIT,
    status: status || undefined,
  });

  const actionable = (data?.countsByStatus.pending ?? 0) + (data?.countsByStatus.under_review ?? 0);

  return (
    <div>
      <PageHeader
        title="Trust &amp; safety"
        sub="Review driver identity and document submissions, then approve or request changes."
      />

      <div className="table-toolbar" style={{ border: 'none', padding: '0 0 16px' }}>
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
            {tab.value === '' ? ` (${actionable})` : ''}
          </button>
        ))}
        <span className="table-toolbar__spacer" />
        {data ? <span className="type-mono-data">{data.total} total</span> : null}
      </div>

      <div className="queue-pane">
        <div className="queue-pane__head">
          <h3 className="type-headline-sm">Review queue</h3>
          <span className="type-mono-data">{actionable} actionable</span>
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
            icon="shield"
            title="You're all caught up"
            hint="No verifications match this filter right now."
          />
        ) : (
          <>
            <div className="queue-list">
              {data.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="queue-item"
                  onClick={() => navigate(`/verifications/${item.id}`)}
                >
                  <div className="queue-item__head">
                    <span className="exception__tag queue-item__priority">
                      Attempt #{item.verificationAttempt}
                    </span>
                    <span className="type-mono-data queue-item__wait">
                      {waitLabel(item.verificationSubmittedAt)}
                    </span>
                  </div>
                  <div className="queue-item__title">
                    <span className="command-avatar command-avatar--grey" aria-hidden="true">
                      {item.user?.fullName?.slice(0, 2).toUpperCase() ?? '?'}
                    </span>
                    <span>{item.user?.fullName ?? item.userId}</span>
                  </div>
                  <div className="queue-item__sub">
                    {item.documents.length} documents · {item.vehicles.length} vehicle ·{' '}
                    {formatDate(item.verificationSubmittedAt)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <VerificationStatusBadge status={item.verificationStatus} />
                  </div>
                </button>
              ))}
            </div>
            <div className="queue-pane__foot">
              <Pagination page={page} limit={LIMIT} total={data.total} onPageChange={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
