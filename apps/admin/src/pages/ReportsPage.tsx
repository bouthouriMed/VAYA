import { useState } from 'react';
import { useReportsList, useUpdateReport } from '../api/hooks/reports';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { Badge, ReportStatusBadge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { Avatar } from '../components/Avatar';
import { formatDate, humanize } from '../utils/format';
import type { ReportRow, ReportStatus } from '../api/types';

const LIMIT = 20;
const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export function ReportsPage(): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const { data, isLoading, isError, error, refetch } = useReportsList({
    page,
    limit: LIMIT,
    status: status || undefined,
  });

  return (
    <div>
      <PageHeader
        title="Reports"
        sub="Safety and trust reports filed by riders and drivers. Track them to resolution."
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
          </button>
        ))}
        <span className="table-toolbar__spacer" />
        {data ? <span className="table__cell-muted">{data.total} total</span> : null}
      </div>

      <div className="table-card">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingBlock rows={6} />
          </div>
        ) : isError ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon="flag" title="No reports" hint="Nothing matches this filter." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table--selectable">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Reported by</th>
                    <th>About</th>
                    <th>Filed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((report) => (
                    <tr key={report.id} onClick={() => setSelected(report)}>
                      <td>
                        <Badge label={humanize(report.category)} tone="warning" />
                      </td>
                      <td className="table__primary">
                        <span className="table__cell-user">
                          <Avatar name={report.reporter?.fullName ?? ''} size="sm" variant="sage" />
                          {report.reporter?.fullName ?? '—'}
                        </span>
                      </td>
                      <td className="table__secondary">
                        <span className="table__cell-user">
                          <Avatar name={report.reportedUser?.fullName ?? ''} size="sm" variant="navy" />
                          {report.reportedUser?.fullName ?? '—'}
                        </span>
                      </td>
                      <td className="table__cell-muted">{formatDate(report.createdAt)}</td>
                      <td>
                        <ReportStatusBadge status={report.status} />
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

      {selected ? <ReportDialog report={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function ReportDialog({
  report,
  onClose,
}: {
  report: ReportRow;
  onClose: () => void;
}): React.JSX.Element {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [notes, setNotes] = useState(report.resolutionNotes ?? '');
  const update = useUpdateReport(report.id);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal__title">{humanize(report.category)}</h3>
        <p className="modal__body">{report.description}</p>
        <div className="kv-list" style={{ marginBottom: 16 }}>
          <div className="kv-row">
            <span className="kv-row__label">Reported by</span>
            <span className="kv-row__value">{report.reporter?.fullName ?? '—'}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row__label">About</span>
            <span className="kv-row__value">{report.reportedUser?.fullName ?? '—'}</span>
          </div>
          <div className="kv-row">
            <span className="kv-row__label">Filed</span>
            <span className="kv-row__value">{formatDate(report.createdAt)}</span>
          </div>
        </div>

        <div className="field">
          <label className="field__label">Status</label>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReportStatus)}
          >
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="resolution-notes">
            Resolution notes
          </label>
          <textarea
            id="resolution-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {update.isError ? <p className="field__error">{(update.error as Error).message}</p> : null}

        <div className="modal__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={update.isPending}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { status, resolutionNotes: notes.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
