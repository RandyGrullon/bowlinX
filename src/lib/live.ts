import { toIsoDate } from './format';
import { formatTime, parseSchedule } from './schedule';
import type { LeagueFeed } from './data';
import type { BowlingEvent, League } from './types';

/** Minutos antes de la hora de la liga en que el evento ya sale como "en juego". */
export const LIVE_EARLY_MIN = 30;

export interface LiveInfo {
  /** Hoy es el día del evento y ya es la hora (o casi). */
  live: boolean;
  /** "7:30 pm" si la liga tiene hora; null si no (entonces está en juego todo el día). */
  startLabel: string | null;
  /** Todavía no llega la hora de empezar (pero ya está dentro de los 30 minutos antes). */
  startsSoon: boolean;
}

/**
 * ¿El evento está en juego ahora? El día del evento, desde 30 minutos antes de la hora de la liga
 * (la que se eligió en "Cuándo juegan") hasta la medianoche. Sin hora, o si el evento cae en otro día
 * que los de la liga (p. ej. un torneo el sábado), todo ese día.
 */
export function liveInfo(event: Pick<BowlingEvent, 'date'>, league: Pick<League, 'schedule'>, now: Date): LiveInfo {
  if (event.date !== toIsoDate(now)) return { live: false, startLabel: null, startsSoon: false };
  const { days, time } = parseSchedule(league.schedule ?? '');
  const weekday = (now.getDay() + 6) % 7; // 0 = lunes, como WEEKDAYS
  if (!time || (days.length > 0 && !days.includes(weekday))) return { live: true, startLabel: null, startsSoon: false };
  const [h, m] = time.split(':').map(Number);
  const start = h * 60 + m;
  const current = now.getHours() * 60 + now.getMinutes();
  return { live: current >= start - LIVE_EARLY_MIN, startLabel: formatTime(time), startsSoon: current < start };
}

export interface LiveGame {
  feed: LeagueFeed;
  league: League;
  event: BowlingEvent;
  info: LiveInfo;
}

/** Eventos en juego ahora en las ligas de la cuenta (los que empiezan antes, primero). */
export function liveGames(feeds: LeagueFeed[], leagues: League[], now: Date): LiveGame[] {
  const out: LiveGame[] = [];
  for (const feed of feeds) {
    const league = leagues.find((l) => l.id === feed.lid);
    if (!league) continue;
    for (const event of feed.events) {
      const info = liveInfo(event, league, now);
      if (info.live) out.push({ feed, league, event, info });
    }
  }
  return out.sort((a, b) => Number(a.info.startsSoon) - Number(b.info.startsSoon) || a.league.name.localeCompare(b.league.name));
}
