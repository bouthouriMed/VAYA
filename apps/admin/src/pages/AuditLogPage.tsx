import { useState } from 'react';
import { useAuditLogs } from '../api/hooks/auditLogs';
import { LoadingBlock, ErrorState, EmptyState } from '../components/States';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
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
    <div>
      <PageHeader
        title="Audit log"
        sub="Every administrative action, recorded with before/after state for accountability."
      />

      <div className="table-card">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            <LoadingBlock rows={10} />
          </div>
        ) : isError ? (
          <div style={{ padding: 20 }}>
            <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : !data || data.length === 0 ? (
          <EmptyState icon="clock" title="No admin actions recorded yet" />
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
                  <ExpandableLogRow
                    key={log.id}
                    log={log}
                    expanded={expanded.has(log.id)}
                    onToggle={() => toggle(log.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
      <tr
        onClick={hasState ? onToggle : undefined}
        style={hasState ? { cursor: 'pointer' } : undefined}
      >
        <td className="table__primary">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasState ? (
              <Icon
                name="chevronRight"
                size={14}
                style={{
                  transform: expanded ? 'rotate(90deg)' : undefined,
                  transition: 'transform 0.15s ease',
                  color: 'var(--color-gray-400)',
                }}
              />
            ) : null}
            {humanize(log.action)}
          </span>
        </td>
        <td className="table__secondary">{log.adminUser?.fullName ?? '—'}</td>
        <td className="mono table__cell-muted">
          {log.targetType} · {log.targetId.slice(0, 8)}…
        </td>
        <td className="table__secondary">{log.reason ?? '—'}</td>
        <td className="table__cell-muted">{formatDate(log.createdAt)}</td>
      </tr>
      {expanded && hasState ? (
        <tr>
          <td colSpan={5} style={{ background: 'var(--color-surface-muted)' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '12px 24px 20px' }}>
              {log.previousState !== null ? (
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div className="field__label" style={{ marginBottom: 8 }}>
                    Before
                  </div>
                  <pre className="json-block">{JSON.stringify(log.previousState, null, 2)}</pre>
                </div>
              ) : null}
              {log.newState !== null ? (
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div className="field__label" style={{ marginBottom: 8 }}>
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
