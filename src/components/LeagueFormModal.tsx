import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Camera, Globe, Lock } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { createLeague, createTournament, type LeagueInput } from '../lib/data';
import { toIsoDate } from '../lib/format';
import type { League, LeagueKind, Visibility } from '../lib/types';
import { useAction } from './feedback';
import { Button, Field, Input, Modal, cx } from './ui';

const empty = (contactName: string, kind: LeagueKind): LeagueInput => {
  const y = new Date().getFullYear();
  return {
    name: '',
    kind,
    visibility: kind === 'torneo' ? 'public' : 'private',
    venue: '',
    schedule: '',
    seasonStart: `${y}-01-01`,
    seasonEnd: `${y}-12-31`,
    contactName,
    contactPhone: '',
    requirePhoto: true,
  };
};

export const leagueInput = (l: League): LeagueInput => ({
  name: l.name,
  kind: l.kind ?? 'liga',
  visibility: l.visibility,
  venue: l.venue ?? '',
  schedule: l.schedule ?? '',
  seasonStart: l.seasonStart ?? '',
  seasonEnd: l.seasonEnd ?? '',
  contactName: l.contactName ?? '',
  contactPhone: l.contactPhone ?? '',
  requirePhoto: l.requirePhoto ?? true,
});

/** Formulario de la liga (o del torneo sin liga): crear (queda como dueño) o editar sus datos. */
export function LeagueForm({
  id,
  initial,
  onSubmit,
  withDate,
}: {
  id: string;
  initial: LeagueInput;
  onSubmit: (data: LeagueInput, date: string) => void;
  /** Torneo nuevo: pide la fecha del torneo. */
  withDate?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  useEffect(() => setForm(initial), [initial]);
  const isTournament = form.kind === 'torneo';
  const set = <K extends keyof LeagueInput>(k: K, v: LeagueInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      name: form.name.trim(),
      venue: form.venue.trim(),
      schedule: form.schedule.trim(),
      contactName: form.contactName.trim(),
      contactPhone: form.contactPhone.replace(/[^\d+]/g, ''),
    }, date);
  }

  return (
    <form id={id} onSubmit={submit} className="grid grid-cols-2 gap-4">
      <Field label={isTournament ? 'Nombre del torneo' : 'Nombre de la liga'} className={withDate ? '' : 'col-span-2'}>
        <Input
          required
          maxLength={60}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder={isTournament ? 'Copa de verano' : 'Liga de los martes'}
        />
      </Field>
      {withDate && (
        <Field label="Fecha del torneo">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <fieldset className="col-span-2 grid grid-cols-2 gap-2">
        <legend className="mb-1.5 text-xs font-medium text-muted">¿Quién puede {isTournament ? 'verlo' : 'verla'}?</legend>
        <Choice
          active={form.visibility === 'private'}
          onClick={() => set('visibility', 'private' as Visibility)}
          icon={<Lock className="size-4" />}
          title="Privada"
          text="Solo con invitación (link, QR o código)."
        />
        <Choice
          active={form.visibility === 'public'}
          onClick={() => set('visibility', 'public' as Visibility)}
          icon={<Globe className="size-4" />}
          title="Pública"
          text={isTournament ? 'Cualquiera lo ve y se une.' : 'Cualquiera la ve y se une.'}
        />
      </fieldset>
      <Field label="Bolera" className="col-span-2">
        <Input maxLength={80} value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Dónde juegan" />
      </Field>
      {!isTournament && (
        <>
          <Field label="Cuándo juegan" className="col-span-2">
            <Input maxLength={80} value={form.schedule} onChange={(e) => set('schedule', e.target.value)} placeholder="Martes 7:00 pm" />
          </Field>
          <Field label="Temporada desde">
            <Input type="date" value={form.seasonStart} onChange={(e) => set('seasonStart', e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="date" min={form.seasonStart || undefined} value={form.seasonEnd} onChange={(e) => set('seasonEnd', e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Contacto para torneos">
        <Input maxLength={60} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="Nombre" />
      </Field>
      <Field label="WhatsApp">
        <Input type="tel" inputMode="tel" maxLength={20} value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="809 555 0000" />
      </Field>
      <label className="col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--accent)]"
          checked={form.requirePhoto}
          onChange={(e) => set('requirePhoto', e.target.checked)}
        />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Camera className="size-4 text-accent" /> Exigir foto del marcador
          </span>
          <span className="text-muted">
            {form.requirePhoto
              ? 'Un juego cuenta en promedios y clasificaciones solo cuando se verifica con la foto.'
              : 'Los juegos que anota un admin cuentan de una; los que suben los jugadores igual se aprueban.'}
          </span>
        </span>
      </label>
    </form>
  );
}

function Choice({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition',
        active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
      )}
    >
      <span className={cx('flex items-center gap-1.5 font-semibold', active && 'text-accent')}>
        {icon} {title}
      </span>
      <span className="text-xs text-muted">{text}</span>
    </button>
  );
}

/** Crear una liga o un torneo sin liga. Devuelve a dónde ir después. */
export function LeagueFormModal({
  open,
  onClose,
  kind,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind: LeagueKind;
  /** Ruta de la liga o del torneo recién creado. */
  onSaved?: (to: string) => void;
}) {
  const auth = useAuth();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState<LeagueInput>(() => empty(displayName(auth), kind));
  useEffect(() => {
    if (open) setInitial(empty(displayName(auth), kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);
  const isTournament = kind === 'torneo';

  async function save(data: LeagueInput, date: string) {
    if (!auth.user) return;
    const owner = { uid: auth.user.uid, name: displayName(auth) };
    setBusy(true);
    const to = isTournament
      ? await run(async () => {
          const { lid, eid } = await createTournament(owner, data, date);
          return `/l/${lid}/e/${eid}?tab=inscritos`;
        }, 'Torneo creado')
      : await run(async () => `/l/${await createLeague(owner, data)}/admin?tab=liga`, 'Liga creada');
    setBusy(false);
    if (to) {
      onClose();
      onSaved?.(to);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isTournament ? 'Nuevo torneo (sin liga)' : 'Nueva liga'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="league-form" loading={busy}>
            {isTournament ? 'Crear torneo' : 'Crear liga'}
          </Button>
        </>
      }
    >
      {isTournament && (
        <p className="mb-4 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
          Un torneo suelto, con sus propios jugadores, equipos y clasificación. Si es de tu liga, créalo mejor dentro de la liga (Eventos → Nuevo).
        </p>
      )}
      <LeagueForm id="league-form" initial={initial} onSubmit={save} withDate={isTournament} />
    </Modal>
  );
}
