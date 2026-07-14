import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showOrganizerLink, setShowOrganizerLink] = useState(user.role === 'admin');

  useEffect(() => {
    if (user.role === 'admin') {
      setShowOrganizerLink(true);
      return;
    }
    api('/my/organizer-days')
      .then((d) => setShowOrganizerLink(d.days.length > 0))
      .catch(() => {});
  }, [user]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-emoji">🍽️</span> Essensbestellung
          </span>
          <nav className="nav">
            <NavLink to="/" end>
              Heute
            </NavLink>
            <NavLink to="/meine-bestellungen">Meine Bestellungen</NavLink>
            {showOrganizerLink && <NavLink to="/organisation">Organisation</NavLink>}
            {user.role === 'admin' && (
              <>
                <NavLink to="/admin/tage">Tagesplanung</NavLink>
                <NavLink to="/admin/restaurants">Restaurants</NavLink>
                <NavLink to="/admin/benutzer">Benutzer</NavLink>
              </>
            )}
          </nav>
          <div className="topbar-user">
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
              Abmelden
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
