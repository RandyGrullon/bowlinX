import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, CalendarDays, ClipboardList, FileSpreadsheet, ListOrdered, Settings, Share2, Shield, Trash2, Trophy, Users } from 'lucide-react';
import { deleteEvent, useEvent, useEventEntries, usePlayers } from '../lib/data';
import { eventLabel, formatDateLong, typeLabel } from '../lib/format';
import { EventFormModal } from '../components/EventFormModal';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Empty, ListSkeleton, LoadError, PageSkeleton, Tabs } from '../components/ui';
import { shareLink } from '../components/share';
import { GamesTab } from '../components/event/GamesTab';
import { RosterTab } from '../components/event/RosterTab';
import { StandingsTab } from '../components/event/StandingsTab';
import { TeamsTab } from '../components/event/TeamsTab';

type TabKey = 'inscritos' | 'equipos' | 'juegos' | 'clasificacion';

export default function EventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const run = useAction();
  const { confirm, toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const event = useEvent(eventId);
  const entries = useEventEntries(eventId);
  const players = usePlayers();

  const loadError = event.error ?? entries.error ?? players.error;
  if (loadError) return <LoadError error={loadError} />;
  if (event.loading) return <PageSkeleton />;
  if (!event.data) {
    return (
      <Empty title="Este evento no existe">
        <Link to="/torneos" className="text-accent">
          Volver
        </Link>
      </Empty>
    );
  }

  const ev = event.data;
  const isTorneo = ev.type === 'torneo';
  const tabs: { key: TabKey; label: string; icon: ReactNode }[] = isTorneo
    ? [
        { key: 'inscritos', label: 'Inscritos', icon: <Users className="size-4" /> },
        { key: 'equipos', label: 'Equipos', icon: <Shield className="size-4" /> },
        { key: 'juegos', label: 'Juegos', icon: <ClipboardList className="size-4" /> },
        { key: 'clasificacion', label: 'Clasificación', icon: <ListOrdered className="size-4" /> },
      ]
    : [
        { key: 'juegos', label: 'Juegos', icon: <ClipboardList className="size-4" /> },
        { key: 'clasificacion', label: 'Resultados', icon: <ListOrdered className="size-4" /> },
      ];
  const requested = params.get('tab') as TabKey | null;
  const tab = tabs.some((t) => t.key === requested) ? requested! : tabs[0].key;
  const back = isTorneo ? '/torneos' : '/practicas';

  async function remove() {
    const ok = await confirm({
      title: `¿Eliminar ${eventLabel(ev)}?`,
      message: 'Se borran sus inscritos, equipos, juegos, fotos y envíos pendientes. No se puede deshacer.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    setEditing(false);
    navigate(back);
    await run(() => deleteEvent(ev.id), 'Evento eliminado');
  }

  const props = { event: ev, entries: entries.data, players: players.data };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <Link to={back} className="mt-1 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Volver">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{eventLabel(ev)}</h1>
            <Badge tone="accent">
              {isTorneo ? <Trophy className="size-3" /> : <CalendarDays className="size-3" />}
              {typeLabel(ev.type)}
            </Badge>
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(ev.date)} · {ev.games} juegos
            {isTorneo && (ev.hcpPercent > 0 ? ` · Hcp ${ev.hcpPercent}% de ${ev.hcpBase}` : ' · Sin handicap')}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            if (await shareLink(`${location.origin}/e/${ev.id}`, `${eventLabel(ev)} · BowlinX`)) toast('Link de la clasificación copiado');
          }}
          aria-label="Compartir clasificación"
          title="Compartir clasificación pública"
          icon={<Share2 className="size-5" />}
        />
        <Button
          variant="ghost"
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            await run(async () => {
              const { exportEventToExcel } = await import('../lib/exportExcel');
              await exportEventToExcel(ev, entries.data, players.data);
              return true;
            }, 'Excel descargado');
            setExporting(false);
          }}
          aria-label="Exportar a Excel"
          title="Exportar a Excel"
          icon={<FileSpreadsheet className="size-5" />}
        />
        <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Configurar" title="Configurar" icon={<Settings className="size-5" />} />
      </div>

      <Tabs items={tabs} active={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />

      {entries.loading || players.loading ? (
        <ListSkeleton rows={6} />
      ) : (
        // key = pestaña: el contenido entra con una transición al cambiar
        <div key={tab} className="animate-fade-up">
          {tab === 'inscritos' ? (
            <RosterTab {...props} />
          ) : tab === 'equipos' ? (
            <TeamsTab {...props} />
          ) : tab === 'juegos' ? (
            <GamesTab {...props} />
          ) : (
            <StandingsTab {...props} />
          )}
        </div>
      )}

      <EventFormModal open={editing} onClose={() => setEditing(false)} type={ev.type} event={ev} />
      <div className="flex justify-center pt-4">
        <Button variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={remove}>
          Eliminar {isTorneo ? 'torneo' : 'práctica'}
        </Button>
      </div>
    </div>
  );
}
