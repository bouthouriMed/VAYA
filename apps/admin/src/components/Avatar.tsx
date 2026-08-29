interface AvatarProps {
  name: string;
  variant?: 'accent' | 'navy' | 'sage' | 'amber';
  size?: 'sm' | 'md';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (parts.length === 1) return (first ?? '').slice(0, 2).toUpperCase();
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, variant = 'accent', size = 'md' }: AvatarProps): React.JSX.Element {
  const cls = ['avatar', `avatar--${variant}`, size === 'sm' ? 'avatar--sm' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
