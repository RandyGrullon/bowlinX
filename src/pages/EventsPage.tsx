import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, ChevronRight, Plus, Trophy, Users } from 'lucide-react';
import { useEvents } from '../lib/data';
import { eventLabel, formatDateLong } from '../lib/format';
import type { EventType } from '../lib/types';
import { EventFormModal } from '../components/EventFormModal';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError } from '../components/ui';

export default function EventsPage({ type }: { type: EventType }) {
  const navigate = useNavigate();
  const { data, loading, error } = useEvents();
  const [creating, setCreating] = useState(false);
  const isTorneo = type === 'torneo';

  const byYear = useMemo(() => {
    const groups = new Map<string, typeof data>();
    for (const e of data.filter((e) => e.type === type)) {
      const y = e.date.slice(0, 4);
      groups.set(y, [...(groups.get(y) ?? []), e]);
    }
    return [...groups.entries()];
  }, [data, type]);

  const thisYear = String(new Date().getFullYear());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{isTorneo ? 'Torneos' : 'Prácticas'}</h1>
          <p className="text-sm text-muted">
            {isTorneo ? 'El torneo anual: equipos, handicap y clasificación.' : 'Los martes de práctica: pinos individuales.'}
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
          <span className="hidden sm:inline">{isTorneo ? 'Nuevo torneo' : 'Nueva práctica'}</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {error ? (
        <LoadError error={error} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : byYear.length === 0 ? (
        <Empty
          icon={isTorneo ? <Trophy className="size-8" /> : <CalendarDays className="size-8" />}
          title={isTorneo ? 'Todavía no hay torneos' : 'Todavía no hay prácticas'}
        >
          {isTorneo ? 'Crea el torneo del año para inscribir jugadores y armar equipos.' : 'Crea la práctica del martes para anotar los juegos.'}
        </Empty>
      ) : (
        byYear.map(([year, events]) => (
          <section key={year} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">{year}</h2>
            <Card className="stagger divide-y divide-line overflow-hidden">
              {events.map((e, i) => (
                <Link
                  key={e.id}
                  to={`/eventos/${e.id}`}
                  style={{ '--i': i } as CSSProperties}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    {isTorneo ? <Trophy className="size-5" /> : <CalendarDays className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{eventLabel(e)}</span>
                      {isTorneo && year === thisYear && e === events[0] && <Badge tone="accent">Actual</Badge>}
                    </div>
                    <div className="truncate text-xs text-muted first-letter:uppercase">
                      {formatDateLong(e.date)} · {e.games} juegos
                      {isTorneo && e.hcpPercent > 0 && ` · Hcp ${e.hcpPercent}% de ${e.hcpBase}`}
                    </div>
                  </div>
                  {!isTorneo && Object.keys(e.rsvp ?? {}).length > 0 && (
                    <Badge tone="ok">{Object.keys(e.rsvp ?? {}).length} van</Badge>
                  )}
                  <span className="flex items-center gap-1 text-sm text-muted tabular-nums">
                    <Users className="size-4" />
                    {e.playerCount ?? 0}
                  </span>
                  <ChevronRight className="size-4 text-muted" />
                </Link>
              ))}
            </Card>
          </section>
        ))
      )}

      <EventFormModal open={creating} onClose={() => setCreating(false)} type={type} onCreated={(id) => navigate(`/eventos/${id}`)} />
    </div>
  );
}
