import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { Check, LayoutDashboard, Search, UserPlus, UserRound } from 'lucide-react';
import { createProfile, useAuth } from '../lib/auth';
import { claimPlayer, createOwnPlayer, usePlayers } from '../lib/data';
import { useFeedback } from '../components/feedback';
import { PublicShell } from '../components/PublicShell';
import { Button, Card, Field, Input, ListSkeleton, LoadError } from '../components/ui';
import { Avatar } from './PlayersPage';

/**
 * Después de registrarse: la cuenta se vincula con su jugador (una sola vez).
 * Si ya está vinculada, lleva directo a su perfil.
 */
export default function MyProfilePage() {
  const { user, profile, isAdmin } = useAuth();
  const { toast, confirm } = useFeedback();
  const players = usePlayers();
  const [q, setQ] = useState('');
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  if (profile?.playerId) return <Navigate to={`/j/${profile.playerId}`} replace />;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : '';
      toast(/permission/i.test(msg) ? 'Ese jugador ya tiene cuenta. Si eres tú, pídele al admin que lo revise.' : 'No se pudo guardar. Intenta de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Cuenta creada en la consola de Firebase (sin perfil): se completa con el nombre.
  if (!profile) {
    return (
      <PublicShell>
        <Card className="animate-fade-up mx-auto flex max-w-sm flex-col gap-4 p-5">
          <div>
            <h1 className="text-lg font-semibold">Completa tu cuenta</h1>
            <p className="text-sm text-muted">Dinos tu nombre para vincularte con tu perfil de jugador.</p>
          </div>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              run(() => createProfile(user, name), 'Cuenta lista');
            }}
          >
            <Field label="Tu nombre">
              <Input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" loading={busy} icon={<Check className="size-4" />}>
              Continuar
            </Button>
          </form>
          {isAdmin && (
            <Link to="/torneos" className="text-center text-sm font-medium text-accent">
              Ir al panel de admin
            </Link>
          )}
        </Card>
      </PublicShell>
    );
  }

  const free = players.data.filter((p) => !p.uid);
  const filtered = free.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function pick(playerId: string, playerName: string) {
    const ok = await confirm({
      title: `¿Eres ${playerName}?`,
      message: 'Tu cuenta queda vinculada a este jugador: podrás subir sus juegos. Si te equivocas, el admin puede corregirlo.',
      confirmText: 'Sí, soy yo',
    });
    if (ok) await run(() => claimPlayer(user!.uid, playerId), 'Perfil vinculado');
  }

  async function createNew() {
    const ok = await confirm({
      title: 'Crear tu perfil de jugador',
      message: `Se crea el jugador "${profile!.name}" vinculado a tu cuenta.`,
      confirmText: 'Crear',
    });
    if (ok) await run(() => createOwnPlayer(user!.uid, profile!.name), 'Perfil creado');
  }

  return (
    <PublicShell>
      <div className="animate-fade-up flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <UserRound className="size-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Hola, {profile.name}</h1>
            <p className="text-sm text-muted">Elige quién eres en la lista de jugadores del club.</p>
          </div>
          {isAdmin && (
            <Link to="/torneos" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2">
              <LayoutDashboard className="size-4" /> Panel
            </Link>
          )}
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
                {free.length === 0 ? 'Todos los jugadores ya tienen cuenta.' : `Nadie coincide con “${q}”.`}
              </p>
            )}
          </Card>
        )}

        <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="font-medium">¿No estás en la lista?</p>
            <p className="text-sm text-muted">Crea tu perfil como “{profile.name}”. El admin lo verá con los demás jugadores.</p>
          </div>
          <Button icon={<UserPlus className="size-4" />} onClick={createNew} loading={busy}>
            Crear mi perfil
          </Button>
        </Card>
      </div>
    </PublicShell>
  );
}
