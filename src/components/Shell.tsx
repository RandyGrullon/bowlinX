import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { LogIn, WifiOff } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { usingEmulators } from '../lib/firebase';
import { Logo } from './Logo';
import { TopLoader, cx } from './ui';
import { Avatar } from './Avatar';

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

export function OfflineBar() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warn-soft px-4 py-2 text-sm text-warn">
      <WifiOff className="size-4" /> Sin conexión: los cambios se guardan y se sincronizan al volver.
    </div>
  );
}

/** Botón de la cuenta: avatar que lleva a /perfil, o "Entrar". */
export function AccountButton() {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <Link to={`/login?next=${next}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-surface-2">
        <LogIn className="size-4" /> Entrar
      </Link>
    );
  }
  return (
    <Link to="/perfil" aria-label="Mi cuenta" title="Mi cuenta" className="rounded-full ring-accent/40 transition hover:ring-4">
      <Avatar name={displayName(auth)} className="size-8 text-xs" />
    </Link>
  );
}

export function Brand({ to = '/ligas', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="flex shrink-0 items-center gap-2 font-semibold" aria-label="BowlingX">
      <Logo />
      {!compact && <span>BowlingX</span>}
      {usingEmulators && <span className="rounded bg-warn-soft px-1.5 text-[11px] font-medium text-warn">EMULADOR</span>}
    </Link>
  );
}

/** Marco de las pantallas fuera de una liga (ligas, cuenta, superadmin, unirse). */
export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const location = useLocation();
  return (
    <div className="min-h-dvh pb-8">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className={cx('mx-auto flex h-14 items-center gap-3 px-4', wide ? 'max-w-5xl' : 'max-w-3xl')}>
          <Brand />
          <div className="ml-auto">
            <AccountButton />
          </div>
        </div>
      </header>
      <OfflineBar />
      <main className={cx('mx-auto px-4 py-6', wide ? 'max-w-5xl' : 'max-w-3xl')}>
        <Suspense fallback={<TopLoader />}>
          <div key={location.pathname} className="animate-fade-up">
            {children}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
