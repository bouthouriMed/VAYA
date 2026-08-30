import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  sub?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, sub, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-header__title">{title}</h1>
        {sub ? <p className="page-header__sub">{sub}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}
