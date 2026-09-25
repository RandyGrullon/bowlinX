import { describe, expect, it } from 'vitest';
import type { LeagueFeed } from './data';
import { formatDate } from './format';
import { buildNotices, relativeTime } from './notifications';
import type { BowlingEvent, League, Submission } from './types';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const today = '2026-09-25';
const now = new Date(2026, 8, 25, 12).getTime();
const at = (t: number) => ({ toMillis: () => t });

const league = (id: string, extra: Partial<League> = {}): League => ({
  id,
  name: id === 'l1' ? 'Liga Norte' : 'Copa Verano',
  visibility: 'private',
  ownerUid: 'o',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  ...extra,
});

const event = (id: string, type: BowlingEvent['type'], date: string, extra: Partial<BowlingEvent> = {}): BowlingEvent => ({
  id,
  type,
  name: type === 'torneo' ? `Torneo ${id}` : '',
  date,
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: {},
  playerCount: 0,
  ...extra,
});

const sub = (id: string, status: Submission['status'], extra: Partial<Submission> = {}): Submission => ({
  id,
  playerId: 'p1',
  eventId: 'e1',
  scores: [180, 200],
  scanned: null,
  photoId: null,
  status,
  note: null,
  ...extra,
});

const feed = (extra: Partial<LeagueFeed>): LeagueFeed => ({ lid: 'l1', playerId: 'p1', isAdmin: false, isScorer: false, events: [], mySubs: [], pending: [], ...extra });

describe('avisos', () => {
  it('dice de qué liga es cada aviso y si es privada o torneo sin liga', () => {
    const notices = buildNotices(
      [
        feed({ events: [event('t1', 'torneo', '2026-10-10', { createdAt: at(now - HOUR) })] }),
        feed({ lid: 'l2', events: [event('t2', 'torneo', '2026-10-20', { createdAt: at(now - 2 * HOUR) })] }),
      ],
      [league('l1'), league('l2', { kind: 'torneo', visibility: 'public' })],
      today,
      now,
    );
    expect(notices.map((n) => [n.leagueName, n.leagueKind, n.private, n.title])).toEqual([
      ['Liga Norte', 'liga', true, 'Nuevo torneo: Torneo t1'],
      ['Copa Verano', 'torneo', false, 'Nuevo torneo: Torneo t2'],
    ]);
    expect(notices[0].to).toBe('/l/l1/e/t1');
  });

  it('el torneo del día sube arriba con su propio título', () => {
    const [n] = buildNotices([feed({ events: [event('t1', 'torneo', today, { createdAt: at(now - 20 * DAY) })] })], [league('l1')], today, now);
    expect(n.kind).toBe('torneo-hoy');
    expect(n.title).toBe('¡Hoy es Torneo t1!');
    expect(n.time).toBeGreaterThanOrEqual(new Date(2026, 8, 25).getTime());
  });

  it('no avisa de eventos que ya pasaron ni de prácticas lejanas', () => {
    const notices = buildNotices(
      [
        feed({
          events: [
            event('viejo', 'torneo', '2026-09-24'),
            event('p-lejos', 'practica', '2026-10-20'),
            event('p-cerca', 'practica', '2026-09-29', { rsvp: { p1: true, p9: true } }),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => n.id)).toEqual(['practica:l1:p-cerca']);
    expect(notices[0].body).toBe('Vas ✓ · 2 confirmados');
  });

  it('avisa lo aprobado y lo rechazado del último mes, con el motivo', () => {
    const notices = buildNotices(
      [
        feed({
          events: [event('e1', 'practica', '2026-09-30')],
          mySubs: [
            sub('a', 'aprobado', { reviewedAt: at(now - 3 * HOUR) }),
            sub('r', 'rechazado', { reviewedAt: at(now - 5 * HOUR), note: 'la foto no se lee', eventId: null, date: '2026-09-22' }),
            sub('viejo', 'aprobado', { reviewedAt: at(now - 40 * DAY) }),
            sub('pend', 'pendiente'),
          ],
        }),
      ],
      [league('l1')],
      today,
      now,
    ).filter((n) => n.kind === 'aprobado' || n.kind === 'rechazado');
    expect(notices.map((n) => [n.kind, n.body, n.to])).toEqual([
      ['aprobado', `180 · 200 · Práctica ${formatDate('2026-09-30')}`, '/l/l1/e/e1'],
      ['rechazado', `180 · 200 · Práctica ${formatDate('2026-09-22')} · Motivo: la foto no se lee`, '/l/l1/perfil'],
    ]);
  });

  it('al admin le avisa lo pendiente por aprobar, uno por liga', () => {
    const notices = buildNotices(
      [feed({ isAdmin: true, pending: [sub('x', 'pendiente', { createdAt: at(now - HOUR) }), sub('y', 'pendiente', { createdAt: at(now - 2 * HOUR) })] })],
      [league('l1')],
      today,
      now,
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: 'por-aprobar', title: '2 envíos por aprobar', to: '/l/l1/admin?tab=aprobar', time: now - HOUR });
  });

  it('dice de qué evento eran los juegos aunque el evento ya pasó', () => {
    const notices = buildNotices(
      [
        feed({
          // El torneo del sábado ya pasó: llega a la lista solo para ponerle nombre al aviso.
          events: [event('sab', 'torneo', '2026-09-20')],
          mySubs: [sub('a', 'aprobado', { eventId: 'sab', reviewedAt: at(now - HOUR) })],
        }),
      ],
      [league('l1')],
      today,
      now,
    );
    expect(notices.map((n) => [n.kind, n.body])).toEqual([['aprobado', '180 · 200 · Torneo sab']]);
  });

  it('ignora ligas que ya no están', () => {
    expect(buildNotices([feed({ lid: 'borrada', events: [event('t', 'torneo', '2026-10-01')] })], [league('l1')], today, now)).toEqual([]);
  });
});

describe('cuándo', () => {
  it('dice el tiempo en palabras', () => {
    expect(relativeTime(now - 20_000, now)).toBe('ahora');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(relativeTime(now - 3 * HOUR, now)).toBe('hace 3 h');
    expect(relativeTime(now - 30 * HOUR, now)).toBe('ayer');
    expect(relativeTime(now - 4 * DAY, now)).toBe('hace 4 días');
  });

  it('cuenta días de calendario, no bloques de 24 h', () => {
    // 23 de sept a las 11 pm visto el 25 a las 10 pm: 47 h, pero fue anteayer.
    expect(relativeTime(new Date(2026, 8, 23, 23).getTime(), new Date(2026, 8, 25, 22).getTime())).toBe('hace 2 días');
    // 24 a las 6 am visto el 25 al mediodía: 30 h y sí fue ayer.
    expect(relativeTime(new Date(2026, 8, 24, 6).getTime(), new Date(2026, 8, 25, 12).getTime())).toBe('ayer');
  });
});
