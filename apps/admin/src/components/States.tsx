export function LoadingBlock({ rows = 5 }: { rows?: number }): React.JSX.Element {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" style={{ width: `${100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '🗂️', title, hint }: { icon?: string; title: string; hint?: string }): React.JSX.Element {
  return (
    <div className="state-block">
      <div className="state-block__icon">{icon}</div>
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }): React.JSX.Element {
  return (
    <div className="state-block state-block--error">
      <div className="state-block__icon">⚠️</div>
      <strong>Something went wrong</strong>
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
