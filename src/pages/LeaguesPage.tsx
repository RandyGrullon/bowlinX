import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Crown, Globe, Lock, LogIn, MapPin, Plus, Shield, Ticket, Trophy, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { joinLeague, useLeaguesByIds, useMyMemberships, usePublicLeagues } from '../lib/data';
import { roleLabel } from '../lib/league';
import type { League, LeagueKind, Member } from '../lib/types';
import { AppShell } from '../components/Shell';
import { LeagueFormModal } from '../components/LeagueFormModal';
import { useAction } from '../components/feedback';
import { Badge, Button, Card, Empty, Input, ListSkeleton, LoadError } from '../components/ui';

/** Ligas: las mías, unirme con código, crear una y las públicas para explorar. */
export default function LeaguesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const memberships = useMyMemberships(auth.user?.uid);
  const mine = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const pub = usePublicLeagues();
  const [creating, setCreating] = useState<LeagueKind | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const roleOf = (lid: string) => memberships.data.find((m) => m.leagueId === lid)?.role;
  const others = pub.data.filter((l) => !roleOf(l.id)).sort((a, b) => a.name.localeCompare(b.name));

  function submitCode(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/unirse/${encodeURIComponent(c)}`);
  }

  async function join(l: League) {
    if (!auth.user) return navigate(`/login?next=${encodeURIComponent('/ligas')}`);
    setJoining(l.id);
    const ok = await run(async () => {
      await joinLeague(l.id, { uid: auth.user!.uid, name: displayName(auth) }, null);
      return true;
    }, `Te uniste a ${l.name}`);
    setJoining(null);
    if (ok) navigate(`/l/${l.id}/perfil`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ligas y torneos</h1>
            <p className="text-sm text-muted">Torneos, prácticas y ranking de cada liga de boliche, o torneos sueltos.</p>
          </div>
        </div>

        {auth.user && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating('liga')}>
              Crear liga
            </Button>
            <Button icon={<Trophy className="size-4" />} onClick={() => setCreating('torneo')}>
              Torneo sin liga
            </Button>
          </div>
        )}

        {!auth.user && !auth.loading && (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-medium">Entra para unirte a tu liga o crear una</p>
              <p className="text-sm text-muted">Las ligas públicas se pueden ver sin cuenta.</p>
            </div>
            <div className="flex gap-2">
              <Link to="/login?next=%2Fligas" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
                <LogIn className="size-4" /> Entrar
              </Link>
              <Link
                to="/login?modo=registro&next=%2Fligas"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" /> Crear cuenta
              </Link>
            </div>
          </Card>
        )}

        {auth.user && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">Mis ligas y torneos</h2>
            {memberships.error ? (
              <LoadError error={memberships.error} />
            ) : memberships.loading || mine.loading ? (
              <ListSkeleton rows={2} />
            ) : mine.data.length === 0 ? (
              <Empty icon={<Shield className="size-8" />} title="Todavía no estás en ninguna liga">
                Únete con el código o el link que te compartieron, o crea tu liga o un torneo.
              </Empty>
            ) : (
              <Card className="stagger divide-y divide-line overflow-hidden">
                {mine.data.map((l, i) => (
                  <LeagueRow key={l.id} league={l} index={i} role={roleOf(l.id)} />
                ))}
              </Card>
            )}
          </section>
        )}

        <Card className="p-4">
          <form onSubmit={submitCode} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 sm:w-56">
              <Ticket className="size-5 text-accent" />
              <span className="text-sm font-medium">¿Te invitaron? Pon el código</span>
            </div>
            <div className="flex flex-1 gap-2">
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

        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Globe className="size-4" /> Públicas
          </h2>
          {pub.error ? (
            <LoadError error={pub.error} />
          ) : pub.loading ? (
            <ListSkeleton rows={3} />
          ) : others.length === 0 ? (
            <p className="text-sm text-muted">{pub.data.length ? 'Ya estás en todas las públicas.' : 'Todavía no hay ligas ni torneos públicos.'}</p>
          ) : (
            <Card className="stagger divide-y divide-line overflow-hidden">
              {others.map((l, i) => (
                <div key={l.id} style={{ '--i': i } as CSSProperties} className="flex items-center gap-3 px-4 py-3">
                  <Link to={`/l/${l.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{l.name}</span>
                      {l.kind === 'torneo' && <Badge tone="accent">Torneo</Badge>}
                    </div>
                    <LeagueMeta league={l} />
                  </Link>
                  <Button size="sm" loading={joining === l.id} onClick={() => join(l)}>
                    Unirme
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </section>

        {auth.isSuper && (
          <Link to="/superadmin" className="flex items-center justify-center gap-2 text-sm font-medium text-accent">
            <Crown className="size-4" /> Panel del superadmin
          </Link>
        )}
      </div>

      <LeagueFormModal open={creating != null} onClose={() => setCreating(null)} kind={creating ?? 'liga'} onSaved={(to) => navigate(to)} />
    </AppShell>
  );
}

export function LeagueMeta({ league }: { league: League }) {
  const bits = [league.venue, league.schedule].filter(Boolean);
  if (!bits.length) return null;
  return (
    <div className="flex items-center gap-1 truncate text-xs text-muted">
      <MapPin className="size-3 shrink-0" />
      <span className="truncate">{bits.join(' · ')}</span>
    </div>
  );
}

function LeagueRow({ league, role, index }: { league: League; role?: Member['role']; index: number }) {
  return (
    <Link to={`/l/${league.id}`} style={{ '--i': index } as CSSProperties} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        {league.kind === 'torneo' ? <Trophy className="size-5" /> : league.visibility === 'private' ? <Lock className="size-5" /> : <Globe className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{league.name}</span>
          {league.kind === 'torneo' && <Badge>Torneo</Badge>}
          {role && role !== 'member' && <Badge tone="accent">{roleLabel(role)}</Badge>}
        </div>
        <LeagueMeta league={league} />
      </div>
      <ChevronRight className="size-4 text-muted" />
    </Link>
  );
}
