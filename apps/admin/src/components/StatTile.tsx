import type { IconName } from './Icon';
import { Icon } from './Icon';

interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  icon?: IconName;
  delta?: { label: string; direction: 'up' | 'down' };
  accent?: boolean;
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  delta,
  accent,
}: StatTileProps): React.JSX.Element {
  return (
    <div className={`stat-tile${accent ? ' stat-tile--accent' : ''}`}>
      <div className="stat-tile__top">
        <span className="stat-tile__label">{label}</span>
        {icon ? (
          <span className="stat-tile__icon">
            <Icon name={icon} size={16} />
          </span>
        ) : null}
      </div>
      <span className="stat-tile__value">{value}</span>
      {sub ? <span className="stat-tile__sub">{sub}</span> : null}
      {delta ? (
        <span
          className={`stat-tile__delta ${
            delta.direction === 'up' ? 'stat-tile__delta--up' : 'stat-tile__delta--down'
          }`}
        >
          {delta.direction === 'up' ? '↑' : '↓'} {delta.label}
        </span>
      ) : null}
    </div>
  );
}
