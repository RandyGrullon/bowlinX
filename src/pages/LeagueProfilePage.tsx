import { useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Eye, LogIn, LogOut, Search, UserPlus, UserRound } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { claimPlayer, createOwnPlayer, joinLeague, removeMember, usePlayers } from '../lib/data';
import { rememberLeague, roleLabel, useLeagueCtx } from '../lib/league';
import { useAction, useFeedback } from '../components/feedback';
import { Avatar } from '../components/Avatar';
import { Badge, Button, Card, Empty, Input, ListSkeleton, LoadError } from '../components/ui';
import PlayerPage from './PlayerPage';

/**
 * Perfil dentro de la liga:
 * - con jugador vinculado: su página de jugador;
 * - miembro sin jugador: elige quién es en la lista (o crea su jugador);
 * - sin ser miembro: unirse (pública) o pedir invitación (privada).
 */
export default function LeagueProfilePage() {
  const { myPlayerId, member } = useLeagueCtx();
  const { user } = useAuth();
  if (myPlayerId) return <PlayerPage playerId={myPlayerId} />;
  if (!user) return <SignInPrompt />;
  if (!member) return <NotMember />;
  return <ClaimPlayer />;
}

function SignInPrompt() {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname);
  return (
    <Empty icon={<UserRound className="size-8" />} title="Tu perfil de jugador">
      Entra para ver tus números, confirmar asistencia y subir tus juegos.
      <div className="mt-4 flex justify-center gap-2">
        <Link to={`/login?next=${next}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
          <LogIn className="size-4" /> Entrar
        </Link>
        <Link to={`/login?modo=registro&next=${next}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
          <UserPlus className="size-4" /> Crear cuenta
        </Link>
      </div>
    </Empty>
  );
}

function NotMember() {
  const { lid, league } = useLeagueCtx();
  const auth = useAuth();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  if (league.visibility === 'private') {
    return (
      <Empty icon={<Eye className="size-8" />} title="Estás viendo como superadmin">
        No eres miembro de esta liga privada. Para tener perfil aquí, pide el link de invitación.
      </Empty>
    );
  }
  async function join() {
    setBusy(true);
    await run(() => joinLeague(lid, { uid: auth.user!.uid, name: displayName(auth) }, null), `Te uniste a ${league.name}`);
    setBusy(false);
  }
  return (
    <Empty icon={<UserPlus className="size-8" />} title={`Únete a ${league.name}`}>
      Así eliges tu jugador, confirmas asistencia y subes tus juegos.
      <div className="mt-4">
        <Button variant="primary" loading={busy} onClick={join} icon={<UserPlus className="size-4" />}>
          Unirme
        </Button>
      </div>
    </Empty>
  );
}

/** Miembro sin jugador: se vincula con uno de la lista (una sola vez) o crea el suyo. */
function ClaimPlayer() {
  const { lid, league, member, isAdmin } = useLeagueCtx();
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const run = useAction();
  const players = usePlayers(lid);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = auth.user!.uid;
  const name = displayName(auth);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : '';
      toast(/permission/i.test(msg) ? 'Ese jugador ya tiene cuenta. Si eres tú, pídele a un admin que lo revise.' : 'No se pudo guardar. Intenta de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const free = players.data.filter((p) => !p.uid);
  const filtered = free.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function pick(playerId: string, playerName: string) {
    const ok = await confirm({
      title: `¿Eres ${playerName}?`,
      message: 'Tu cuenta queda vinculada a este jugador en esta liga: podrás subir sus juegos. Si te equivocas, un admin puede corregirlo.',
      confirmText: 'Sí, soy yo',
    });
    if (ok) await act(() => claimPlayer(lid, uid, playerId), 'Perfil vinculado');
  }

  async function createNew() {
    const ok = await confirm({
      title: 'Crear tu jugador',
      message: `Se crea el jugador "${name}" en ${league.name}, vinculado a tu cuenta.`,
      confirmText: 'Crear',
    });
    if (ok) await act(() => createOwnPlayer(lid, uid, name), 'Perfil creado');
  }

  async function leave() {
    if (!member) return;
    const ok = await confirm({ title: 'Salir de la liga', message: 'Para volver necesitas unirte otra vez.', confirmText: 'Salir', danger: true });
    if (!ok) return;
    const done = await run(async () => {
      await removeMember(member);
      return true;
    }, 'Saliste de la liga');
    if (done) {
      rememberLeague(null);
      navigate('/ligas');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Avatar name={name} className="size-11 text-sm" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Hola, {name}</h1>
            {member && member.role !== 'member' && <Badge tone="accent">{roleLabel(member.role)}</Badge>}
          </div>
          <p className="text-sm text-muted">Elige quién eres en la lista de jugadores de {league.name}.</p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <Input placeholder="Busca tu nombre" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {players.error ? (
        <LoadError error={players.error} />
      ) : players.loading ? (
        <ListSkeleton rows={6} />
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          {filtered.map((p, i) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => pick(p.id, p.name)}
              style={{ '--i': i } as CSSProperties}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 disabled:opacity-60"
            >
              <Avatar name={p.name} />
              <span className="flex-1 font-medium">{p.name}</span>
              <span className="text-sm font-medium text-accent">Soy yo</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted">
              {free.length === 0 ? 'No hay jugadores sin cuenta en la lista.' : `Nadie coincide con “${q}”.`}
            </p>
          )}
        </Card>
      )}

      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-medium">¿No estás en la lista?</p>
          <p className="text-sm text-muted">
            Crea tu jugador como “{name}”.{isAdmin ? '' : ' Los admins lo verán con los demás.'}
          </p>
        </div>
        <Button icon={<UserPlus className="size-4" />} onClick={createNew} loading={busy}>
          Crear mi jugador
        </Button>
      </Card>

      {member && member.role !== 'owner' && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" className="text-muted" icon={<LogOut className="size-4" />} onClick={leave}>
            Salir de la liga
          </Button>
        </div>
      )}
    </div>
  );
}
