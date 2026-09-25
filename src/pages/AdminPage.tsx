import { lazy, Suspense, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DatabaseBackup, ImageMinus, Inbox, Save, Settings2, Shield, ShieldCheck, ShieldOff, Trash2, UserMinus, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { deleteLeague, deleteOldPhotos, removeMember, setMemberRole, updateLeague, useLeagueMembers, usePlayers, useSubmissions } from '../lib/data';
import { rememberLeague, roleLabel, useLeagueCtx } from '../lib/league';
import type { Member } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { InviteCard } from '../components/InviteCard';
import { LeagueForm, leagueInput } from '../components/LeagueFormModal';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, ListSkeleton, LoadError, Tabs, TopLoader } from '../components/ui';

const PlayersPage = lazy(() => import('./PlayersPage'));
const ApprovalsPage = lazy(() => import('./ApprovalsPage'));

type Tab = 'jugadores' | 'aprobar' | 'miembros' | 'liga';

/** Administración de la liga (dueño, admins y superadmin). */
export default function AdminPage() {
  const { lid, isAdmin, league } = useLeagueCtx();
  const [params, setParams] = useSearchParams();
  const pending = useSubmissions(isAdmin ? lid : undefined, 'pendiente').data.length;
  const tabs: { key: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { key: 'jugadores', label: 'Jugadores', icon: <Users className="size-4" /> },
    { key: 'aprobar', label: 'Aprobar', icon: <Inbox className="size-4" />, count: pending },
    { key: 'miembros', label: 'Miembros', icon: <Shield className="size-4" /> },
    { key: 'liga', label: league.kind === 'torneo' ? 'Datos' : 'Liga', icon: <Settings2 className="size-4" /> },
  ];
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.key === requested) ? requested! : 'jugadores';

  if (!isAdmin) {
    return <LoadError error={new Error('permission-denied')} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <Tabs items={tabs} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      <Suspense fallback={<TopLoader />}>
        <div key={tab} className="animate-fade-up">
          {tab === 'jugadores' ? <PlayersPage /> : tab === 'aprobar' ? <ApprovalsPage /> : tab === 'miembros' ? <MembersPanel /> : <SettingsPanel />}
        </div>
      </Suspense>
    </div>
  );
}

const ORDER: Record<Member['role'], number> = { owner: 0, admin: 1, member: 2 };

/** Miembros: nombrar o quitar admins y sacar gente de la liga. */
function MembersPanel() {
  const { lid } = useLeagueCtx();
  const { user } = useAuth();
  const run = useAction();
  const { confirm } = useFeedback();
  const members = useLeagueMembers(lid);
  const players = usePlayers(lid);
  const playerName = useMemo(() => new Map(players.data.map((p) => [p.id, p.name])), [players.data]);
  const sorted = [...members.data].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));

  async function toggleAdmin(m: Member) {
    const makeAdmin = m.role === 'member';
    const ok = await confirm({
      title: makeAdmin ? `¿Hacer admin a ${m.name}?` : `¿Quitarle admin a ${m.name}?`,
      message: makeAdmin
        ? 'Podrá crear torneos y prácticas, anotar y aprobar juegos, manejar jugadores, invitar y nombrar admins.'
        : m.uid === user?.uid
          ? 'Vas a dejar de administrar esta liga.'
          : 'Sigue en la liga como miembro.',
      confirmText: makeAdmin ? 'Hacer admin' : 'Quitar admin',
      danger: !makeAdmin,
    });
    if (ok) await run(() => setMemberRole(m, makeAdmin ? 'admin' : 'member'), makeAdmin ? `${m.name} ahora es admin` : 'Listo');
  }

  async function kick(m: Member) {
    const ok = await confirm({
      title: `¿Sacar a ${m.name} de la liga?`,
      message: 'Sus juegos se quedan; su cuenta deja de estar en la liga. Si es privada, necesitará otra invitación para volver.',
      confirmText: 'Sacar',
      danger: true,
    });
    if (ok) await run(() => removeMember(m), `${m.name} ya no está en la liga`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Miembros</h2>
        <p className="text-sm text-muted">Los admins manejan todo en la liga. El dueño no se puede quitar.</p>
      </div>
      {members.error ? (
        <LoadError error={members.error} />
      ) : members.loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <Card className="stagger divide-y divide-line overflow-hidden">
          {sorted.map((m, i) => (
            <div key={m.id} style={{ '--i': i } as CSSProperties} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{m.name}</span>
                  {m.role !== 'member' && <Badge tone="accent">{roleLabel(m.role)}</Badge>}
                  {m.uid === user?.uid && <Badge>Tú</Badge>}
                </div>
                <div className="truncate text-xs text-muted">
                  {m.playerId ? `Jugador: ${playerName.get(m.playerId) ?? '—'}` : 'Todavía no elige su jugador'}
                </div>
              </div>
              {m.role !== 'owner' && (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    icon={m.role === 'admin' ? <ShieldOff className="size-4" /> : <ShieldCheck className="size-4" />}
                    onClick={() => toggleAdmin(m)}
                  >
                    {m.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                  </Button>
                  {m.uid !== user?.uid && (
                    <Button size="sm" variant="ghost" className="text-danger" aria-label={`Sacar a ${m.name}`} title="Sacar de la liga" icon={<UserMinus className="size-4" />} onClick={() => kick(m)} />
                  )}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/** Datos de la liga, invitación y mantenimiento (respaldo, fotos viejas, borrar). */
function SettingsPanel() {
  const { lid, league, isOwner } = useLeagueCtx();
  const { user, isSuper } = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const initial = useMemo(() => leagueInput(league), [league]);

  async function backup() {
    setBusy('backup');
    try {
      const { downloadLeagueBackup } = await import('../lib/backup');
      const c = await downloadLeagueBackup(league);
      toast(`Respaldo descargado: ${c.players} jugadores, ${c.events} eventos, ${c.entries} participaciones`);
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el respaldo. Intenta de nuevo.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function freePhotos() {
    const ok = await confirm({
      title: 'Borrar fotos de hace más de un año',
      message: 'Los juegos siguen contando; solo deja de verse la foto. Sirve para no llenar el espacio gratis.',
      confirmText: 'Borrar fotos',
      danger: true,
    });
    if (!ok) return;
    setBusy('photos');
    const n = await run(() => deleteOldPhotos(lid, 12));
    if (n != null) toast(n ? `${n} fotos borradas` : 'No hay fotos de hace más de un año');
    setBusy(null);
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar ${league.name}?`,
      message: 'Se borran sus torneos, prácticas, jugadores, juegos, fotos, miembros e invitación. No se puede deshacer; descarga el respaldo antes.',
      confirmText: 'Borrar todo',
      danger: true,
    });
    if (!ok || !user) return;
    setBusy('delete');
    const done = await run(async () => {
      await deleteLeague(lid, user.uid);
      return true;
    }, 'Borrado');
    setBusy(null);
    if (done) {
      rememberLeague(null);
      navigate('/ligas', { replace: true });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-lg font-bold tracking-tight">{league.kind === 'torneo' ? 'Datos del torneo' : 'Datos de la liga'}</h2>
        <LeagueForm
          id="league-settings"
          initial={initial}
          onSubmit={async (data) => {
            setSaving(true);
            await run(() => updateLeague(lid, data), 'Liga actualizada');
            setSaving(false);
          }}
        />
        <Button variant="primary" type="submit" form="league-settings" loading={saving} icon={<Save className="size-4" />} className="self-end">
          Guardar
        </Button>
      </Card>

      <InviteCard league={league} />

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-semibold">Mantenimiento</h3>
        <div className="flex flex-wrap gap-2">
          <Button icon={<DatabaseBackup className="size-4" />} loading={busy === 'backup'} onClick={backup}>
            Descargar respaldo
          </Button>
          <Button icon={<ImageMinus className="size-4" />} loading={busy === 'photos'} onClick={freePhotos}>
            Borrar fotos viejas
          </Button>
        </div>
        {(isOwner || isSuper) && (
          <Button variant="ghost" className="self-start text-danger" icon={<Trash2 className="size-4" />} loading={busy === 'delete'} onClick={remove}>
            {league.kind === 'torneo' ? 'Borrar el torneo' : 'Borrar la liga'}
          </Button>
        )}
      </Card>
    </div>
  );
}
