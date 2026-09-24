import { Suspense, useEffect, useState } from 'react';
import { useFeedback } from './feedback';
import { NavLink, Outlet, useLocation } from 'react-router';
import { CalendarDays, DatabaseBackup, Inbox, LogOut, Medal, Trophy, UserRound, Users, WifiOff } from 'lucide-react';
import { logout, useAuth } from '../lib/auth';
import { useSubmissions } from '../lib/data';
import { usingEmulators } from '../lib/firebase';
import { Button, TopLoader, cx } from './ui';
import { Logo } from './Logo';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export default function AdminLayout() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const { toast } = useFeedback();
  const [backingUp, setBackingUp] = useState(false);

  async function backup() {
    setBackingUp(true);
    try {
      const { downloadBackup } = await import('../lib/backup');
      const counts = await downloadBackup();
      toast(`Respaldo descargado: ${counts.players} jugadores, ${counts.events} eventos, ${counts.entries} participaciones`);
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el respaldo. Intenta de nuevo.', 'error');
    } finally {
      setBackingUp(false);
    }
  }
  const online = useOnline();
  const pending = useSubmissions('pendiente').data.length;

  const nav = [
    { to: '/torneos', label: 'Torneos', icon: Trophy },
    { to: '/practicas', label: 'Prácticas', icon: CalendarDays },
    { to: '/jugadores', label: 'Jugadores', icon: Users },
    { to: '/aprobaciones', label: 'Aprobar', icon: Inbox, count: pending },
  ];

  return (
    <div className="min-h-dvh pb-20 sm:pb-8">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <NavLink to="/torneos" className="flex items-center gap-2 font-semibold">
            <Logo />
            <span>BowlinX</span>
          </NavLink>
          {usingEmulators && <span className="rounded bg-warn-soft px-1.5 text-[11px] font-medium text-warn">EMULADOR</span>}
          <nav className="ml-4 hidden gap-1 sm:flex">
            {nav.map(({ to, label, icon: Icon, count }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
                {!!count && <span className="rounded-full bg-accent px-1.5 text-[11px] leading-4 text-accent-fg">{count}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-48 truncate text-xs text-muted md:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              loading={backingUp}
              onClick={backup}
              icon={<DatabaseBackup className="size-4" />}
              aria-label="Descargar respaldo"
              title="Descargar respaldo de los datos (sin fotos)"
            />
            <NavLink
              to="/ranking"
              title="Ranking del club"
              aria-label="Ranking del club"
              className="inline-flex size-8 items-center justify-center rounded-xl hover:bg-surface-2"
            >
              <Medal className="size-4" />
            </NavLink>
            {profile?.playerId && (
              <NavLink
                to={`/j/${profile.playerId}`}
                title="Mi perfil de jugador"
                aria-label="Mi perfil de jugador"
                className="inline-flex size-8 items-center justify-center rounded-xl hover:bg-surface-2"
              >
                <UserRound className="size-4" />
              </NavLink>
            )}
            <Button variant="ghost" size="sm" onClick={logout} icon={<LogOut className="size-4" />} aria-label="Cerrar sesión" title="Cerrar sesión" />
          </div>
        </div>
      </header>

      {!online && (
        <div className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm text-warn">
          <WifiOff className="size-4" /> Sin conexión: los cambios se guardan y se sincronizan al volver.
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-5">
        <Suspense fallback={<TopLoader />}>
          {/* key = ruta: cada pantalla entra con una transición suave */}
          <div key={location.pathname} className="animate-fade-up">
            <Outlet />
          </div>
        </Suspense>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          {nav.map(({ to, label, icon: Icon, count }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon className="size-5" />
              {label}
              {!!count && (
                <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-danger px-1.5 text-[10px] leading-4 text-white">{count}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
