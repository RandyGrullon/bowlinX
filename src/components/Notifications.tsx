import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CalendarDays, CheckCircle2, Globe, Inbox, Lock, Megaphone, Trophy, XCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeagueFeeds, useLeaguesByIds, useMyMemberships } from '../lib/data';
import { parseDate, toIsoDate } from '../lib/format';
import { buildNotices, relativeTime, type Notice, type NoticeKind } from '../lib/notifications';
import { Button, Empty, Modal, cx } from './ui';

interface NoticesState {
  items: Notice[];
  /** Avisos más nuevos que la última vez que se abrió la campana. */
  unread: number;
  /** Momento de la última vez que se abrieron (para marcar los nuevos). */
  seenAt: number;
  markAllRead: () => void;
}

const Ctx = createContext<NoticesState>({ items: [], unread: 0, seenAt: 0, markAllRead: () => undefined });

const seenKey = (uid: string) => `bowlingx:avisos-vistos:${uid}`;

function readSeen(uid: string | undefined): number {
  if (!uid) return 0;
  try {
    return Number(localStorage.getItem(seenKey(uid))) || 0;
  } catch {
    return 0;
  }
}

/** Avisos de todas las ligas de la cuenta (se calculan de lo que pasa en cada liga; no se guardan aparte). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberships = useMyMemberships(user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const today = useToday();
  // Desde ayer: el torneo de hoy y lo que viene.
  const since = useMemo(() => {
    const d = parseDate(today);
    d.setDate(d.getDate() - 1);
    return toIsoDate(d);
  }, [today]);
  const feeds = useLeagueFeeds(memberships.data, since);
  const [seenAt, setSeenAt] = useState(() => readSeen(user?.uid));
  useEffect(() => setSeenAt(readSeen(user?.uid)), [user?.uid]);

  const items = useMemo(() => buildNotices(feeds.data, leagues.data, today, Date.now()), [feeds.data, leagues.data, today]);
  const unread = items.filter((n) => n.time > seenAt).length;

  const markAllRead = useCallback(() => {
    if (!user) return;
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(seenKey(user.uid), String(now));
    } catch {
      // sin almacenamiento: se vuelven a ver como nuevos al recargar
    }
  }, [user]);

  const value = useMemo(() => ({ items: user ? items : [], unread: user ? unread : 0, seenAt, markAllRead }), [user, items, unread, seenAt, markAllRead]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);

/**
 * La fecha de hoy, que cambia a medianoche aunque la app siga abierta (y al volver a ella):
 * así el torneo del día pasa a "¡Hoy es…!" sin esperar a que cambie algo en la liga.
 */
function useToday() {
  const [today, setToday] = useState(() => toIsoDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toIsoDate(new Date()));
    const next = new Date();
    next.setHours(24, 0, 5, 0);
    const timer = setTimeout(refresh, next.getTime() - Date.now());
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [today]);
  return today;
}

const ICONS: Record<NoticeKind, { icon: ReactNode; tone: string }> = {
  torneo: { icon: <Megaphone className="size-5" />, tone: 'bg-accent-soft text-accent' },
  'torneo-hoy': { icon: <Trophy className="size-5" />, tone: 'bg-warn-soft text-warn' },
  practica: { icon: <CalendarDays className="size-5" />, tone: 'bg-accent-soft text-accent' },
  aprobado: { icon: <CheckCircle2 className="size-5" />, tone: 'bg-ok-soft text-ok' },
  rechazado: { icon: <XCircle className="size-5" />, tone: 'bg-danger-soft text-danger' },
  'por-aprobar': { icon: <Inbox className="size-5" />, tone: 'bg-warn-soft text-warn' },
};

/** Campana del encabezado: cuántos avisos nuevos hay y la lista al tocarla. */
export function NotificationsBell() {
  const { items, unread, seenAt, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Lo que era nuevo al abrir se sigue marcando mientras la lista está abierta.
  const [newSince, setNewSince] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  function show() {
    setNewSince(seenAt);
    setNow(Date.now());
    setOpen(true);
    markAllRead();
  }

  function go(n: Notice) {
    setOpen(false);
    navigate(n.to);
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={unread ? `Notificaciones: ${unread} nuevas` : 'Notificaciones'}
        title="Notificaciones"
        className="relative inline-flex size-9 items-center justify-center rounded-xl text-fg transition hover:bg-surface-2 active:scale-95"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-on-danger ring-2 ring-surface">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Notificaciones" footer={<Button onClick={() => setOpen(false)}>Cerrar</Button>}>
        {items.length === 0 ? (
          <Empty icon={<Bell className="size-8" />} title="No tienes avisos">
            Aquí te avisamos de torneos nuevos, prácticas de la semana y cuando aprueben tus juegos, con la liga de cada cosa.
          </Empty>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {items.map((n) => {
              const isNew = n.time > newSince;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => go(n)}
                    className={cx('flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-surface-2', isNew && 'bg-accent-soft/40')}
                  >
                    <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', ICONS[n.kind].tone)}>{ICONS[n.kind].icon}</span>
                    <span className="min-w-0 flex-1">
                      {/* La liga en su propia línea, completa (sin cortar el nombre). */}
                      <span className="flex items-start gap-1 text-xs font-semibold break-words text-fg">
                        {n.private ? <Lock className="mt-0.5 size-3 shrink-0 text-muted" /> : <Globe className="mt-0.5 size-3 shrink-0 text-muted" />}
                        <span className="min-w-0">{n.leagueName}</span>
                      </span>
                      <span className="block text-[11px] text-muted">
                        {n.leagueKind === 'torneo' ? (n.private ? 'Torneo privado' : 'Torneo público') : n.private ? 'Liga privada' : 'Liga pública'} ·{' '}
                        {relativeTime(n.time, now)}
                      </span>
                      <span className="mt-1 block font-semibold">{n.title}</span>
                      <span className="block text-sm text-muted">{n.body}</span>
                    </span>
                    {isNew && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Nuevo" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}
