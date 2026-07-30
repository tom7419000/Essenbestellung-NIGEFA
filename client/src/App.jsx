import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { BrandingProvider } from './branding/BrandingContext.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import BlockedPage from './pages/BlockedPage.jsx';
import TodayPage from './pages/TodayPage.jsx';
import MyOrdersPage from './pages/MyOrdersPage.jsx';
import OrganizerPage from './pages/OrganizerPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import UsersAdmin from './pages/admin/UsersAdmin.jsx';
import PushAdmin from './pages/admin/PushAdmin.jsx';
import RestaurantsAdmin from './pages/admin/RestaurantsAdmin.jsx';
import DaysAdmin from './pages/admin/DaysAdmin.jsx';
import DesignAdmin from './pages/admin/DesignAdmin.jsx';
import SsoAdmin from './pages/admin/SsoAdmin.jsx';

function Protected({ children, adminOnly = false, plannerOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Lädt …</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  if (plannerOnly && user.role !== 'admin' && user.role !== 'planung') {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/gesperrt" element={<BlockedPage />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<TodayPage />} />
            <Route path="/meine-bestellungen" element={<MyOrdersPage />} />
            {/* Der Rückblick sitzt jetzt in den Einstellungen; alte Links
                (z. B. aus bereits verschickten Benachrichtigungen) landen dort. */}
            <Route path="/rueckblick" element={<Navigate to="/einstellungen" replace />} />
            <Route path="/organisation" element={<OrganizerPage />} />
            <Route path="/einstellungen" element={<SettingsPage />} />
            <Route
              path="/admin/tage"
              element={
                <Protected plannerOnly>
                  <DaysAdmin />
                </Protected>
              }
            />
            <Route
              path="/admin/restaurants"
              element={
                <Protected adminOnly>
                  <RestaurantsAdmin />
                </Protected>
              }
            />
            <Route
              path="/admin/benutzer"
              element={
                <Protected adminOnly>
                  <UsersAdmin />
                </Protected>
              }
            />
            <Route
              path="/admin/benachrichtigungen"
              element={
                <Protected adminOnly>
                  <PushAdmin />
                </Protected>
              }
            />
            <Route
              path="/admin/design"
              element={
                <Protected adminOnly>
                  <DesignAdmin />
                </Protected>
              }
            />
            <Route
              path="/admin/sso"
              element={
                <Protected adminOnly>
                  <SsoAdmin />
                </Protected>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </BrandingProvider>
  );
}
