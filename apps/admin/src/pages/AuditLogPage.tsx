import { useState } from 'react';
import { useAuditLogs } from '../api/hooks/auditLogs';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { formatDate, humanize } from '../utils/format';
import type { AuditLogRow } from '../api/types';

export function AuditLogPage(): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useAuditLogs();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="card card--flush">
      {isLoading ? (
        <div style={{ padding: 20 }}>
          <LoadingBlock rows={10} />
        </div>
      ) : isError ? (
        <div style={{ padding: 20 }}>
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon="📋" title="No admin actions recorded yet" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Admin</th>
                <th>Target</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.map((log) => (
                <ExpandableLogRow key={log.id} log={log} expanded={expanded.has(log.id)} onToggle={() => toggle(log.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpandableLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLogRow;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const hasState = log.previousState !== null || log.newState !== null;
  return (
    <>
      <tr onClick={onToggle}>
        <td>{humanize(log.action)}</td>
        <td>{log.adminUser?.fullName ?? '—'}</td>
        <td className="mono">
          {log.targetType} · {log.targetId.slice(0, 8)}…
        </td>
        <td>{log.reason ?? '—'}</td>
        <td>{formatDate(log.createdAt)}</td>
      </tr>
      {expanded && hasState ? (
        <tr>
          <td colSpan={5} style={{ background: 'var(--color-gray-50)' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {log.previousState !== null ? (
                <div>
                  <div className="field__label" style={{ marginBottom: 4 }}>
                    Before
                  </div>
                  <pre className="json-block">{JSON.stringify(log.previousState, null, 2)}</pre>
                </div>
              ) : null}
              {log.newState !== null ? (
                <div>
                  <div className="field__label" style={{ marginBottom: 4 }}>
                    After
                  </div>
                  <pre className="json-block">{JSON.stringify(log.newState, null, 2)}</pre>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
