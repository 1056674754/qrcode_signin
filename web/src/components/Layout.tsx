import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { clearTokenCookies } from '@/lib/cookies';
import { pb } from '@/lib/pb';
import { LanguageSwitch, useI18n } from '@/lib/i18n';

const IconEvents = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconScan = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
const IconHistory = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

export default function Layout() {
  const { t } = useI18n();
  const tabs = [
    { to: '/events', label: t('layout.events'), Icon: IconEvents },
    { to: '/checkin', label: t('layout.scan'), Icon: IconScan },
    { to: '/history', label: t('layout.history'), Icon: IconHistory },
  ];
  const user = pb.authStore.record;
  const navigate = useNavigate();

  const handleLogout = () => {
    pb.authStore.clear();
    clearTokenCookies();
    navigate('/login', { replace: true });
  };

  return (
    <div className="layout-root">
      {/* ---- Top bar (mobile) ---- */}
      <header className="topbar">
        <span className="topbar-title">{t('layout.brand')}</span>
        <div className="topbar-right">
          <LanguageSwitch />
          <span className="topbar-user">{user?.name || user?.email || user?.id}</span>
          <button className="btn btn-ghost topbar-logout" onClick={handleLogout}>{t('layout.logout')}</button>
        </div>
      </header>

      {/* ---- Desktop sidebar ---- */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand" title={t('layout.brand')}>{t('layout.brand')}</div>
          <div className="sidebar-lang">
            <LanguageSwitch />
          </div>
        </div>
        <div className="sidebar-nav">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              <span className="sidebar-icon"><tab.Icon /></span>
              {tab.label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user">{user?.name || user?.email || user?.id}</div>
          <button className="btn btn-secondary sidebar-logout" onClick={handleLogout}>{t('layout.logoutDesktop')}</button>
        </div>
      </nav>

      {/* ---- Main content ---- */}
      <main className="main-content">
        <Outlet />
      </main>

      {/* ---- Bottom tab bar (mobile) ---- */}
      <nav className="tabbar">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => 'tabbar-item' + (isActive ? ' active' : '')}
          >
            <span className="tabbar-icon"><tab.Icon /></span>
            <span className="tabbar-label">{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      <style>{layoutCSS}</style>
    </div>
  );
}

const layoutCSS = `
.layout-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ======== Top bar (mobile only) ======== */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-h);
  padding: 0 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.topbar-title {
  font-size: 17px;
  font-weight: 700;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(160px, 42vw);
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbar-user {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.topbar-logout {
  font-size: 13px;
  padding: 4px 10px;
}

/* ======== Sidebar (desktop only) ======== */
.sidebar {
  display: none;
}

/* ======== Main content ======== */
.main-content {
  flex: 1;
  padding: 20px 16px;
  padding-bottom: calc(var(--tabbar-h) + 20px);
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  overflow-y: auto;
}

/* ======== Bottom tab bar (mobile only) ======== */
.tabbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--tabbar-h);
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  display: flex;
  z-index: 100;
}
.tabbar-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 11px;
  transition: color 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.tabbar-item.active {
  color: var(--accent);
}
.tabbar-icon {
  font-size: 20px;
  line-height: 1;
}
.tabbar-label {
  font-weight: 500;
}

/* ======== Desktop (>= 768px) ======== */
@media (min-width: 768px) {
  .layout-root {
    flex-direction: row;
  }
  .topbar {
    display: none;
  }
  .tabbar {
    display: none;
  }
  .sidebar {
    display: flex;
    flex-direction: column;
    width: var(--sidebar-w);
    min-height: 100vh;
    padding: 20px 16px;
    border-right: 1px solid var(--border);
    background: var(--bg-card);
    flex-shrink: 0;
    position: sticky;
    top: 0;
  }
  .sidebar-header {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 4px 4px 16px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }
  .sidebar-brand {
    font-size: 17px;
    font-weight: 700;
    line-height: 1.3;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sidebar-lang {
    display: flex;
    justify-content: flex-start;
  }
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 15px;
    transition: background 0.15s, color 0.15s;
  }
  .sidebar-link:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .sidebar-link.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }
  .sidebar-icon {
    font-size: 16px;
  }
  .sidebar-footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sidebar-user {
    font-size: 13px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sidebar-logout {
    font-size: 13px;
    padding: 6px 12px;
    width: 100%;
  }
  .main-content {
    padding: 32px;
    padding-bottom: 32px;
    max-width: 800px;
  }
}
`;
