import { eventLabel, formatDate, formatDateLong, parseDate } from './format';
import type { LeagueFeed } from './data';
import type { League } from './types';

export type NoticeKind = 'torneo' | 'torneo-hoy' | 'practica' | 'aprobado' | 'rechazado' | 'por-aprobar';

/** Un aviso de la campana: qué pasó, en qué liga y a dónde lleva. */
export interface Notice {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  lid: string;
  leagueName: string;
  /** Liga o torneo sin liga. */
  leagueKind: 'liga' | 'torneo';
  private: boolean;
  to: string;
  /** Milisegundos: para ordenar y saber si es nuevo. */
  time: number;
}

const DAY = 86400_000;
const ms = (t: { toMillis(): number } | null | undefined, fallback: number) => (t && typeof t.toMillis === 'function' ? t.toMillis() : fallback);

/**
 * Arma los avisos a partir de lo que pasa en las ligas de la cuenta.
 * `today` es 'YYYY-MM-DD' y `now` en milisegundos (se pasan para poder probarlo).
 */
export function buildNotices(feeds: LeagueFeed[], leagues: League[], today: string, now: number): Notice[] {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const out: Notice[] = [];
  const startOfToday = parseDate(today).getTime();
  const weekAhead = new Date(startOfToday + 7 * DAY);
  const inAWeek = `${weekAhead.getFullYear()}-${String(weekAhead.getMonth() + 1).padStart(2, '0')}-${String(weekAhead.getDate()).padStart(2, '0')}`;

  for (const feed of feeds) {
    const league = byId.get(feed.lid);
    if (!league) continue;
    const base = {
      lid: feed.lid,
      leagueName: league.name,
      leagueKind: (league.kind ?? 'liga') as 'liga' | 'torneo',
      private: league.visibility === 'private',
    };
    const eventsById = new Map(feed.events.map((e) => [e.id, e]));

    for (const e of feed.events) {
      if (e.date < today) continue;
      const created = ms(e.createdAt, now);
      if (e.type === 'torneo') {
        const isToday = e.date === today;
        const extra = e.announcement?.trim();
        out.push({
          ...base,
          id: `torneo:${feed.lid}:${e.id}`,
          kind: isToday ? 'torneo-hoy' : 'torneo',
          title: isToday ? `¡Hoy es ${eventLabel(e)}!` : `Nuevo torneo: ${eventLabel(e)}`,
          body: [formatDateLong(e.date), extra && (extra.length > 90 ? `${extra.slice(0, 90)}…` : extra)].filter(Boolean).join(' · '),
          to: `/l/${feed.lid}/e/${e.id}`,
          // El del día sube arriba ese día aunque se haya anunciado antes.
          time: isToday ? Math.max(created, startOfToday) : created,
        });
      } else if (e.date <= inAWeek) {
        const count = Object.keys(e.rsvp ?? {}).length;
        const going = !!(feed.playerId && e.rsvp?.[feed.playerId]);
        out.push({
          ...base,
          id: `practica:${feed.lid}:${e.id}`,
          kind: 'practica',
          title: `Práctica ${e.date === today ? 'hoy' : formatDateLong(e.date)}`,
          body: `${going ? 'Vas ✓' : feed.playerId ? '¿Vas? Confírmalo en la liga' : 'Mira si puedes ir'} · ${count} ${count === 1 ? 'confirmado' : 'confirmados'}`,
          to: `/l/${feed.lid}`,
          time: created,
        });
      }
    }

    // Lo que un admin aprobó o rechazó de lo que subiste (último mes).
    for (const s of feed.mySubs) {
      if (s.status === 'pendiente') continue;
      const reviewed = ms(s.reviewedAt, 0);
      if (!reviewed || now - reviewed > 30 * DAY) continue;
      const ev = s.eventId ? eventsById.get(s.eventId) : undefined;
      const games = (s.scores ?? []).filter((g) => g != null).join(' · ');
      const where = ev ? eventLabel(ev) : s.date ? `Práctica ${formatDate(s.date)}` : '';
      const approved = s.status === 'aprobado';
      out.push({
        ...base,
        id: `envio:${feed.lid}:${s.id}`,
        kind: approved ? 'aprobado' : 'rechazado',
        title: approved ? 'Aprobaron tus juegos' : 'Rechazaron tus juegos',
        body: [games, where, !approved && s.note ? `Motivo: ${s.note}` : ''].filter(Boolean).join(' · '),
        to: approved && s.eventId ? `/l/${feed.lid}/e/${s.eventId}` : `/l/${feed.lid}/perfil`,
        time: reviewed,
      });
    }

    // Admin: lo que falta por aprobar en su liga (un solo aviso por liga).
    if (feed.isAdmin && feed.pending.length) {
      const n = feed.pending.length;
      out.push({
        ...base,
        id: `pendientes:${feed.lid}`,
        kind: 'por-aprobar',
        title: `${n} ${n === 1 ? 'envío' : 'envíos'} por aprobar`,
        body: 'Juegos que subieron los jugadores esperan tu revisión.',
        to: `/l/${feed.lid}/admin?tab=aprobar`,
        time: Math.max(...feed.pending.map((s) => ms(s.createdAt, now))),
      });
    }
  }

  return out.sort((a, b) => b.time - a.time).slice(0, 40);
}

/** Medianoche local del día de `t` (para contar días de calendario, no bloques de 24 h). */
const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** "ahora", "hace 5 min", "hace 3 h", "ayer", "hace 4 días" o la fecha. */
export function relativeTime(time: number, now: number): string {
  const diff = Math.max(0, now - time);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  // Días de calendario: lo de anteanoche a las 11 no es "ayer" aunque hayan pasado menos de 48 h.
  const d = Math.round((midnight(now) - midnight(time)) / DAY);
  if (d <= 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(time).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}
