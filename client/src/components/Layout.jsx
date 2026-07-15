import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDays,
  faChevronDown,
  faClipboardList,
  faMoon,
  faPalette,
  faReceipt,
  faRightFromBracket,
  faScrewdriverWrench,
  faStore,
  faSun,
  faUsers,
  faUtensils,
} from '@fortawesome/free-solid-svg-icons';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useBranding } from '../branding/BrandingContext.jsx';
import { currentTheme, toggleTheme } from '../theme.js';

const ADMIN_LINKS = [
  { to: '/admin/tage', icon: faCalendarDays, label: 'Tagesplanung' },
  { to: '/admin/restaurants', icon: faStore, label: 'Restaurants & Speisekarten' },
  { to: '/admin/benutzer', icon: faUsers, label: 'Benutzer' },
  { to: '/admin/design', icon: faPalette, label: 'Design & Branding' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [showOrganizerLink, setShowOrganizerLink] = useState(user.role === 'admin');
  const [theme, setTheme] = useState(currentTheme());
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef(null);

  useEffect(() => {
    if (user.role === 'admin') {
      setShowOrganizerLink(true);
      return;
    }
    api('/my/organizer-days')
      .then((d) => setShowOrganizerLink(d.days.length > 0))
      .catch(() => {});
  }, [user]);

  // Dropdown schließt bei Navigation, Klick außerhalb und Escape.
  useEffect(() => {
    setAdminOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!adminOpen) return undefined;
    const onPointer = (e) => {
      if (adminRef.current && !adminRef.current.contains(e.target)) setAdminOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAdminOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [adminOpen]);

  const mainLinks = [
    { to: '/', icon: faUtensils, label: 'Heute', end: true },
    { to: '/meine-bestellungen', icon: faReceipt, label: 'Meine Bestellungen' },
    ...(showOrganizerLink
      ? [{ to: '/organisation', icon: faClipboardList, label: 'Organisation' }]
      : []),
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            {branding.logoUrl ? (
              <img className="brand-logo" src={branding.logoUrl} alt="Logo" />
            ) : (
              <span className="brand-emoji">🍽️</span>
            )}{' '}
            Essensbestellung
          </span>
          <nav className="nav">
            {mainLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                <FontAwesomeIcon icon={l.icon} fixedWidth /> {l.label}
              </NavLink>
            ))}
            {user.role === 'admin' && (
              <div className={`nav-dropdown${adminOpen ? ' open' : ''}`} ref={adminRef}>
                <button
                  type="button"
                  className={`nav-dropdown-trigger${
                    location.pathname.startsWith('/admin') ? ' active' : ''
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={adminOpen}
                  onClick={() => setAdminOpen((o) => !o)}
                >
                  <FontAwesomeIcon icon={faScrewdriverWrench} fixedWidth /> Admin{' '}
                  <FontAwesomeIcon icon={faChevronDown} className="nav-dropdown-chevron" />
                </button>
                <div className="nav-dropdown-menu" role="menu">
                  {ADMIN_LINKS.map((l) => (
                    <NavLink key={l.to} to={l.to} role="menuitem" onClick={() => setAdminOpen(false)}>
                      <FontAwesomeIcon icon={l.icon} fixedWidth /> {l.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </nav>
          <div className="topbar-user">
            <button
              className="btn btn-ghost theme-toggle"
              title={theme === 'dark' ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
              aria-label="Hell-/Dunkelmodus umschalten"
              onClick={() => setTheme(toggleTheme())}
            >
              <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
            </button>
            <span className="user-name">
              {user.displayName}
              {user.role === 'admin' && <span className="badge badge-admin">Admin</span>}
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate('/login');
              }}
            >
              <FontAwesomeIcon icon={faRightFromBracket} /> Abmelden
            </button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
