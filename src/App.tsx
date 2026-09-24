import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { badConfig, firebaseConfigured } from './lib/firebase';
import { FeedbackProvider } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PwaPrompts } from './components/PwaPrompts';
import { Loading, TopLoader } from './components/ui';

// Cada pantalla se descarga al entrar: la página pública del jugador no carga el panel del admin.
const AdminLayout = lazy(() => import('./components/AdminLayout'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const PlayersPage = lazy(() => import('./pages/PlayersPage'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const PlayerPage = lazy(() => import('./pages/PlayerPage'));
const MyProfilePage = lazy(() => import('./pages/MyProfilePage'));
const PublicEventPage = lazy(() => import('./pages/PublicEventPage'));
const RankingPage = lazy(() => import('./pages/RankingPage'));

function useLoginRedirect() {
  const location = useLocation();
  return `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}

/** Panel: solo admins. Un jugador con sesión va a su perfil. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const toLogin = useLoginRedirect();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={toLogin} replace />;
  if (!isAdmin) return <Navigate to="/mi" replace />;
  return <>{children}</>;
}

function RequireUser({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const toLogin = useLoginRedirect();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={toLogin} replace />;
  return <>{children}</>;
}

function MissingConfig() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-sm">
      <h1 className="mb-2 text-lg font-semibold">Falta la configuración de Firebase</h1>
      <p className="text-muted">
        Revisa estas variables (vacías o con caracteres raros, como una clave copiada oculta con •••):
      </p>
      <ul className="my-3 list-disc pl-5 font-mono text-xs">
        {badConfig.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <p className="text-muted">
        Corrígelas en <code>.env.local</code> o en Vercel → Settings → Environment Variables (ver <code>.env.example</code>) y
        vuelve a desplegar.
      </p>
    </div>
  );
}

export default function App() {
  if (!firebaseConfigured) return <MissingConfig />;
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FeedbackProvider>
          <BrowserRouter>
            <Suspense fallback={<TopLoader />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/j/:playerId" element={<PlayerPage />} />
                <Route path="/e/:eventId" element={<PublicEventPage />} />
                <Route path="/ranking" element={<RankingPage />} />
                <Route
                  path="/mi"
                  element={
                    <RequireUser>
                      <MyProfilePage />
                    </RequireUser>
                  }
                />
                <Route
                  element={
                    <RequireAdmin>
                      <AdminLayout />
                    </RequireAdmin>
                  }
                >
                  <Route index element={<Navigate to="/torneos" replace />} />
                  <Route path="/torneos" element={<EventsPage type="torneo" />} />
                  <Route path="/practicas" element={<EventsPage type="practica" />} />
                  <Route path="/jugadores" element={<PlayersPage />} />
                  <Route path="/aprobaciones" element={<ApprovalsPage />} />
                  <Route path="/eventos/:eventId" element={<EventPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
            <PwaPrompts />
          </BrowserRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
