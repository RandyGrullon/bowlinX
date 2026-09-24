import { useEffect, useMemo, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { applyTeams } from '../../lib/data';
import { balancedTeams, category } from '../../lib/stats';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { useAction } from '../feedback';
import { Badge, Button, Card, Field, Input, Modal } from '../ui';
import { CategoryBadge } from './CategoryBadge';

/**
 * Arma equipos parejos por promedio (reparto en serpiente), como se hizo a mano en el torneo 2025.
 * Muestra la propuesta antes de aplicarla; reutiliza los nombres de los equipos que ya existan.
 */
export function AutoTeamsModal({
  open,
  onClose,
  event,
  entries,
  players,
}: {
  open: boolean;
  onClose: () => void;
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
}) {
  const run = useAction();
  const [size, setSize] = useState(3);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSize(3);
  }, [open]);

  const nameOf = (e: Entry) => players.find((p) => p.id === e.playerId)?.name ?? '(jugador borrado)';
  const existing = Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order);
  const count = Math.max(1, Math.ceil(entries.length / Math.max(1, size)));

  const proposal = useMemo(
    () =>
      balancedTeams(entries, count, (e) => e.average || 0, (e) => category(e.average, event.categoryCuts)).map((members, i) => ({
        teamId: existing[i]?.[0] ?? null,
        name: existing[i]?.[1].name ?? `Equipo ${i + 1}`,
        members,
        sum: members.reduce((a, m) => a + (m.average || 0), 0),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, count, event.teams],
  );
  const spread = proposal.length > 1 ? Math.max(...proposal.map((t) => t.sum)) - Math.min(...proposal.map((t) => t.sum)) : 0;
  const removed = existing.length - Math.min(existing.length, count);

  async function apply() {
    setBusy(true);
    const ok = await run(async () => {
      await applyTeams(event, proposal.map((t) => ({ teamId: t.teamId, name: t.name, entryIds: t.members.map((m) => m.id) })));
      return true;
    }, `${proposal.length} equipos armados`);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Shuffle className="size-5 text-accent" /> Armar equipos parejos
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={entries.length < 2} onClick={apply}>
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Jugadores por equipo" className="w-40">
            <Input type="number" inputMode="numeric" min={1} max={10} value={size} onChange={(e) => setSize(Math.min(10, Math.max(1, +e.target.value || 1)))} />
          </Field>
          <p className="flex-1 text-sm text-muted">
            {entries.length} inscritos → <b className="text-fg">{count} equipos</b>. Cada equipo lleva categorías distintas cuando se puede y sumas de promedio parejas; diferencia
            entre equipos: <b className="text-fg tabular-nums">{spread}</b> pinos de promedio.
          </p>
        </div>
        {removed > 0 && <Badge tone="warn">Se borran {removed} equipo(s) que sobran.</Badge>}
        <div className="stagger grid gap-3 sm:grid-cols-2">
          {proposal.map((t, i) => (
            <Card key={i} className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{t.name}</span>
                <span className="text-xs text-muted tabular-nums">Σ {t.sum}</span>
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {t.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <CategoryBadge value={category(m.average, event.categoryCuts)} />
                    <span className="flex-1 truncate">{nameOf(m)}</span>
                    <span className="text-muted tabular-nums">{m.average}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted">Después puedes mover jugadores a mano en cada equipo.</p>
      </div>
    </Modal>
  );
}
