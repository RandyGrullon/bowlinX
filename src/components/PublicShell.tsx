import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { LayoutDashboard, Link2, LogIn, LogOut, Medal, Trophy, UserRound } from 'lucide-react';
import { logout, useAuth } from '../lib/auth';
import { useEvents } from '../lib/data';
import { Logo } from './Logo';
import { Button, cx } from './ui';

const linkClass = 'inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-surface-2';

/** Marco de las páginas públicas (perfil, clasificación, ranking): se ven sin login. En el celular, barra inferior. */
export function PublicShell({ children, onShare }: { children: ReactNode; onShare?: () => void }) {
  const { user, profile, isAdmin } = useAuth();
  const events = useEvents();
  const location = useLocation();
  const here = location.pathname + location.search;
  // El torneo actual (el más reciente) para llegar a su clasificación con un toque.
  const tournament = events.data.find((e) => e.type === 'torneo');
  const profileTo = user ? (profile?.playerId ? `/j/${profile.playerId}` : '/mi') : `/login?next=${encodeURIComponent(here)}`;

  const tabs = [
    { to: '/ranking', label: 'Ranking', icon: Medal },
    ...(tournament ? [{ to: `/e/${tournament.id}`, label: 'Torneo', icon: Trophy }] : []),
    { to: profileTo, label: user ? 'Mi perfil' : 'Entrar', icon: user ? UserRound : LogIn },
    ...(isAdmin ? [{ to: '/torneos', label: 'Panel', icon: LayoutDashboard }] : []),
  ];

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-1 px-4">
          <Link to={isAdmin ? '/torneos' : user ? '/mi' : '/ranking'} className="mr-auto flex items-center gap-2 font-semibold">
            <Logo />
            BowlinX
          </Link>
          {onShare && (
            <Button variant="ghost" size="sm" icon={<Link2 className="size-4" />} onClick={onShare} aria-label="Compartir" title="Compartir" />
          )}
          <nav className="hidden items-center gap-1 sm:flex">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink key={label} to={to} className={({ isActive }) => cx(linkClass, isActive && 'bg-accent-soft text-accent')}>
                <Icon className="size-4" /> {label}
              </NavLink>
            ))}
          </nav>
          {user && (
            <Button variant="ghost" size="sm" icon={<LogOut className="size-4" />} onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión" />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', isActive ? 'text-accent' : 'text-muted')}
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
