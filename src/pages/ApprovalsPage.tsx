import { useEffect, useMemo, useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import { approveSubmission, fetchEffectiveAverages, practiceForDate, rejectSubmission, useAllEntries, useEvents, usePhoto, usePlayers, useSubmissions } from '../lib/data';
import { eventTitle, formatDate } from '../lib/format';
import { firstFreeSlot, isValidScore, slots } from '../lib/stats';
import type { BowlingEvent, Entry, Player, Submission } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { PhotoView } from '../components/PhotoModal';
import { Avatar } from './PlayersPage';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Select, Skeleton, cx } from '../components/ui';

export default function ApprovalsPage() {
  const subs = useSubmissions('pendiente');
  const events = useEvents();
  const players = usePlayers();
  const entries = useAllEntries();

  const sorted = useMemo(
    () => [...subs.data].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)),
    [subs.data],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Aprobar juegos</h1>
        <p className="text-sm text-muted">Juegos que los jugadores subieron desde su página con foto. Al aprobarlos cuentan en sus estadísticas.</p>
      </div>
      {subs.error ? (
        <LoadError error={subs.error} />
      ) : subs.loading || events.loading || players.loading ? (
        <ListSkeleton rows={3} />
      ) : sorted.length === 0 ? (
        <Empty icon={<Inbox className="size-8" />} title="Nada pendiente">
          Cuando un jugador suba juegos desde su página aparecerán aquí.
        </Empty>
      ) : (
        sorted.map((s) => {
          // Envío por fecha: va a la práctica de ese día si ya existe (si no, se crea al aprobar).
          const event = s.eventId
            ? events.data.find((e) => e.id === s.eventId)
            : events.data.find((e) => e.type === 'practica' && e.date === s.date);
          return (
            <SubmissionCard
              key={s.id}
              sub={s}
              event={event}
              events={events.data}
              player={players.data.find((p) => p.id === s.playerId)}
              entry={event ? entries.data.find((e) => e.eventId === event.id && e.playerId === s.playerId) ?? null : null}
            />
          );
        })
      )}
    </div>
  );
}

function SubmissionCard({
  sub,
  event,
  events,
  player,
  entry,
}: {
  sub: Submission;
  event?: BowlingEvent;
  events: BowlingEvent[];
  player?: Player;
  entry: Entry | null;
}) {
  const run = useAction();
  const { toast } = useFeedback();
  const photo = usePhoto(sub.photoId);
  const [values, setValues] = useState<string[]>([]);
  const [start, setStart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // Juegos por posición (J1, J2...); se propone lo leído por la IA y, si no hay, lo anotado.
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  const count = Math.max(typed.length, scanned.length);
  const rows = Array.from({ length: count }, (_, i) => ({ typed: typed[i] ?? null, scanned: scanned[i] ?? null }));
  // Juegos del evento destino (una práctica nueva por fecha tiene al menos 3, o los que subió).
  const games = event?.games ?? Math.max(3, count);

  useEffect(() => {
    setValues(rows.map((r) => String(r.scanned ?? r.typed ?? '')));
    setStart(firstFreeSlot(entry, games, rows.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id, event?.id]);

  if ((!event && !sub.date) || !player) {
    return (
      <Card className="flex items-center justify-between px-4 py-3 text-sm text-muted">
        Envío de un jugador o evento que ya no existe.
        <Button size="sm" onClick={() => run(() => rejectSubmission(sub, 'Evento o jugador eliminado'))}>
          Descartar
        </Button>
      </Card>
    );
  }

  const verified = slots(entry?.photos, games, null);
  const invalid = values.some((v) => v.trim() !== '' && !isValidScore(Number(v)));
  const toSave = values.filter((v, k) => v.trim() !== '' && start + k < games).length;

  async function approve() {
    if (!player) return;
    setBusy(true);
    const map: Record<number, number> = {};
    values.forEach((v, k) => {
      if (v.trim() !== '' && start + k < games) map[start + k] = Number(v);
    });
    const ok = await run(async () => {
      const target = event ?? (await practiceForDate(events, sub.date!, count));
      const average = entry ? entry.average : ((await fetchEffectiveAverages([player])).get(player.id) ?? 0);
      await approveSubmission(sub, target, entry, average, map);
      return true;
    });
    setBusy(false);
    if (ok) toast(`Aprobado: ${toSave} ${toSave === 1 ? 'juego' : 'juegos'} de ${player.name}`);
  }

  async function reject() {
    setRejecting(false);
    await run(() => rejectSubmission(sub, note.trim() || null), 'Envío rechazado');
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar name={player.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{player.name}</div>
          <div className="truncate text-xs text-muted">
            {event ? eventTitle(event) : `Práctica ${formatDate(sub.date!)} · se crea al aprobar`}
          </div>
        </div>
        {sub.createdAt && <span className="hidden text-xs text-muted sm:block">{new Date(sub.createdAt.toMillis()).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</span>}
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {photo.data ? <PhotoView src={photo.data.data} /> : <Skeleton className="h-48 w-full rounded-xl" />}
        <div className="flex flex-col gap-3">
          {sub.scanned == null && <Badge tone="warn">La IA no pudo leer la foto: revísala tú</Badge>}
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Juego</th>
                <th className="py-1 text-right font-medium">Anotó</th>
                <th className="py-1 text-right font-medium">Leyó la IA</th>
                <th className="py-1 text-right font-medium">Se guarda</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => {
                const slot = start + k;
                const mismatch = r.typed != null && r.scanned != null && r.typed !== r.scanned;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5">
                      {slot < games ? `J${slot + 1}` : <span className="text-danger">fuera</span>}
                      {slot < games && verified[slot] && <span className="ml-1 text-[10px] text-muted">(reemplaza)</span>}
                    </td>
                    <td className={cx('py-1.5 text-right tabular-nums', mismatch && 'text-warn')}>{r.typed ?? '—'}</td>
                    <td className={cx('py-1.5 text-right tabular-nums', mismatch && 'text-warn')}>{r.scanned ?? '—'}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={values[k] ?? ''}
                        onChange={(e) => setValues((vs) => vs.map((x, j) => (j === k ? e.target.value : x)))}
                        aria-label={`Juego ${slot + 1}`}
                        className="h-9 w-16 rounded-lg border border-line bg-surface text-center font-semibold tabular-nums"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Field label="Guardar desde el juego">
            <Select value={start} onChange={(e) => setStart(+e.target.value)}>
              {Array.from({ length: games }, (_, i) => (
                <option key={i} value={i}>
                  Juego {i + 1}
                </option>
              ))}
            </Select>
          </Field>
          {!entry && <p className="text-xs text-muted">{player.name} no estaba en este evento: se inscribe al aprobar.</p>}
          <div className="mt-auto flex gap-2">
            <Button className="flex-1" icon={<X className="size-4" />} onClick={() => setRejecting(true)}>
              Rechazar
            </Button>
            <Button className="flex-1" variant="primary" icon={<Check className="size-4" />} loading={busy} disabled={invalid || !toSave} onClick={approve}>
              Aprobar {toSave || ''}
            </Button>
          </div>
        </div>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Rechazar envío"
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Cancelar</Button>
            <Button variant="danger" onClick={reject}>
              Rechazar
            </Button>
          </>
        }
      >
        <Field label="Motivo (lo verá el jugador)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. la foto no se lee" />
        </Field>
      </Modal>
    </Card>
  );
}
