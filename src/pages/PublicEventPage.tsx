import { useParams } from 'react-router';
import { CalendarDays, Trophy } from 'lucide-react';
import { useEvent, useEventEntries, usePlayers } from '../lib/data';
import { eventLabel, formatDateLong, typeLabel } from '../lib/format';
import { useFeedback } from '../components/feedback';
import { PublicShell } from '../components/PublicShell';
import { shareLink } from '../components/share';
import { StandingsTab } from '../components/event/StandingsTab';
import { Badge, Empty, LoadError, PageSkeleton } from '../components/ui';

/** Clasificación de un torneo o resultados de una práctica, en vivo y sin login (para verla en la bolera). */
export default function PublicEventPage() {
  const { eventId } = useParams();
  const { toast } = useFeedback();
  const event = useEvent(eventId);
  const entries = useEventEntries(eventId);
  const players = usePlayers();

  const error = event.error ?? entries.error ?? players.error;
  const ev = event.data;

  async function share() {
    if (ev && (await shareLink(location.href, `${eventLabel(ev)} · BowlinX`))) toast('Link copiado');
  }

  return (
    <PublicShell onShare={ev ? share : undefined}>
      {error ? (
        <LoadError error={error} />
      ) : event.loading || entries.loading || players.loading ? (
        <PageSkeleton />
      ) : !ev ? (
        <Empty title="Este evento no existe">Revisa el link que te compartieron.</Empty>
      ) : (
        <div className="animate-fade-up flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              {ev.type === 'torneo' ? <Trophy className="size-5" /> : <CalendarDays className="size-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight">{eventLabel(ev)}</h1>
                <Badge tone="accent">{typeLabel(ev.type)}</Badge>
                <Badge tone="ok">
                  <span className="live-dot" /> En vivo
                </Badge>
              </div>
              <p className="text-sm text-muted first-letter:uppercase">
                {formatDateLong(ev.date)} · {ev.games} juegos
              </p>
            </div>
          </div>
          <StandingsTab event={ev} entries={entries.data} players={players.data} readOnly />
        </div>
      )}
    </PublicShell>
  );
}
