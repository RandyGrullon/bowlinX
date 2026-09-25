import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { CalendarDays, Check, ChevronDown, Globe, Lock, Medal, Plus, Settings2, Trophy, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeague, useLeaguesByIds, useMembership, useMyMemberships, useSubmissions } from '../lib/data';
import { LeagueContext, rememberLeague, type LeagueCtx } from '../lib/league';
import { AccountButton, AppShell, Brand, OfflineBar } from './Shell';
import { Empty, Loading, Modal, TopLoader, cx } from './ui';

/** Marco de todo lo que pasa dentro de una liga: cambia de liga arriba y navega abajo (Eventos · Ranking · Perfil). */
export default function LeagueShell() {
  const { lid } = useParams();
  const { user, isSuper, loading: authLoading } = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, user?.uid);
  const location = useLocation();
  const [switching, setSwitching] = useState(false);

  const ctx = useMemo<LeagueCtx | null>(() => {
    if (!lid || !league.data) return null;
    const member = membership.data;
    const isOwner = member?.role === 'owner';
    return {
      lid,
      league: league.data,
      member,
      isOwner,
      isAdmin: isSuper || isOwner || member?.role === 'admin',
      myPlayerId: member?.playerId ?? null,
      base: `/l/${lid}`,
    };
  }, [lid, league.data, membership.data, isSuper]);

  useEffect(() => {
    if (ctx && (ctx.member || ctx.league.visibility === 'public')) rememberLeague(ctx.lid);
  }, [ctx]);

  const pending = useSubmissions(ctx?.isAdmin ? lid : undefined, 'pendiente').data.length;

  if (authLoading || league.loading || membership.loading) return <Loading />;
  if (!ctx) {
    // Privada sin ser miembro (sin permiso) o borrada.
    return (
      <AppShell>
        <Empty icon={<Lock className="size-8" />} title="No puedes ver esta liga">
          Es privada o ya no existe. Para entrar necesitas el link o el código de invitación que te comparta un admin.
          <div className="mt-4">
            <Link to="/ligas" className="font-medium text-accent">
              Ver ligas
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  const base = ctx.base;
  const standalone = ctx.league.kind === 'torneo';
  const nav = [
    standalone ? { to: base, label: 'Torneo', icon: Trophy, end: true } : { to: base, label: 'Eventos', icon: CalendarDays, end: true },
    ...(standalone ? [] : [{ to: `${base}/ranking`, label: 'Ranking', icon: Medal }]),
    { to: `${base}/perfil`, label: 'Perfil', icon: UserRound },
    ...(ctx.isAdmin ? [{ to: `${base}/admin`, label: 'Admin', icon: Settings2, count: pending }] : []),
  ];

  return (
    <LeagueContext.Provider value={ctx}>
      <div className="min-h-dvh pb-20 sm:pb-8">
        <header className="pt-safe sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
            <Brand compact />
            <button
              type="button"
              onClick={() => setSwitching(true)}
              className="flex min-w-0 items-center gap-1 rounded-xl px-2 py-1.5 text-left font-semibold hover:bg-surface-2"
              aria-label="Cambiar de liga"
            >
              <span className="truncate">{ctx.league.name}</span>
              <ChevronDown className="size-4 shrink-0 text-muted" />
            </button>
            <nav className="ml-2 hidden gap-1 sm:flex">
              {nav.map(({ to, label, icon: Icon, end, count }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
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
            <div className="ml-auto shrink-0">
              <AccountButton />
            </div>
          </div>
        </header>
        <OfflineBar />

        <main className="mx-auto max-w-5xl px-4 py-5">
          <Suspense fallback={<TopLoader />}>
            {/* key = ruta: cada pantalla entra con una transición suave */}
            <div key={location.pathname} className="animate-fade-up">
              <Outlet />
            </div>
          </Suspense>
        </main>

        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur sm:hidden">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
            {nav.map(({ to, label, icon: Icon, end, count }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition', isActive ? 'text-accent' : 'text-muted')
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

        <LeagueSwitcher open={switching} onClose={() => setSwitching(false)} current={ctx.lid} />
      </div>
    </LeagueContext.Provider>
  );
}

function LeagueSwitcher({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const { user } = useAuth();
  const memberships = useMyMemberships(open ? user?.uid : undefined);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  return (
    <Modal open={open} onClose={onClose} title="Tus ligas y torneos">
      <div className="flex flex-col gap-1">
        {!user && <p className="px-1 py-2 text-sm text-muted">Entra con tu cuenta para ver tus ligas.</p>}
        {user && memberships.loading && <p className="px-1 py-2 text-sm text-muted">Cargando…</p>}
        {leagues.data.map((l) => (
          <Link
            key={l.id}
            to={`/l/${l.id}`}
            onClick={onClose}
            className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2', l.id === current && 'bg-accent-soft')}
          >
            {l.kind === 'torneo' ? (
              <Trophy className="size-4 text-muted" />
            ) : l.visibility === 'private' ? (
              <Lock className="size-4 text-muted" />
            ) : (
              <Globe className="size-4 text-muted" />
            )}
            <span className="flex-1 truncate font-medium">{l.name}</span>
            {l.id === current && <Check className="size-4 text-accent" />}
          </Link>
        ))}
        <Link to="/ligas" onClick={onClose} className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-sm font-medium text-accent hover:bg-surface-2">
          <Plus className="size-4" /> Buscar, unirme o crear
        </Link>
      </div>
    </Modal>
  );
}
