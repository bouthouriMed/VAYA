import { Icon, type IconName } from './Icon';

export function LoadingBlock({ rows = 5 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="skeleton-stack" aria-busy="true" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton skeleton-row"
          style={{ width: `${100 - (i % 3) * 14}%` }}
        />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  hint?: string;
}

export function EmptyState({ icon = 'inbox', title, hint }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="state-block">
      <div className="state-block__icon">
        <Icon name={icon} size={26} />
      </div>
      <div className="state-block__title">{title}</div>
      {hint ? <p className="state-block__hint">{hint}</p> : null}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps): React.JSX.Element {
  return (
    <div className="state-block state-block--error" role="alert">
      <div className="state-block__icon">
        <Icon name="alert" size={26} />
      </div>
      <div className="state-block__title">Something went wrong</div>
      <p className="state-block__hint">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRetry}
          style={{ marginTop: 8 }}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
