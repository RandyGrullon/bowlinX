import { useEffect, useState } from 'react';
import {
  collection,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { playerStats, slots } from './stats';
import type { BowlingEvent, Entry, EventType, Photo, Player, RankBy, Role, Submission, UserProfile } from './types';

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

export const usePlayers = () =>
  useLiveQuery<Player>('players', () => query(collection(db, 'players'), orderBy('name')));

export const usePlayer = (id: string | undefined) => useLiveDoc<Player>(id ? `players/${id}` : null);

export const useEvents = () =>
  useLiveQuery<BowlingEvent>('events', () => query(collection(db, 'events'), orderBy('date', 'desc')));

export const useEvent = (id: string | undefined) => useLiveDoc<BowlingEvent>(id ? `events/${id}` : null);

export const useAllEntries = () => useLiveQuery<Entry>('entries', () => collection(db, 'entries'));

export const useEventEntries = (eventId: string | undefined) =>
  useLiveQuery<Entry>(eventId ? `entries:e:${eventId}` : null, () =>
    query(collection(db, 'entries'), where('eventId', '==', eventId)),
  );

export const usePlayerEntries = (playerId: string | undefined) =>
  useLiveQuery<Entry>(playerId ? `entries:p:${playerId}` : null, () =>
    query(collection(db, 'entries'), where('playerId', '==', playerId)),
  );

/** Participaciones de varios eventos a la vez (para la posición del jugador en cada torneo). */
export function useEntriesOfEvents(eventIds: string[]): Live<Entry[]> {
  const key = [...eventIds].sort().join(',');
  const [state, setState] = useState<Live<Entry[]>>({ data: [], loading: eventIds.length > 0, error: null });
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (!ids.length) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const parts = new Map<number, Entry[]>();
    const unsubs = chunks.map((chunk, i) =>
      onSnapshot(
        query(collection(db, 'entries'), where('eventId', 'in', chunk)),
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

export const useSubmissions = (status: Submission['status'] | null = 'pendiente') =>
  useLiveQuery<Submission>(`subs:${status}`, () =>
    status
      ? query(collection(db, 'submissions'), where('status', '==', status))
      : collection(db, 'submissions'),
  );

export const usePlayerSubmissions = (playerId: string | undefined) =>
  useLiveQuery<Submission>(playerId ? `subs:p:${playerId}` : null, () =>
    query(collection(db, 'submissions'), where('playerId', '==', playerId)),
  );

export const usePhoto = (id: string | null | undefined) => useLiveDoc<Photo>(id ? `photos/${id}` : null);

/** Cuentas registradas (solo el admin puede leerlas todas). */
export const useUsers = (enabled: boolean) => useLiveQuery<UserProfile>(enabled ? 'users' : null, () => collection(db, 'users'));

/** Promedio que tiene hoy cada jugador (fijo o calculado con sus juegos verificados). */
export async function fetchEffectiveAverages(players: Pick<Player, 'id' | 'averageOverride'>[]) {
  const result = new Map<string, number>();
  const need = players.filter((p) => {
    if (p.averageOverride != null) result.set(p.id, p.averageOverride);
    return p.averageOverride == null;
  });
  for (let i = 0; i < need.length; i += 30) {
    const chunk = need.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, 'entries'), where('playerId', 'in', chunk.map((p) => p.id))));
    const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entry);
    for (const p of chunk) {
      result.set(p.id, playerStats(entries.filter((e) => e.playerId === p.id)).autoAverage ?? 0);
    }
  }
  return result;
}

// ---------- Escrituras (solo admin, salvo enviar juegos) ----------

export const entryId = (eventId: string, playerId: string) => `${eventId}_${playerId}`;

const newId = (col: string) => doc(collection(db, col)).id;

async function commitInChunks(ops: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function createPlayer(name: string, averageOverride: number | null) {
  const ref = doc(collection(db, 'players'));
  await setDoc(ref, { name: name.trim(), averageOverride, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updatePlayer(id: string, patch: Partial<Omit<Player, 'id'>>) {
  await updateDoc(doc(db, 'players', id), patch);
}

/** Borra el jugador con todas sus participaciones y envíos; su cuenta, si tiene, queda sin vincular. */
export async function deletePlayer(id: string, uid?: string | null) {
  const [entries, subs] = await Promise.all([
    getDocs(query(collection(db, 'entries'), where('playerId', '==', id))),
    getDocs(query(collection(db, 'submissions'), where('playerId', '==', id))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  entries.docs.forEach((d) => {
    const eventId = d.get('eventId') as string;
    ops.push((b) => b.delete(d.ref));
    ops.push((b) => b.update(doc(db, 'events', eventId), { playerCount: increment(-1) }));
  });
  subs.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
  if (uid) ops.push((b) => b.update(doc(db, 'users', uid), { playerId: null }));
  ops.push((b) => b.delete(doc(db, 'players', id)));
  await commitInChunks(ops);
}

// ---------- Cuentas ----------

/** El jugador reclama su perfil (una sola vez). Las reglas exigen que ambos cambios vayan juntos. */
export async function claimPlayer(uid: string, playerId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'players', playerId), { uid });
  batch.update(doc(db, 'users', uid), { playerId });
  await batch.commit();
}

/** "No estoy en la lista": crea su propio jugador ya vinculado a la cuenta. */
export async function createOwnPlayer(uid: string, name: string) {
  const playerId = newId('players');
  const batch = writeBatch(db);
  batch.set(doc(db, 'players', playerId), { name: name.trim(), averageOverride: null, uid, createdAt: serverTimestamp() });
  batch.update(doc(db, 'users', uid), { playerId });
  await batch.commit();
  return playerId;
}

/** Admin: separa la cuenta del jugador (se vinculó al perfil equivocado). */
export async function unlinkAccount(playerId: string, uid: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'players', playerId), { uid: null });
  batch.update(doc(db, 'users', uid), { playerId: null });
  await batch.commit();
}

/** El jugador confirma (o quita) que va a la práctica. */
export async function setRsvp(eventId: string, playerId: string, going: boolean) {
  await updateDoc(doc(db, 'events', eventId), { [`rsvp.${playerId}`]: going ? true : deleteField() });
}

export async function setRole(uid: string, role: Role) {
  await updateDoc(doc(db, 'users', uid), { role });
}

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
}

export async function createEvent(input: EventInput) {
  const ref = doc(collection(db, 'events'));
  await setDoc(ref, { ...input, teams: {}, playerCount: 0, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateEvent(id: string, patch: Partial<EventInput>) {
  await updateDoc(doc(db, 'events', id), patch);
}

export async function deleteEvent(id: string) {
  const [entries, subs, photos] = await Promise.all([
    getDocs(query(collection(db, 'entries'), where('eventId', '==', id))),
    getDocs(query(collection(db, 'submissions'), where('eventId', '==', id))),
    getDocs(query(collection(db, 'photos'), where('eventId', '==', id))),
  ]);
  const ops: ((b: WriteBatch) => void)[] = [];
  [...entries.docs, ...subs.docs, ...photos.docs].forEach((d) => ops.push((b) => b.delete(d.ref)));
  ops.push((b) => b.delete(doc(db, 'events', id)));
  await commitInChunks(ops);
}

/** Inscribe jugadores en el evento con el promedio que tienen hoy. */
export async function addEntries(event: BowlingEvent, players: { id: string; average: number }[]) {
  const batch = writeBatch(db);
  for (const p of players) {
    batch.set(doc(db, 'entries', entryId(event.id, p.id)), {
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
  batch.update(doc(db, 'events', event.id), { playerCount: increment(players.length) });
  await batch.commit();
}

export async function updateEntry(id: string, patch: Partial<Omit<Entry, 'id' | 'eventId' | 'playerId'>>) {
  await updateDoc(doc(db, 'entries', id), patch);
}

export async function updateEntries(patches: { id: string; patch: Partial<Entry> }[]) {
  await commitInChunks(patches.map(({ id, patch }) => (b) => b.update(doc(db, 'entries', id), patch)));
}

export async function removeEntry(entry: Entry) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'entries', entry.id));
  batch.update(doc(db, 'events', entry.eventId), { playerCount: increment(-1) });
  await batch.commit();
}

export async function addTeam(eventId: string, name: string) {
  await updateDoc(doc(db, 'events', eventId), { [`teams.${newId('events')}`]: { name, order: Date.now() } });
}

export async function renameTeam(eventId: string, teamId: string, name: string) {
  await updateDoc(doc(db, 'events', eventId), { [`teams.${teamId}.name`]: name });
}

/**
 * Arma los equipos de una vez: reutiliza los equipos existentes en orden, crea los que falten,
 * borra los que sobren y asigna a cada inscrito. Todo en una sola escritura.
 */
export async function applyTeams(event: BowlingEvent, groups: { teamId: string | null; name: string; entryIds: string[] }[]) {
  const batch = writeBatch(db);
  const eventPatch: Record<string, unknown> = {};
  const used = new Set<string>();
  groups.forEach((g, i) => {
    const teamId = g.teamId ?? newId('events');
    used.add(teamId);
    if (!g.teamId) eventPatch[`teams.${teamId}`] = { name: g.name, order: Date.now() + i };
    g.entryIds.forEach((id) => batch.update(doc(db, 'entries', id), { teamId }));
  });
  Object.keys(event.teams ?? {})
    .filter((id) => !used.has(id))
    .forEach((id) => (eventPatch[`teams.${id}`] = deleteField()));
  if (Object.keys(eventPatch).length) batch.update(doc(db, 'events', event.id), eventPatch);
  await batch.commit();
}

export async function deleteTeam(eventId: string, teamId: string, memberEntryIds: string[]) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'events', eventId), { [`teams.${teamId}`]: deleteField() });
  memberEntryIds.forEach((id) => batch.update(doc(db, 'entries', id), { teamId: null }));
  await batch.commit();
}

// ---------- Fotos y verificación ----------

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
export async function saveVerifiedGames(event: BowlingEvent, photo: Omit<Photo, 'id'>, writes: VerifiedWrite[]) {
  const photoId = newId('photos');
  const batch = writeBatch(db);
  batch.set(doc(db, 'photos', photoId), { ...photo, eventId: event.id, createdAt: serverTimestamp() });
  let added = 0;
  for (const w of writes) {
    const scores = slots(w.entry?.scores, event.games, null);
    const photos = slots(w.entry?.photos, event.games, null);
    for (const [i, v] of Object.entries(w.values)) {
      scores[+i] = v;
      photos[+i] = photoId;
    }
    if (w.entry) {
      batch.update(doc(db, 'entries', w.entry.id), { scores, photos });
    } else {
      added++;
      batch.set(doc(db, 'entries', entryId(event.id, w.playerId)), {
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
  if (added) batch.update(doc(db, 'events', event.id), { playerCount: increment(added) });
  await batch.commit();
  return photoId;
}

/** Envío público de un jugador: foto + juegos, quedan pendientes de aprobación. */
export async function submitGames(input: {
  playerId: string;
  /** Evento elegido, o null para subir por fecha. */
  eventId: string | null;
  date: string | null;
  scores: (number | null)[];
  scanned: (number | null)[] | null;
  photo: Omit<Photo, 'id'>;
}) {
  const photoId = newId('photos');
  const subId = newId('submissions');
  const batch = writeBatch(db);
  batch.set(doc(db, 'photos', photoId), { ...input.photo, eventId: input.eventId, createdAt: serverTimestamp() });
  batch.set(doc(db, 'submissions', subId), {
    playerId: input.playerId,
    eventId: input.eventId,
    date: input.eventId ? null : input.date,
    scores: input.scores,
    scanned: input.scanned,
    photoId,
    status: 'pendiente',
    note: null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return subId;
}

/** Aprueba un envío: copia los juegos a la participación del jugador como verificados. */
export async function approveSubmission(
  sub: Submission,
  event: BowlingEvent,
  entry: Entry | null,
  average: number,
  values: Record<number, number>,
) {
  const batch = writeBatch(db);
  const scores = slots(entry?.scores, event.games, null);
  const photos = slots(entry?.photos, event.games, null);
  for (const [i, v] of Object.entries(values)) {
    scores[+i] = v;
    photos[+i] = sub.photoId;
  }
  if (entry) {
    batch.update(doc(db, 'entries', entry.id), { scores, photos });
  } else {
    batch.set(doc(db, 'entries', entryId(event.id, sub.playerId)), {
      eventId: event.id,
      playerId: sub.playerId,
      teamId: null,
      average,
      handicapOverride: null,
      scores,
      photos,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'events', event.id), { playerCount: increment(1) });
  }
  batch.update(doc(db, 'submissions', sub.id), { status: 'aprobado', eventId: event.id, reviewedAt: serverTimestamp() });
  // La foto de un envío por fecha queda asociada al evento (se borra con él).
  if (!sub.eventId) batch.update(doc(db, 'photos', sub.photoId), { eventId: event.id });
  await batch.commit();
}

/**
 * Evento donde se aprueba un envío por fecha: la práctica de ese día o, si no existe, se crea.
 * Devuelve el evento listo para usar en approveSubmission.
 */
export async function practiceForDate(events: BowlingEvent[], date: string, games: number): Promise<BowlingEvent> {
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
  };
  const id = await createEvent(input);
  return { id, ...input, teams: {}, playerCount: 0 };
}

export async function rejectSubmission(sub: Submission, note: string | null) {
  await updateDoc(doc(db, 'submissions', sub.id), { status: 'rechazado', note, reviewedAt: serverTimestamp() });
}
