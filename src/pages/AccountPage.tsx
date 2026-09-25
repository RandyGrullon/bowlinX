import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Check, ChevronRight, Crown, LogOut, Pencil, Settings } from 'lucide-react';
import { createProfile, displayName, logout, renameProfile, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { rememberLeague, roleLabel } from '../lib/league';
import { AppShell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import { useAction } from '../components/feedback';
import { Badge, Button, Card, Field, Input, ListSkeleton, Loading } from '../components/ui';

/** Configuración de la cuenta (engrane de arriba): nombre, correo, mis ligas, superadmin y cerrar sesión. */
export default function AccountPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to="/login?next=%2Fcuenta" replace />;
  const user = auth.user;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await run(async () => {
      if (auth.profile) await renameProfile(user, name);
      else await createProfile(user, name);
      return true;
    }, 'Nombre guardado');
    setBusy(false);
    if (ok) setEditing(false);
  }

  async function signOut() {
    rememberLeague(null);
    // Primero se sale de la pantalla: sin sesión, esta página manda al login.
    navigate('/ligas', { replace: true });
    await logout();
  }

  // Cuenta creada en la consola de Firebase: se completa con el nombre.
  const needsProfile = !auth.profile;

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="size-6 text-accent" /> Configuración
        </h1>
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-4">
            <Avatar name={displayName(auth)} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xl font-bold tracking-tight">{displayName(auth)}</h2>
                {auth.isSuper && (
                  <Badge tone="accent">
                    <Crown className="size-3" /> Superadmin
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
            {!editing && !needsProfile && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Cambiar nombre"
                icon={<Pencil className="size-4" />}
                onClick={() => {
                  setName(displayName(auth));
                  setEditing(true);
                }}
              />
            )}
          </div>
          {(editing || needsProfile) && (
            <form onSubmit={saveName} className="flex items-end gap-2">
              <Field label={needsProfile ? 'Completa tu cuenta: ¿cómo te llamas?' : 'Tu nombre'} className="flex-1">
                <Input required maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" />
              </Field>
              <Button type="submit" variant="primary" loading={busy} icon={<Check className="size-4" />}>
                Guardar
              </Button>
            </form>
          )}
        </Card>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Mis ligas</h2>
          {memberships.loading || leagues.loading ? (
            <ListSkeleton rows={2} />
          ) : leagues.data.length === 0 ? (
            <Card className="p-4 text-sm text-muted">
              Todavía no estás en ninguna.{' '}
              <Link to="/" className="font-medium text-accent">
                Crear o unirme a una liga
              </Link>
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {leagues.data.map((l) => {
                const role = memberships.data.find((m) => m.leagueId === l.id)?.role;
                return (
                  <Link key={l.id} to={`/l/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                    <span className="flex-1 truncate font-medium">{l.name}</span>
                    {role && <Badge tone={role === 'member' ? 'neutral' : 'accent'}>{roleLabel(role)}</Badge>}
                    <ChevronRight className="size-4 text-muted" />
                  </Link>
                );
              })}
            </Card>
          )}
        </section>

        {auth.isSuper && (
          <Link to="/superadmin" className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 px-4 py-3 font-medium text-accent">
            <Crown className="size-5" />
            <span className="flex-1">Panel del superadmin</span>
            <ChevronRight className="size-4" />
          </Link>
        )}

        <Button className="self-center text-danger" variant="ghost" icon={<LogOut className="size-4" />} onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>
    </AppShell>
  );
}
