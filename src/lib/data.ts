import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { scoreGame } from './bowling';
import { DEFAULT_CUTS, normalizeName, playerStats, slots } from './stats';
import type {
  BowlingEvent,
  Entry,
  EventType,
  GameFrames,
  Invite,
  League,
  LeagueKind,
  LeagueRole,
  Member,
  Photo,
  Player,
  RankBy,
  Submission,
  UserProfile,
  Visibility,
} from './types';
import { NO_PHOTO } from './types';

// ---------- Rutas: todo lo del boliche vive dentro de una liga ----------

type LeagueCol = 'players' | 'events' | 'entries' | 'submissions' | 'photos';
const col = (lid: string, name: LeagueCol) => collection(db, 'leagues', lid, name);
const ref = (lid: string, name: LeagueCol, id: string) => doc(db, 'leagues', lid, name, id);
const newId = (lid: string, name: LeagueCol) => doc(col(lid, name)).id;
export const memberId = (lid: string, uid: string) => `${lid}_${uid}`;
export const entryId = (eventId: string, playerId: string) => `${eventId}_${playerId}`;

// ---------- Lecturas en vivo (onSnapshot = la pantalla se actualiza sola) ----------

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function useLiveQuery<T>(key: string | null, make: () => Query<DocumentData>): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: key != null, error: null });
  useEffect(() => {
    if (key == null) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      make(),
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function useLiveDoc<T>(path: string | null): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: path != null, error: null });
  useEffect(() => {
    if (path == null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) =>
        setState({
          data: snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null,
          loading: false,
          error: null,
        }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);
  return state;
}

// Ligas y cuentas
export const useLeague = (lid: string | undefined) => useLiveDoc<League>(lid ? `leagues/${lid}` : null);

export const usePublicLeagues = () =>
  useLiveQuery<League>('leagues:public', () => query(collection(db, 'leagues'), where('visibility', '==', 'public')));

/** Todas las ligas (solo el superadmin puede listarlas). */
export const useAllLeagues = (enabled: boolean) =>
  useLiveQuery<League>(enabled ? 'leagues:all' : null, () => collection(db, 'leagues'));

/** Varias ligas por id (las de mis membresías), en vivo. Las que no existen o no se pueden ver se omiten. */
export interface PlayerInLeague {
  lid: string;
  playerId: string;
  entries: Entry[];
  events: BowlingEvent[];
}

/**
 * Las participaciones y los eventos del jugador de la cuenta en cada liga donde está vinculado
 * (para el perfil global). Solo se leen ligas de las que es miembro.
 */
export function usePlayerAcrossLeagues(links: { lid: string; playerId: string }[]): Live<PlayerInLeague[]> {
  const key = links
    .map((l) => `${l.lid}:${l.playerId}`)
    .sort()
    .join(',');
  const [state, setState] = useState<Live<PlayerInLeague[]>>({ data: [], loading: links.length > 0, error: null });
  useEffect(() => {
    const pairs = key ? key.split(',').map((k) => k.split(':') as [string, string]) : [];
    if (!pairs.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const entries = new Map<string, Entry[]>();
    const events = new Map<string, BowlingEvent[]>();
    const publish = () =>
      setState({
        data: pairs
          .filter(([lid]) => entries.has(lid) && events.has(lid))
          .map(([lid, playerId]) => ({ lid, playerId, entries: entries.get(lid)!, events: events.get(lid)! })),
        loading: pairs.some(([lid]) => !entries.has(lid) || !events.has(lid)),
        error: null,
      });
    const fail = (error: Error) => setState({ data: [], loading: false, error });
    const unsubs = pairs.flatMap(([lid, playerId]) => [
      onSnapshot(
        query(col(lid, 'entries'), where('playerId', '==', playerId)),
        (snap) => {
          entries.set(lid, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry));
          publish();
        },
        fail,
      ),
      onSnapshot(
        col(lid, 'events'),
        (snap) => {
          events.set(lid, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BowlingEvent));
          publish();
        },
        fail,
      ),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}

export interface LeagueFeed {
  lid: string;
  playerId: string | null;
  isAdmin: boolean;
  /** Anotador del torneo (torneos sin liga). */
  isScorer: boolean;
  /** Eventos de ayer en adelante (lo que viene). */
  events: BowlingEvent[];
  /** Envíos del jugador de la cuenta. */
  mySubs: Submission[];
  /** Envíos por aprobar (solo si es admin de la liga). */
  pending: Submission[];
}

/**
 * onSnapshot que se reintenta (0,5 s, 1 s, 2 s, 4 s, 8 s) si Firestore lo rechaza. Pasa justo después
 * de crear o unirse a una liga: la membresía está en el teléfono pero el servidor todavía no la tiene.
 * Si sigue fallando (p. ej. te sacaron de la liga), llama a `onGiveUp`.
 */
function listenRetry(subscribe: (onError: (e: Error) => void) => () => void, onGiveUp: (e: Error) => void, attempts = 5): () => void {
  let stop = () => undefined as void;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const start = (n: number) => {
    stop = subscribe((e) => {
      if (closed) return;
      if (n < attempts) timer = setTimeout(() => !closed && start(n + 1), 500 * 2 ** n);
      else onGiveUp(e);
    });
  };
  start(0);
  return () => {
    closed = true;
    clearTimeout(timer);
    stop();
  };
}

/**
 * Lo que alimenta los avisos (campana): por cada liga de la cuenta, los eventos que vienen,
 * sus envíos y, si es admin, lo que falta por aprobar. Todo en vivo y dentro de sus permisos.
 * Para los envíos aprobados o rechazados del último mes también se traen sus eventos pasados
 * (para decir en el aviso de qué torneo o práctica eran).
 */
export function useLeagueFeeds(memberships: Member[], fromDate: string): Live<LeagueFeed[]> {
  const key = memberships
    .map((m) => `${m.leagueId}:${m.playerId ?? '-'}:${m.role === 'member' ? 'm' : 'a'}:${m.scorer ? 's' : '-'}`)
    .sort()
    .join(',');
  const [state, setState] = useState<Live<LeagueFeed[]>>({ data: [], loading: memberships.length > 0, error: null });
  useEffect(() => {
    const items = key
      ? key.split(',').map((k) => {
          const [lid, pid, role, scorer] = k.split(':');
          return { lid, playerId: pid === '-' ? null : pid, isAdmin: role === 'a', isScorer: scorer === 's' };
        })
      : [];
    if (!items.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    let closed = false;
    type Part = 'events' | 'mySubs' | 'pending';
    const parts = new Map<string, Partial<Record<Part, unknown[]>>>();
    // Eventos pasados de envíos revisados hace poco: liga -> id -> evento.
    const older = new Map<string, Map<string, BowlingEvent>>();
    const requested = new Set<string>();
    const needed = (it: (typeof items)[number]): Part[] => ['events', ...(it.playerId ? (['mySubs'] as Part[]) : []), ...(it.isAdmin ? (['pending'] as Part[]) : [])];
    const publish = () => {
      if (closed) return;
      setState({
        data: items
          .filter((it) => needed(it).every((p) => parts.get(it.lid)?.[p]))
          .map((it) => {
            const got = parts.get(it.lid)!;
            const upcoming = (got.events ?? []) as BowlingEvent[];
            const extra = [...(older.get(it.lid)?.values() ?? [])].filter((e) => !upcoming.some((u) => u.id === e.id));
            return {
              ...it,
              events: [...upcoming, ...extra],
              mySubs: (got.mySubs ?? []) as Submission[],
              pending: (got.pending ?? []) as Submission[],
            };
          }),
        loading: items.some((it) => !needed(it).every((p) => parts.get(it.lid)?.[p])),
        error: null,
      });
    };
    const fetchOlder = (lid: string) => {
      const got = parts.get(lid);
      const subs = got?.mySubs as Submission[] | undefined;
      if (!subs || !got?.events) return;
      const have = new Set((got.events as BowlingEvent[]).map((e) => e.id));
      const cutoff = Date.now() - 30 * 86400_000;
      for (const s of subs) {
        if (s.status === 'pendiente' || !s.eventId || have.has(s.eventId)) continue;
        if ((s.reviewedAt?.toMillis?.() ?? 0) < cutoff) continue;
        const k = `${lid}/${s.eventId}`;
        if (requested.has(k)) continue;
        requested.add(k);
        getDoc(ref(lid, 'events', s.eventId))
          .then((snap) => {
            if (!snap.exists()) return;
            if (!older.has(lid)) older.set(lid, new Map());
            older.get(lid)!.set(snap.id, { id: snap.id, ...snap.data() } as BowlingEvent);
            publish();
          })
          .catch(() => undefined);
      }
    };
    const put = (lid: string, part: Part) => (snap: { docs: { id: string; data(): DocumentData }[] }) => {
      parts.set(lid, { ...parts.get(lid), [part]: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      if (part !== 'pending') fetchOlder(lid);
      publish();
    };
    // Si una liga sigue fallando (p. ej. te sacaron), se ignora: los avisos de las demás siguen.
    const skip = (lid: string, part: Part) => () => put(lid, part)({ docs: [] });
    const listen = (lid: string, part: Part, q: Query<DocumentData>) =>
      listenRetry((onError) => onSnapshot(q, put(lid, part), onError), skip(lid, part));
    const unsubs = items.flatMap((it) => [
      listen(it.lid, 'events', query(col(it.lid, 'events'), where('date', '>=', fromDate))),
      ...(it.playerId ? [listen(it.lid, 'mySubs', query(col(it.lid, 'submissions'), where('playerId', '==', it.playerId)))] : []),
      ...(it.isAdmin ? [listen(it.lid, 'pending', query(col(it.lid, 'submissions'), where('status', '==', 'pendiente')))] : []),
    ]);
    return () => {
      closed = true;
      unsubs.forEach((u) => u());
    };
  }, [key, fromDate]);
  return state;
}

export function useLeaguesByIds(ids: string[]): Live<League[]> {
  const key = [...ids].sort().join(',');
  const [state, setState] = useState<Live<League[]>>({ data: [], loading: ids.length > 0, error: null });
  useEffect(() => {
    const list = key ? key.split(',') : [];
    if (!list.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const found = new Map<string, League | null>();
    const publish = () =>
      setState({
        data: list.map((id) => found.get(id)).filter((l): l is League => !!l).sort((a, b) => a.name.localeCompare(b.name)),
        loading: found.size < list.length,
        error: null,
      });
    // Recién creada o recién unido: el primer intento puede fallar; se reintenta antes de darla por perdida.
    const unsubs = list.map((id) =>
      listenRetry(
        (onError) =>
          onSnapshot(
            doc(db, 'leagues', id),
            (snap) => {
              found.set(id, snap.exists() ? ({ id: snap.id, ...snap.data() } as League) : null);
              publish();
            },
            onError,
          ),
        () => {
          found.set(id, null);
          publish();
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}

export const useMembership = (lid: string | undefined, uid: string | undefined) =>
  useLiveDoc<Member>(lid && uid ? `members/${memberId(lid, uid)}` : null);

export const useMyMemberships = (uid: string | undefined) =>
  useLiveQuery<Member>(uid ? `members:u:${uid}` : null, () => query(collection(db, 'members'), where('uid', '==', uid)));

export const useLeagueMembers = (lid: string | undefined) =>
  useLiveQuery<Member>(lid ? `members:l:${lid}` : null, () => query(collection(db, 'members'), where('leagueId', '==', lid)));

/** Cuentas registradas (solo el superadmin puede leerlas todas). */
export const useUsers = (enabled: boolean) => useLiveQuery<UserProfile>(enabled ? 'users' : null, () => collection(db, 'users'));

// Contenido de una liga
export const usePlayers = (lid: string | undefined) =>
  useLiveQuery<Player>(lid ? `players:${lid}` : null, () => query(col(lid!, 'players'), orderBy('name')));

export const usePlayer = (lid: string | undefined, id: string | undefined) =>
  useLiveDoc<Player>(lid && id ? `leagues/${lid}/players/${id}` : null);

export const useEvents = (lid: string | undefined) =>
  useLiveQuery<BowlingEvent>(lid ? `events:${lid}` : null, () => query(col(lid!, 'events'), orderBy('date', 'desc')));

export const useEvent = (lid: string | undefined, id: string | undefined) =>
  useLiveDoc<BowlingEvent>(lid && id ? `leagues/${lid}/events/${id}` : null);

export const useAllEntries = (lid: string | undefined) =>
  useLiveQuery<Entry>(lid ? `entries:${lid}` : null, () => col(lid!, 'entries'));

export const useEventEntries = (lid: string | undefined, eventId: string | undefined) =>
  useLiveQuery<Entry>(lid && eventId ? `entries:${lid}:e:${eventId}` : null, () =>
    query(col(lid!, 'entries'), where('eventId', '==', eventId)),
  );

export const usePlayerEntries = (lid: string | undefined, playerId: string | undefined) =>
  useLiveQuery<Entry>(lid && playerId ? `entries:${lid}:p:${playerId}` : null, () =>
    query(col(lid!, 'entries'), where('playerId', '==', playerId)),
  );

/** Participaciones de varios eventos a la vez (posición en cada torneo, ranking de la temporada). */
export function useEntriesOfEvents(lid: string | undefined, eventIds: string[]): Live<Entry[]> {
  const key = lid ? `${lid}:${[...eventIds].sort().join(',')}` : '';
  const [state, setState] = useState<Live<Entry[]>>({ data: [], loading: eventIds.length > 0, error: null });
  useEffect(() => {
    const [league, list] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const ids = list ? list.split(',') : [];
    if (!league || !ids.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const parts = new Map<number, Entry[]>();
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(col(league, 'entries'), where('eventId', 'in', chunk)),
        (snap) => {
          parts.set(i, snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry));
          setState({ data: [...parts.values()].flat(), loading: parts.size < chunks.length, error: null });
        },
        (error) => setState({ data: [], loading: false, error }),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);
  return state;
}

export const useSubmissions = (lid: string | undefined, status: Submission['status'] = 'pendiente') =>
  useLiveQuery<Submission>(lid ? `subs:${lid}:${status}` : null, () => query(col(lid!, 'submissions'), where('status', '==', status)));

export const usePlayerSubmissions = (lid: string | undefined, playerId: string | undefined) =>
  useLiveQuery<Submission>(lid && playerId ? `subs:${lid}:p:${playerId}` : null, () =>
    query(col(lid!, 'submissions'), where('playerId', '==', playerId)),
  );

export const usePhoto = (lid: string | undefined, id: string | null | undefined) =>
  useLiveDoc<Photo>(lid && id ? `leagues/${lid}/photos/${id}` : null);

/** Promedio que tiene hoy cada jugador en la liga (fijo o calculado con sus juegos verificados). */
export async function fetchEffectiveAverages(lid: string, players: Pick<Player, 'id' | 'averageOverride'>[]) {
  const result = new Map<string, number>();
  const need = players.filter((p) => {
    if (p.averageOverride != null) result.set(p.id, p.averageOverride);
    return p.averageOverride == null;
  });
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    const snap = await getDocs(query(col(lid, 'entries'), where('playerId', 'in', chunk.map((p) => p.id))));
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry);
    for (const p of chunk) {
      result.set(p.id, playerStats(entries.filter((e) => e.playerId === p.id)).autoAverage ?? 0);
    }
  }
  return result;
}

async function commitInChunks(ops: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ---------- Ligas ----------

export interface LeagueInput {
  name: string;
  kind: LeagueKind;
  visibility: Visibility;
  venue: string;
  schedule: string;
  seasonStart: string;
  seasonEnd: string;
  contactName: string;
  contactPhone: string;
  requirePhoto: boolean;
}

/** Crea la liga y deja a quien la crea como dueño (las reglas exigen que ambas cosas vayan juntas). */
export async function createLeague(owner: { uid: string; name: string }, input: LeagueInput) {
  const leagueRef = doc(collection(db, 'leagues'));
  const batch = writeBatch(db);
  batch.set(leagueRef, { ...input, name: input.name.trim(), ownerUid: owner.uid, createdAt: serverTimestamp() });
  batch.set(doc(db, 'members', memberId(leagueRef.id, owner.uid)), {
    leagueId: leagueRef.id,
    uid: owner.uid,
    name: owner.name,
    role: 'owner',
    playerId: null,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  return leagueRef.id;
}

export async function updateLeague(lid: string, patch: Partial<LeagueInput>) {
  const code = patch.name != null ? await getInviteCode(lid) : null;
  const batch = writeBatch(db);
  batch.update(doc(db, 'leagues', lid), patch);
  // La invitación muestra el nombre de la liga antes de unirse.
  if (code) batch.update(doc(db, 'invites', code), { leagueName: patch.name });
  await batch.commit();
}

/** Borra la liga con todo su contenido, miembros e invitación. */
export async function deleteLeague(lid: string, myUid: string) {
  const cols: LeagueCol[] = ['entries', 'submissions', 'photos', 'events', 'players'];
  const [code, members, ...snaps] = await Promise.all([
    getInviteCode(lid),
    getDocs(query(collection(db, 'members'), where('leagueId', '==', lid))),
    ...cols.map((c) => getDocs(col(lid, c))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  snaps.forEach((s) => s.docs.forEach((d) => ops.push((b) => b.delete(d.ref))));
  members.docs.filter((d) => d.get('uid') !== myUid).forEach((d) => ops.push((b) => b.delete(d.ref)));
  if (code) ops.push((b) => b.delete(doc(db, 'invites', code)));
  ops.push((b) => b.delete(doc(db, 'leagues', lid, 'private', 'invite')));
  await commitInChunks(ops);
  // Lo último, juntos: mientras exista la membresía del dueño, las reglas lo reconocen como admin.
  const last = writeBatch(db);
  if (members.docs.some((d) => d.get('uid') === myUid)) last.delete(doc(db, 'members', memberId(lid, myUid)));
  last.delete(doc(db, 'leagues', lid));
  await last.commit();
}

/** Torneo sin liga: su "liga" de un solo torneo (con dueño, invitación y admins) y el torneo adentro. */
export async function createTournament(owner: { uid: string; name: string }, input: LeagueInput, date: string) {
  const lid = await createLeague(owner, { ...input, kind: 'torneo', schedule: '', seasonStart: date, seasonEnd: date });
  const eid = await createEvent(lid, {
    type: 'torneo',
    name: input.name.trim(),
    date,
    games: 3,
    hcpBase: 230,
    hcpPercent: 80,
    individualRankBy: 'hcp',
    teamRankBy: 'scratch',
    categoryCuts: DEFAULT_CUTS,
    teamSize: 3,
    announcement: '',
  });
  return { lid, eid };
}

/** Código de invitación: 8 caracteres sin letras que se confundan (O/0, I/1). */
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

/** Código vigente de la liga (solo lo leen sus admins). */
export async function getInviteCode(lid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'leagues', lid, 'private', 'invite'));
  return snap.exists() ? (snap.get('code') as string) : null;
}

/** Crea (o cambia) el código de invitación: el anterior deja de servir. */
export async function renewInviteCode(league: League) {
  const old = await getInviteCode(league.id);
  const code = randomCode();
  const batch = writeBatch(db);
  if (old) batch.delete(doc(db, 'invites', old));
  batch.set(doc(db, 'invites', code), { leagueId: league.id, leagueName: league.name, createdAt: serverTimestamp() });
  batch.set(doc(db, 'leagues', league.id, 'private', 'invite'), { code });
  await batch.commit();
  return code;
}

export async function getInvite(code: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', code.trim().toUpperCase()));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Invite) : null;
}

// Ligas a las que la cuenta se está uniendo ahora (mientras se deja como jugador no se pregunta "¿Eres alguno?").
const joining = new Set<string>();
const joiningListeners = new Set<() => void>();
function setJoining(lid: string, on: boolean) {
  if (on) joining.add(lid);
  else joining.delete(lid);
  joiningListeners.forEach((l) => l());
}
export function useJoining(lid: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      joiningListeners.add(cb);
      return () => joiningListeners.delete(cb);
    },
    () => joining.has(lid),
  );
}

/**
 * Unirse a una liga (pública sin más, privada con el código de invitación). Entrar es participar:
 * queda como jugador. Devuelve su jugador, o null si tiene que elegir quién es en la lista.
 */
export async function joinLeague(lid: string, user: { uid: string; name: string }, code: string | null): Promise<string | null> {
  setJoining(lid, true);
  try {
    return await joinAsPlayer(lid, user, code);
  } finally {
    setJoining(lid, false);
  }
}

async function joinAsPlayer(lid: string, user: { uid: string; name: string }, code: string | null): Promise<string | null> {
  await setDoc(doc(db, 'members', memberId(lid, user.uid)), {
    leagueId: lid,
    uid: user.uid,
    name: user.name,
    role: 'member',
    playerId: null,
    joinedAt: serverTimestamp(),
    ...(code ? { code: code.trim().toUpperCase() } : {}),
  });
  try {
    return await becomePlayer(lid, user.uid, user.name);
  } catch (e) {
    // Ya es miembro; si esto falla, elige o crea su jugador en "Mis juegos".
    console.error(e);
    return null;
  }
}

/**
 * Deja la cuenta como jugador de la liga: si en la lista hay un jugador sin cuenta con su mismo nombre,
 * se vincula con él (conserva sus juegos); si no hay jugadores sin cuenta, crea el suyo. Si hay otros
 * sin cuenta (quizá es uno de ellos con otro nombre), devuelve null para preguntarle una vez quién es.
 */
export async function becomePlayer(lid: string, uid: string, name: string): Promise<string | null> {
  const snap = await getDocs(col(lid, 'players'));
  const free = snap.docs.filter((d) => !d.get('uid'));
  const same = free.filter((d) => normalizeName(String(d.get('name') ?? '')) === normalizeName(name));
  if (same.length === 1) {
    await claimPlayer(lid, uid, same[0].id);
    return same[0].id;
  }
  if (free.length === 0) return createOwnPlayer(lid, uid, name);
  return null;
}

/** Salir de la liga (o que un admin saque a alguien): su jugador queda sin cuenta. */
export async function removeMember(member: Member) {
  const batch = writeBatch(db);
  if (member.playerId) batch.update(ref(member.leagueId, 'players', member.playerId), { uid: null });
  batch.delete(doc(db, 'members', member.id));
  await batch.commit();
}

export async function setMemberRole(member: Member, role: Exclude<LeagueRole, 'owner'>) {
  await updateDoc(doc(db, 'members', member.id), { role });
}

/** Anotador del torneo (solo lo cambia el dueño). */
export async function setMemberScorer(member: Member, scorer: boolean) {
  await updateDoc(doc(db, 'members', member.id), { scorer });
}

export async function setSuperadmin(uid: string, value: boolean) {
  await updateDoc(doc(db, 'users', uid), { superadmin: value });
}

// ---------- Jugadores y vínculo con la cuenta ----------

export async function createPlayer(lid: string, name: string, averageOverride: number | null) {
  const r = doc(col(lid, 'players'));
  await setDoc(r, { name: name.trim(), averageOverride, createdAt: serverTimestamp() });
  return r.id;
}

export async function updatePlayer(lid: string, id: string, patch: Partial<Omit<Player, 'id'>>) {
  await updateDoc(ref(lid, 'players', id), patch);
}

/** Borra el jugador con sus participaciones y envíos; su cuenta, si tiene, queda sin vincular. */
export async function deletePlayer(lid: string, id: string, uid?: string | null) {
  const [entries, subs] = await Promise.all([
    getDocs(query(col(lid, 'entries'), where('playerId', '==', id))),
    getDocs(query(col(lid, 'submissions'), where('playerId', '==', id))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  entries.docs.forEach((d) => {
    const eventId = d.get('eventId') as string;
    ops.push((b) => b.delete(d.ref));
    ops.push((b) => b.update(ref(lid, 'events', eventId), { playerCount: increment(-1) }));
  });
  subs.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  if (uid) ops.push((b) => b.update(doc(db, 'members', memberId(lid, uid)), { playerId: null }));
  ops.push((b) => b.delete(ref(lid, 'players', id)));
  await commitInChunks(ops);
}

/** El miembro se vincula con un jugador de la liga que todavía no tiene cuenta. */
export async function claimPlayer(lid: string, uid: string, playerId: string) {
  const batch = writeBatch(db);
  batch.update(ref(lid, 'players', playerId), { uid });
  batch.update(doc(db, 'members', memberId(lid, uid)), { playerId });
  await batch.commit();
}

/** "No estoy en la lista": crea su propio jugador en la liga, ya vinculado. */
export async function createOwnPlayer(lid: string, uid: string, name: string) {
  const playerId = newId(lid, 'players');
  const batch = writeBatch(db);
  batch.set(ref(lid, 'players', playerId), { name: name.trim(), averageOverride: null, uid, createdAt: serverTimestamp() });
  batch.update(doc(db, 'members', memberId(lid, uid)), { playerId });
  await batch.commit();
  return playerId;
}

/** Admin: separa la cuenta del jugador (se vinculó al perfil equivocado). */
export async function unlinkAccount(lid: string, playerId: string, uid: string) {
  const batch = writeBatch(db);
  batch.update(ref(lid, 'players', playerId), { uid: null });
  batch.update(doc(db, 'members', memberId(lid, uid)), { playerId: null });
  await batch.commit();
}

// ---------- Eventos ----------

export interface EventInput {
  type: EventType;
  name: string;
  date: string;
  games: number;
  hcpBase: number;
  hcpPercent: number;
  individualRankBy: RankBy;
  teamRankBy: RankBy;
  categoryCuts: [number, number, number];
  teamSize: number;
  announcement: string;
}

export async function createEvent(lid: string, input: EventInput) {
  const r = doc(col(lid, 'events'));
  await setDoc(r, { ...input, teams: {}, playerCount: 0, createdAt: serverTimestamp() });
  return r.id;
}

export async function updateEvent(lid: string, id: string, patch: Partial<EventInput>) {
  await updateDoc(ref(lid, 'events', id), patch);
}

export async function deleteEvent(lid: string, id: string) {
  const [entries, subs, photos] = await Promise.all([
    getDocs(query(col(lid, 'entries'), where('eventId', '==', id))),
    getDocs(query(col(lid, 'submissions'), where('eventId', '==', id))),
    getDocs(query(col(lid, 'photos'), where('eventId', '==', id))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  [...entries.docs, ...subs.docs, ...photos.docs].forEach((d) => ops.push((b) => b.delete(d.ref)));
  ops.push((b) => b.delete(ref(lid, 'events', id)));
  await commitInChunks(ops);
}

/** El jugador confirma (o quita) que va a la práctica. */
export async function setRsvp(lid: string, eventId: string, playerId: string, going: boolean) {
  await updateDoc(ref(lid, 'events', eventId), { [`rsvp.${playerId}`]: going ? true : deleteField() });
}

/** Inscribe jugadores en el evento con el promedio que tienen hoy. */
export async function addEntries(lid: string, event: BowlingEvent, players: { id: string; average: number }[]) {
  const batch = writeBatch(db);
  for (const p of players) {
    batch.set(ref(lid, 'entries', entryId(event.id, p.id)), {
      eventId: event.id,
      playerId: p.id,
      teamId: null,
      average: p.average,
      handicapOverride: null,
      scores: slots([], event.games, null),
      photos: slots([], event.games, null),
      createdAt: serverTimestamp(),
    });
  }
  batch.update(ref(lid, 'events', event.id), { playerCount: increment(players.length) });
  await batch.commit();
}

export async function updateEntry(lid: string, id: string, patch: Partial<Omit<Entry, 'id' | 'eventId' | 'playerId'>>) {
  await updateDoc(ref(lid, 'entries', id), patch);
}

export async function updateEntries(lid: string, patches: { id: string; patch: Partial<Entry> }[]) {
  await commitInChunks(patches.map(({ id, patch }) => (b) => b.update(ref(lid, 'entries', id), patch)));
}

/** Guarda un juego: pinos, cuadros (si se anotó tiro por tiro) y si cuenta sin foto. */
export async function saveGame(
  lid: string,
  event: BowlingEvent,
  entry: Entry,
  game: number,
  value: { score: number | null; frames: GameFrames | null },
  requirePhoto: boolean,
) {
  const scores = slots(entry.scores, event.games, null);
  const photos = slots(entry.photos, event.games, null);
  scores[game] = value.score;
  // Sin foto obligatoria el juego cuenta de una; con foto, vuelve a borrador hasta verificarlo.
  photos[game] = value.score != null && !requirePhoto ? NO_PHOTO : null;
  await updateDoc(ref(lid, 'entries', entry.id), {
    scores,
    photos,
    [`frames.${game}`]: value.frames ?? deleteField(),
  });
}

export async function removeEntry(lid: string, entry: Entry) {
  const batch = writeBatch(db);
  batch.delete(ref(lid, 'entries', entry.id));
  batch.update(ref(lid, 'events', entry.eventId), { playerCount: increment(-1) });
  await batch.commit();
}

// ---------- Equipos ----------

export async function addTeam(lid: string, eventId: string, name: string) {
  await updateDoc(ref(lid, 'events', eventId), { [`teams.${newId(lid, 'events')}`]: { name, order: Date.now() } });
}

export async function renameTeam(lid: string, eventId: string, teamId: string, name: string) {
  await updateDoc(ref(lid, 'events', eventId), { [`teams.${teamId}.name`]: name });
}

/**
 * Arma los equipos de una vez: reutiliza los equipos existentes en orden, crea los que falten,
 * borra los que sobren y asigna a cada inscrito. Todo en una sola escritura.
 */
export async function applyTeams(lid: string, event: BowlingEvent, groups: { teamId: string | null; name: string; entryIds: string[] }[]) {
  const batch = writeBatch(db);
  const eventPatch: Record<string, unknown> = {};
  const used = new Set<string>();
  groups.forEach((g, i) => {
    const teamId = g.teamId ?? newId(lid, 'events');
    used.add(teamId);
    if (!g.teamId) eventPatch[`teams.${teamId}`] = { name: g.name, order: Date.now() + i };
    g.entryIds.forEach((id) => batch.update(ref(lid, 'entries', id), { teamId }));
  });
  Object.keys(event.teams ?? {})
    .filter((id) => !used.has(id))
    .forEach((id) => (eventPatch[`teams.${id}`] = deleteField()));
  if (Object.keys(eventPatch).length) batch.update(ref(lid, 'events', event.id), eventPatch);
  await batch.commit();
}

export async function deleteTeam(lid: string, eventId: string, teamId: string, memberEntryIds: string[]) {
  const batch = writeBatch(db);
  batch.update(ref(lid, 'events', eventId), { [`teams.${teamId}`]: deleteField() });
  memberEntryIds.forEach((id) => batch.update(ref(lid, 'entries', id), { teamId: null }));
  await batch.commit();
}

// ---------- Fotos, verificación y envíos ----------

/** Solo lo que se guarda de la foto (la versión grande para la IA no sube). */
const photoFields = (p: Omit<Photo, 'id'>) => ({ data: p.data, width: p.width, height: p.height });

export interface VerifiedWrite {
  /** Participación existente o null si hay que inscribir al jugador. */
  entry: Entry | null;
  playerId: string;
  average: number;
  /** juego (índice) -> pinos */
  values: Record<number, number>;
}

/**
 * Guarda la foto y marca como verificados los juegos que se leyeron de ella (admin).
 * Inscribe al jugador si todavía no estaba en el evento.
 */
export async function saveVerifiedGames(lid: string, event: BowlingEvent, photo: Omit<Photo, 'id'>, writes: VerifiedWrite[]) {
  const photoId = newId(lid, 'photos');
  const batch = writeBatch(db);
  batch.set(ref(lid, 'photos', photoId), { ...photoFields(photo), eventId: event.id, createdAt: serverTimestamp() });
  let added = 0;
  for (const w of writes) {
    const scores = slots(w.entry?.scores, event.games, null);
    const photos = slots(w.entry?.photos, event.games, null);
    for (const [i, v] of Object.entries(w.values)) {
      scores[+i] = v;
      photos[+i] = photoId;
    }
    if (w.entry) {
      batch.update(ref(lid, 'entries', w.entry.id), { scores, photos });
    } else {
      added++;
      batch.set(ref(lid, 'entries', entryId(event.id, w.playerId)), {
        eventId: event.id,
        playerId: w.playerId,
        teamId: null,
        average: w.average,
        handicapOverride: null,
        scores,
        photos,
        createdAt: serverTimestamp(),
      });
    }
  }
  if (added) batch.update(ref(lid, 'events', event.id), { playerCount: increment(added) });
  await batch.commit();
  return photoId;
}

/** Envío de un jugador: juegos (y foto si hay), quedan pendientes de aprobación. */
export async function submitGames(
  lid: string,
  input: {
    playerId: string;
    /** Evento elegido, o null para subir por fecha. */
    eventId: string | null;
    date: string | null;
    scores: (number | null)[];
    scanned: (number | null)[] | null;
    frames: Record<string, GameFrames> | null;
    photo: Omit<Photo, 'id'> | null;
  },
) {
  const photoId = input.photo ? newId(lid, 'photos') : null;
  const subId = newId(lid, 'submissions');
  const batch = writeBatch(db);
  if (input.photo && photoId) {
    batch.set(ref(lid, 'photos', photoId), { ...photoFields(input.photo), eventId: input.eventId, createdAt: serverTimestamp() });
  }
  batch.set(ref(lid, 'submissions', subId), {
    playerId: input.playerId,
    eventId: input.eventId,
    date: input.eventId ? null : input.date,
    scores: input.scores,
    scanned: input.scanned,
    frames: input.frames,
    photoId,
    status: 'pendiente',
    note: null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return subId;
}

/**
 * Aprueba un envío: copia los juegos (y sus cuadros) a la participación del jugador como verificados.
 * `values` va por juego del evento; `start` es el juego donde cae el J1 del envío.
 */
export async function approveSubmission(
  lid: string,
  sub: Submission,
  event: BowlingEvent,
  entry: Entry | null,
  average: number,
  values: Record<number, number>,
  start: number,
) {
  const batch = writeBatch(db);
  const scores = slots(entry?.scores, event.games, null);
  const photos = slots(entry?.photos, event.games, null);
  const frames: Record<string, GameFrames> = { ...(entry?.frames ?? {}) };
  for (const [i, v] of Object.entries(values)) {
    scores[+i] = v;
    photos[+i] = sub.photoId ?? NO_PHOTO;
    const f = sub.frames?.[String(+i - start)];
    // Los cuadros solo valen si dan el mismo total que se aprueba.
    if (f && scoreGame(f.rolls).score === v) frames[i] = f;
    else delete frames[i];
  }
  const payload = { scores, photos, frames };
  if (entry) {
    batch.update(ref(lid, 'entries', entry.id), payload);
  } else {
    batch.set(ref(lid, 'entries', entryId(event.id, sub.playerId)), {
      eventId: event.id,
      playerId: sub.playerId,
      teamId: null,
      average,
      handicapOverride: null,
      ...payload,
      createdAt: serverTimestamp(),
    });
    batch.update(ref(lid, 'events', event.id), { playerCount: increment(1) });
  }
  batch.update(ref(lid, 'submissions', sub.id), { status: 'aprobado', eventId: event.id, reviewedAt: serverTimestamp() });
  // La foto de un envío por fecha queda asociada al evento (se borra con él).
  if (!sub.eventId && sub.photoId) batch.update(ref(lid, 'photos', sub.photoId), { eventId: event.id });
  await batch.commit();
}

/**
 * Evento donde se aprueba un envío por fecha: la práctica de ese día o, si no existe, se crea.
 * Devuelve el evento listo para usar en approveSubmission.
 */
export async function practiceForDate(lid: string, events: BowlingEvent[], date: string, games: number): Promise<BowlingEvent> {
  const existing = events.find((e) => e.type === 'practica' && e.date === date);
  if (existing) return existing;
  const input: EventInput = {
    type: 'practica',
    name: '',
    date,
    games: Math.max(3, games),
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
  };
  const id = await createEvent(lid, input);
  return { id, ...input, teams: {}, playerCount: 0 };
}

export async function rejectSubmission(lid: string, sub: Submission, note: string | null) {
  await updateDoc(ref(lid, 'submissions', sub.id), { status: 'rechazado', note, reviewedAt: serverTimestamp() });
}

/**
 * Libera espacio: borra las fotos de la liga de hace más de `months` meses.
 * Los juegos siguen verificados; solo deja de verse la foto.
 */
export async function deleteOldPhotos(lid: string, months: number) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const snap = await getDocs(query(col(lid, 'photos'), where('createdAt', '<', Timestamp.fromDate(cutoff))));
  await commitInChunks(snap.docs.map((d) => (b) => b.delete(d.ref)));
  return snap.size;
}
