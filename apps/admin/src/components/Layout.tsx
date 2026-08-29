import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon, type IconName } from './Icon';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Network',
    items: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }],
  },
  {
    label: 'Operations',
    items: [
      { to: '/rides', label: 'Logistics', icon: 'car' },
      { to: '/users', label: 'Directory', icon: 'users' },
      { to: '/verifications', label: 'Trust', icon: 'shield' },
      { to: '/reports', label: 'Reports', icon: 'flag' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/analytics', label: 'Analytics', icon: 'chart' },
      { to: '/audit-log', label: 'Audit Log', icon: 'clock' },
    ],
  },
];

const FLAT_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

const PARENT_TITLES: Record<string, { title: string; parent?: { to: string; label: string } }> = {
  '/': { title: 'Network health' },
  '/users': { title: 'Directory' },
  '/rides': { title: 'Logistics' },
  '/verifications': { title: 'Trust' },
  '/analytics': { title: 'Intelligence' },
  '/reports': { title: 'Reports' },
  '/audit-log': { title: 'Audit Log' },
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export function AppLayout(): React.JSX.Element {
  const { admin, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const activeNav = FLAT_NAV.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );
  const pageInfo = PARENT_TITLES[pathname] ??
    PARENT_TITLES[activeNav?.to ?? '/'] ?? { title: 'VAYA Admin' };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__brand-name">VAYA</div>
          <div className="sidebar__brand-tag">Command · Ops</div>
        </div>

        <button
          type="button"
          className="btn btn--primary sidebar__dispatch"
          onClick={() => navigate('/rides')}
        >
          <Icon name="route" size={16} />
          New Dispatch
        </button>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <span className="sidebar__group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                  }
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <NavLink to="/audit-log" className="sidebar__link">
            <Icon name="clock" size={18} />
            <span>Audit log</span>
          </NavLink>
          <button type="button" className="sidebar__link" style={{ width: '100%' }}>
            <Icon name="bell" size={18} />
            <span>Support</span>
          </button>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar__left">
            <span className="topbar__brand">
              VAYA <span>Command</span>
            </span>
            <span className="topbar__divider" />
            <nav className="topbar__crumbs" aria-label="Breadcrumb">
              {pageInfo.parent ? (
                <>
                  <NavLink to={pageInfo.parent.to}>{pageInfo.parent.label}</NavLink>
                  <span className="topbar__divider">/</span>
                </>
              ) : null}
              <span className="topbar__crumb-current">{pageInfo.title}</span>
            </nav>
          </div>
          <div className="topbar__right">
            <div className="topbar__search">
              <Icon name="search" size={15} />
              <input
                className="topbar__search-input"
                placeholder="Search resources…"
                aria-label="Global search"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
              />
            </div>
            <button type="button" className="topbar__status">
              <span className="state-dot state-dot--success" />
              System Status
            </button>
            <div className="topbar__icons">
              <button type="button" className="topbar__icon" aria-label="Notifications">
                <Icon name="bell" size={18} />
              </button>
              <button type="button" className="topbar__icon" aria-label="History">
                <Icon name="clock" size={18} />
              </button>
            </div>
            <div className="topbar__admin">
              <div className="topbar__avatar" aria-hidden="true">
                {admin?.fullName ? initials(admin.fullName) : 'A'}
              </div>
              <div className="topbar__admin-meta">
                <span className="topbar__admin-name">{admin?.fullName ?? 'Admin'}</span>
                <span className="topbar__admin-role">{admin?.role ?? 'operator'}</span>
              </div>
              <button
                type="button"
                className="topbar__icon"
                onClick={logout}
                aria-label="Log out"
                title="Log out"
              >
                <Icon name="logout" size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
