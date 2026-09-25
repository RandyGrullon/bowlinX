import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, CalendarDays, Crown, Globe, Lock, LogIn, Plus, Ticket, Trophy, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { lastLeague } from '../lib/league';
import type { LeagueKind } from '../lib/types';
import { LiveNow } from '../components/LiveNow';
import { AppShell } from '../components/Shell';
import { LeagueFormModal } from '../components/LeagueFormModal';
import { Logo } from '../components/Logo';
import { Button, Card, Input, Loading } from '../components/ui';

/** Home: lo que está en juego ahora, volver a tu última liga, crear una liga o un torneo y unirse con un código. */
export default function HomePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const [creating, setCreating] = useState<LeagueKind | null>(null);
  const [code, setCode] = useState('');

  if (auth.loading) return <Loading />;

  // La última liga que abriste en este teléfono (si sigues en ella), si no la primera.
  const last = lastLeague();
  const resume = leagues.data.find((l) => l.id === last) ?? (leagues.data.length === 1 ? leagues.data[0] : undefined);

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/unirse/${encodeURIComponent(c)}`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Logo className="size-11" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{auth.user ? `Hola, ${displayName(auth).split(' ')[0]}` : 'BowlingX'}</h1>
            <p className="text-sm text-muted">Ligas y torneos de boliche</p>
          </div>
        </div>

        {auth.user && <LiveNow />}

        {resume && (
          <Link
            to={`/l/${resume.id}`}
            className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft via-surface to-surface p-4 transition hover:brightness-105"
          >
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-fg">
              {resume.kind === 'torneo' ? <Trophy className="size-5" /> : <CalendarDays className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-accent">Seguir en</p>
              <p className="truncate font-semibold">{resume.name}</p>
            </div>
            <ArrowRight className="size-5 text-accent" />
          </Link>
        )}

        {auth.user ? (
          <>
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted">Crear</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                <CreateCard
                  icon={<Plus className="size-5" />}
                  title="Crear una liga"
                  text="Con torneos, prácticas y ranking. Pública o privada; invitas con link o QR."
                  onClick={() => setCreating('liga')}
                  primary
                />
                <CreateCard
                  icon={<Trophy className="size-5" />}
                  title="Torneo sin liga"
                  text="Un torneo suelto con sus propios jugadores, equipos y clasificación."
                  onClick={() => setCreating('torneo')}
                />
              </div>
            </section>

            <Card className="p-4">
              <form onSubmit={submitCode} className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Ticket className="size-5 text-accent" /> ¿Te invitaron? Pon el código
                </span>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABCD2345"
                    maxLength={12}
                    autoCapitalize="characters"
                    className="font-mono tracking-widest uppercase"
                    aria-label="Código de invitación"
                  />
                  <Button type="submit" disabled={!code.trim()}>
                    Unirme
                  </Button>
                </div>
              </form>
            </Card>

            <Link to="/ligas" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:bg-surface-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Globe className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">Ver ligas y torneos</p>
                <p className="text-sm text-muted">Las tuyas {memberships.data.length ? `(${memberships.data.length})` : ''} y las públicas para unirte.</p>
              </div>
              <ArrowRight className="size-4 text-muted" />
            </Link>

            {auth.isSuper && (
              <Link to="/superadmin" className="flex items-center justify-center gap-2 text-sm font-medium text-accent">
                <Crown className="size-4" /> Panel del superadmin
              </Link>
            )}
          </>
        ) : (
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <p className="font-semibold">Tu liga de boliche en el celular</p>
              <p className="text-sm text-muted">
                Torneos con equipos y handicap, prácticas, ranking y tus estadísticas. Entra para crear tu liga o unirte a la de tus amigos.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link to="/login?next=%2F" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
                <LogIn className="size-4" /> Entrar
              </Link>
              <Link
                to="/login?modo=registro&next=%2F"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" /> Crear cuenta
              </Link>
            </div>
            <Link to="/ligas" className="flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
              <Lock className="size-3.5" /> Las ligas públicas se ven sin cuenta <ArrowRight className="size-4" />
            </Link>
          </Card>
        )}
      </div>

      <LeagueFormModal open={creating != null} onClose={() => setCreating(null)} kind={creating ?? 'liga'} onSaved={(to) => navigate(to)} />
    </AppShell>
  );
}

function CreateCard({ icon, title, text, onClick, primary }: { icon: ReactNode; title: string; text: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'flex items-start gap-3 rounded-2xl bg-accent p-4 text-left text-accent-fg shadow-sm transition active:scale-[0.98]'
          : 'flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:bg-surface-2 active:scale-[0.98]'
      }
    >
      <span className={primary ? 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15' : 'flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent'}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className={primary ? 'block text-sm opacity-85' : 'block text-sm text-muted'}>{text}</span>
      </span>
    </button>
  );
}
