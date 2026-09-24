import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, ExternalLink, Link2, Plus, Search, ShieldCheck, Trash2, Unlink, UserRound } from 'lucide-react';
import { isFixedAdmin } from '../lib/admins';
import { createPlayer, deletePlayer, setRole, unlinkAccount, updatePlayer, useAllEntries, usePlayers, useUsers } from '../lib/data';
import { playerStats, type PlayerStats } from '../lib/stats';
import type { Entry, Player, UserProfile } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { playerUrl, shareLink } from '../components/share';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal } from '../components/ui';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, className = 'size-9 text-sm' }: { name: string; className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent ${className}`}>
      {initials(name)}
    </div>
  );
}

export function useStatsByPlayer(entries: Entry[]) {
  return useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const e of entries) groups.set(e.playerId, [...(groups.get(e.playerId) ?? []), e]);
    const map = new Map<string, PlayerStats>();
    groups.forEach((list, id) => map.set(id, playerStats(list)));
    return map;
  }, [entries]);
}

const noStats: PlayerStats = { games: 0, pins: 0, autoAverage: null, high: 0, highSeries: 0, pending: 0 };

export default function PlayersPage() {
  const { toast } = useFeedback();
  const players = usePlayers();
  const users = useUsers(true);
  const userById = useMemo(() => new Map(users.data.map((u) => [u.id, u])), [users.data]);
  const unlinked = users.data.filter((u) => !u.playerId);
  const entries = useAllEntries();
  const stats = useStatsByPlayer(entries.data);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Player | 'new' | null>(null);

  const filtered = players.data.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function share(p: Player) {
    const copied = await shareLink(playerUrl(p.id), `${p.name} · BowlinX`);
    if (copied) toast('Link copiado');
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Jugadores</h1>
          <p className="text-sm text-muted">Promedio calculado con los juegos verificados con foto.</p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
          <span className="hidden sm:inline">Nuevo jugador</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {players.data.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Buscar jugador" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      )}

      {players.error ? (
        <LoadError error={players.error} />
      ) : players.loading ? (
        <ListSkeleton rows={8} />
      ) : players.data.length === 0 ? (
        <Empty icon={<UserRound className="size-8" />} title="Todavía no hay jugadores">
          Agrega a los jugadores del club; después los inscribes en torneos y prácticas.
        </Empty>
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          <div className="hidden grid-cols-[1fr_6rem_5rem_5rem_5.5rem] gap-3 px-4 py-2 text-xs font-medium text-muted sm:grid">
            <span>Jugador</span>
            <span className="text-right">Promedio</span>
            <span className="text-right">Juegos</span>
            <span className="text-right">Mejor</span>
            <span />
          </div>
          {filtered.map((p, i) => {
            const s = stats.get(p.id) ?? noStats;
            const avg = p.averageOverride ?? s.autoAverage;
            const account = p.uid ? userById.get(p.uid) : undefined;
            return (
              <div
                key={p.id}
                style={{ '--i': i } as CSSProperties}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-surface-2/60 sm:grid sm:grid-cols-[1fr_6rem_5rem_5rem_5.5rem]"
              >
                <button onClick={() => setEditing(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.uid && (
                        <span title={account ? `Cuenta: ${account.email}` : 'Tiene cuenta'} className="shrink-0 text-ok">
                          {account?.role === 'admin' ? <ShieldCheck className="size-4" /> : <BadgeCheck className="size-4" />}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted sm:hidden">
                      <span className="tabular-nums">Prom. {avg ?? '—'}</span>
                      {p.averageOverride != null && <Badge>fijo</Badge>}
                      <span>· {s.games} juegos</span>
                    </div>
                    {s.pending > 0 && (
                      <Badge tone="warn" className="mt-0.5">
                        {s.pending} sin foto
                      </Badge>
                    )}
                  </div>
                </button>
                <div className="hidden items-center justify-end gap-1.5 text-right tabular-nums sm:flex">
                  {p.averageOverride != null && <Badge>fijo</Badge>}
                  <span className="font-semibold">{avg ?? '—'}</span>
                </div>
                <span className="hidden text-right text-muted tabular-nums sm:block">{s.games}</span>
                <span className="hidden text-right text-muted tabular-nums sm:block">{s.high || '—'}</span>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" title="Compartir link" aria-label="Compartir link" onClick={() => share(p)} icon={<Link2 className="size-4" />} />
                  <Link
                    to={`/j/${p.id}`}
                    title="Ver su página"
                    aria-label="Ver su página"
                    className="inline-flex size-8 items-center justify-center rounded-xl text-fg hover:bg-surface-2"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">Nadie coincide con “{q}”.</p>}
        </Card>
      )}

      {unlinked.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Cuentas sin vincular ({unlinked.length})</h2>
          <Card className="divide-y divide-line">
            {unlinked.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Avatar name={u.name} className="size-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
                {u.role === 'admin' ? <Badge tone="accent">Admin</Badge> : <Badge>Todavía no elige su jugador</Badge>}
              </div>
            ))}
          </Card>
        </section>
      )}

      <PlayerFormModal
        player={editing === 'new' ? null : editing}
        account={editing && editing !== 'new' && editing.uid ? userById.get(editing.uid) ?? null : null}
        open={editing != null}
        stats={editing && editing !== 'new' ? stats.get(editing.id) ?? noStats : noStats}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function PlayerFormModal({
  open,
  player,
  account,
  stats,
  onClose,
}: {
  open: boolean;
  player: Player | null;
  account: UserProfile | null;
  stats: PlayerStats;
  onClose: () => void;
}) {
  const run = useAction();
  const { confirm } = useFeedback();
  const [name, setName] = useState('');
  const [avg, setAvg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(player?.name ?? '');
    setAvg(player?.averageOverride != null ? String(player.averageOverride) : '');
  }, [open, player]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const averageOverride = avg.trim() === '' ? null : Math.min(300, Math.max(0, Math.round(+avg)));
    setBusy(true);
    if (player) await run(() => updatePlayer(player.id, { name: name.trim(), averageOverride }), 'Jugador actualizado');
    else await run(() => createPlayer(name, averageOverride), 'Jugador agregado');
    setBusy(false);
    onClose();
  }

  async function remove() {
    if (!player) return;
    const ok = await confirm({
      title: `¿Eliminar a ${player.name}?`,
      message: `Se borran también sus ${stats.games + stats.pending} juegos en torneos y prácticas. No se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    onClose();
    await run(() => deletePlayer(player.id, player.uid), 'Jugador eliminado');
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={player ? 'Editar jugador' : 'Nuevo jugador'}
      footer={
        <>
          {player && (
            <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
              Eliminar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="player-form" loading={busy}>
            {player ? 'Guardar' : 'Agregar'}
          </Button>
        </>
      }
    >
      <form id="player-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
        </Field>
        <Field
          label="Promedio fijo (opcional)"
          hint={
            stats.autoAverage != null
              ? `Calculado con sus juegos: ${stats.autoAverage} (${stats.games} juegos). Déjalo vacío para usar ese.`
              : 'Sin juegos verificados todavía. Si no pones uno, empieza en 0.'
          }
        >
          <Input type="number" inputMode="numeric" min={0} max={300} value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="Automático" />
        </Field>
      </form>
      {player && <AccountSection player={player} account={account} onDone={onClose} />}
    </Modal>
  );
}

/** Cuenta vinculada al jugador: el admin la desvincula (se eligió mal) o la nombra admin. */
function AccountSection({ player, account, onDone }: { player: Player; account: UserProfile | null; onDone: () => void }) {
  const run = useAction();
  const { confirm } = useFeedback();
  if (!player.uid) {
    return (
      <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
        Sin cuenta. Puede crear una en “Crear cuenta” y elegirse en la lista para subir sus juegos.
      </p>
    );
  }
  const fixed = isFixedAdmin(account?.email);
  const isAdmin = fixed || account?.role === 'admin';

  async function unlink() {
    const ok = await confirm({
      title: 'Desvincular cuenta',
      message: `${account?.email ?? 'La cuenta'} deja de estar vinculada a ${player.name} y podrá elegir su jugador otra vez.`,
      confirmText: 'Desvincular',
      danger: true,
    });
    if (!ok) return;
    onDone();
    await run(() => unlinkAccount(player.id, player.uid!), 'Cuenta desvinculada');
  }

  async function toggleAdmin() {
    if (!account) return;
    const ok = await confirm({
      title: isAdmin ? 'Quitar admin' : 'Hacer admin',
      message: isAdmin
        ? `${account.email} deja de ver el panel de administración.`
        : `${account.email} podrá crear eventos, anotar juegos y aprobar envíos.`,
      confirmText: isAdmin ? 'Quitar' : 'Hacer admin',
      danger: isAdmin,
    });
    if (ok) await run(() => setRole(account.id, isAdmin ? 'jugador' : 'admin'), isAdmin ? 'Ya no es admin' : 'Ahora es admin');
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line p-3">
      <div className="flex items-center gap-2 text-sm">
        <BadgeCheck className="size-4 text-ok" />
        <span className="min-w-0 flex-1 truncate">{account?.email ?? 'Cuenta vinculada'}</span>
        {isAdmin && <Badge tone="accent">Admin</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Unlink className="size-4" />} onClick={unlink}>
          Desvincular
        </Button>
        {account && !fixed && (
          <Button size="sm" icon={<ShieldCheck className="size-4" />} onClick={toggleAdmin}>
            {isAdmin ? 'Quitar admin' : 'Hacer admin'}
          </Button>
        )}
      </div>
    </div>
  );
}
