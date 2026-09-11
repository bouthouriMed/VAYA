import { useFailedJobs, useRetryFailedJob } from '../api/hooks/queue';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import { formatDate, humanize } from '../utils/format';

// Previously the only way to see what's failing in the notification-
// dispatch/recurring-scan/staleness-sweep background queue was direct Redis
// CLI access (apps/api/src/lib/queue.ts) — this is the admin-facing view of
// exactly that data, plus a one-click retry for a job an operator has
// confirmed is safe to reprocess (e.g. a transient provider outage that's
// since recovered).
export function QueuePage(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useFailedJobs(100);
  const retryJob = useRetryFailedJob();

  return (
    <div>
      <PageHeader
        title="Background Jobs"
        sub="Failed notification-dispatch / recurring-scan / staleness-sweep jobs — retained by BullMQ, previously visible only via direct Redis access."
      />

      <div className="table-card">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingBlock rows={6} />
          </div>
        ) : isError ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : !data || data.jobs.length === 0 ? (
          <EmptyState icon="check" title="No failed jobs" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Attempts</th>
                  <th>Failure reason</th>
                  <th>When</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="table__primary">{humanize(job.name)}</td>
                    <td className="table__secondary">{job.attemptsMade}</td>
                    <td className="table__cell-muted" style={{ maxWidth: 420 }}>
                      {job.failedReason ?? '—'}
                    </td>
                    <td className="table__cell-muted">{formatDate(new Date(job.timestamp).toISOString())}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        disabled={retryJob.isPending}
                        onClick={() => retryJob.mutate(job.id)}
                      >
                        Retry
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
