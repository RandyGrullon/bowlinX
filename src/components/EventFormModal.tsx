import { useEffect, useState, type FormEvent } from 'react';
import { createEvent, updateEvent, type EventInput } from '../lib/data';
import { nextTuesday, toIsoDate } from '../lib/format';
import { DEFAULT_CUTS } from '../lib/stats';
import type { BowlingEvent, EventType, RankBy } from '../lib/types';
import { useAction } from './feedback';
import { Button, Field, Input, Modal, Select } from './ui';

const defaults = (type: EventType): EventInput => ({
  type,
  name: '',
  date: type === 'practica' ? nextTuesday() : toIsoDate(new Date()),
  games: 3,
  // Regla del torneo 2025: (230 − promedio) × 80%.
  hcpBase: type === 'torneo' ? 230 : 0,
  hcpPercent: type === 'torneo' ? 80 : 0,
  individualRankBy: 'hcp',
  teamRankBy: 'scratch',
  categoryCuts: DEFAULT_CUTS,
});

export function EventFormModal({
  open,
  onClose,
  type,
  event,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  type: EventType;
  /** Si viene, se edita; si no, se crea. */
  event?: BowlingEvent;
  onCreated?: (id: string) => void;
}) {
  const run = useAction();
  const [form, setForm] = useState<EventInput>(defaults(type));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      event
        ? {
            type: event.type,
            name: event.name,
            date: event.date,
            games: event.games,
            hcpBase: event.hcpBase,
            hcpPercent: event.hcpPercent,
            individualRankBy: event.individualRankBy ?? 'hcp',
            teamRankBy: event.teamRankBy ?? 'scratch',
            categoryCuts: event.categoryCuts ?? DEFAULT_CUTS,
          }
        : defaults(type),
    );
  }, [open, event, type]);

  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isTorneo = form.type === 'torneo';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const data: EventInput = {
      ...form,
      name: form.name.trim(),
      games: Math.min(10, Math.max(1, Math.round(form.games) || 1)),
      hcpBase: Math.max(0, Math.round(form.hcpBase) || 0),
      hcpPercent: Math.min(100, Math.max(0, Math.round(form.hcpPercent) || 0)),
    };
    if (event) {
      await run(() => updateEvent(event.id, data), 'Cambios guardados');
      onClose();
    } else {
      const id = await run(() => createEvent(data), isTorneo ? 'Torneo creado' : 'Práctica creada');
      onClose();
      if (id) onCreated?.(id);
    }
    setBusy(false);
  }

  const title = event ? 'Configurar' : isTorneo ? 'Nuevo torneo' : 'Nueva práctica';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" form="event-form" loading={busy}>
            {event ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Field label="Nombre" className="col-span-2" hint={!form.name ? 'Si lo dejas vacío se usa la fecha.' : undefined}>
          <Input
            value={form.name}
            placeholder={isTorneo ? `Torneo ${form.date.slice(0, 4)}` : 'Práctica del martes'}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Fecha">
          <Input type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Juegos por jugador">
          <Input type="number" inputMode="numeric" min={1} max={10} required value={form.games} onChange={(e) => set('games', +e.target.value)} />
        </Field>
        {isTorneo && (
          <>
            <Field label="Base del handicap" hint="2025: 230">
              <Input type="number" inputMode="numeric" min={0} max={300} value={form.hcpBase} onChange={(e) => set('hcpBase', +e.target.value)} />
            </Field>
            <Field label="Porcentaje" hint="2025: 80. 0 = sin handicap">
              <Input type="number" inputMode="numeric" min={0} max={100} value={form.hcpPercent} onChange={(e) => set('hcpPercent', +e.target.value)} />
            </Field>
            <p className="col-span-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              Handicap por juego = ({form.hcpBase || 0} − promedio) × {form.hcpPercent || 0}%. Ej.: promedio 165 →{' '}
              <b className="text-fg">{Math.max(0, Math.floor((((form.hcpBase || 0) - 165) * (form.hcpPercent || 0)) / 100))}</b> pinos.
            </p>
            <Field label="Individual se clasifica">
              <Select value={form.individualRankBy} onChange={(e) => set('individualRankBy', e.target.value as RankBy)}>
                <option value="hcp">Con handicap</option>
                <option value="scratch">Scratch (solo pinos)</option>
              </Select>
            </Field>
            <Field label="Equipos se clasifican">
              <Select value={form.teamRankBy} onChange={(e) => set('teamRankBy', e.target.value as RankBy)}>
                <option value="scratch">Scratch (solo pinos)</option>
                <option value="hcp">Con handicap</option>
              </Select>
            </Field>
            <fieldset className="col-span-2 flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-muted">Categorías por promedio (D es lo de abajo)</legend>
              <div className="grid grid-cols-3 gap-2">
                {(['A', 'B', 'C'] as const).map((letter, i) => (
                  <label key={letter} className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold text-accent">{letter}</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={300}
                      aria-label={`Categoría ${letter} desde`}
                      value={form.categoryCuts[i]}
                      onChange={(e) =>
                        set('categoryCuts', form.categoryCuts.map((c, j) => (j === i ? +e.target.value : c)) as [number, number, number])
                      }
                    />
                  </label>
                ))}
              </div>
              <span className="text-xs text-muted">Promedio mínimo de cada una. Se usan al armar equipos: uno de cada categoría cuando se puede.</span>
            </fieldset>
          </>
        )}
      </form>
    </Modal>
  );
}
