import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/users', label: 'Users' },
  { to: '/rides', label: 'Rides' },
  { to: '/verifications', label: 'Verifications' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/reports', label: 'Reports' },
  { to: '/audit-log', label: 'Audit Log' },
  { to: '/operational-config', label: 'Operational Policy' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/rides': 'Rides',
  '/verifications': 'Driver Verifications',
  '/analytics': 'Search & Marketplace Analytics',
  '/reports': 'Reports',
  '/audit-log': 'Audit Log',
  '/operational-config': 'Operational Policy Configuration',
};

export function AppLayout(): React.JSX.Element {
  const { admin, logout } = useAuth();
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? 'VAYA Admin';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          VAYA <span>Admin</span>
        </div>
        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar__title">{title}</div>
          <div className="topbar__admin">
            <span>
              {admin?.fullName} <span className="text-muted">({admin?.role})</span>
            </span>
            <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
              Log out
            </button>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
