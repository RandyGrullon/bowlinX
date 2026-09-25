import { useMemo, useSyncExternalStore } from 'react';
import type { GameFrames } from './types';

/**
 * Juegos que el jugador va anotando en su teléfono antes de enviarlos a revisión.
 * Se guardan en el teléfono (funciona sin señal en la bolera), uno por evento, y se borran al enviarlos.
 */
export interface GameDraft {
  /** Evento donde jugó, o '__fecha__' si sube juegos de un día sin evento. */
  eventId: string;
  date?: string;
  /** Pinos por juego como texto ('' = sin jugar). */
  values: string[];
  /** Cuadros de los juegos anotados tiro por tiro (clave = índice del juego). */
  frames?: Record<string, GameFrames>;
  /** Cuándo se guardó (para volver al último al abrir "Subir mis juegos"). */
  savedAt?: number;
}

const prefix = (lid: string, playerId: string) => `bowlinx:borrador:${lid}:${playerId}`;
const key = (lid: string, playerId: string, eventId: string) => `${prefix(lid, playerId)}:${eventId}`;
/** Antes había un solo borrador por liga (sin el evento en la clave): se sigue leyendo. */
const legacyKey = prefix;
/** Aviso interno para que las pantallas abiertas vean el borrador nuevo al momento. */
const CHANGED = 'bowlingx:borrador';

function readRaw(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function parse(raw: string | null): GameDraft | null {
  try {
    const d = JSON.parse(raw ?? 'null') as GameDraft | null;
    return d && typeof d.eventId === 'string' && Array.isArray(d.values) ? d : null;
  } catch {
    return null;
  }
}

/** Juegos anotados que tiene el borrador (los que no están vacíos). */
export const draftCount = (d: GameDraft | null) => d?.values.filter((v) => v.trim() !== '').length ?? 0;

function pick(raw: string | null, legacyRaw: string | null, eventId: string): GameDraft | null {
  const d = parse(raw);
  if (d) return d;
  const old = parse(legacyRaw);
  return old && old.eventId === eventId ? old : null;
}

/** Borrador del jugador en ese evento. */
export function loadDraft(lid: string, playerId: string, eventId: string): GameDraft | null {
  return pick(readRaw(key(lid, playerId, eventId)), readRaw(legacyKey(lid, playerId)), eventId);
}

/** El borrador con juegos guardado más recientemente en la liga (para abrir "Subir mis juegos" donde se quedó). */
export function latestDraft(lid: string, playerId: string): GameDraft | null {
  const p = `${prefix(lid, playerId)}:`;
  let best = parse(readRaw(legacyKey(lid, playerId)));
  if (!draftCount(best)) best = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(p)) continue;
      const d = parse(readRaw(k));
      if (d && draftCount(d) > 0 && (!best || (d.savedAt ?? 0) >= (best.savedAt ?? 0))) best = d;
    }
  } catch {
    // almacenamiento no disponible
  }
  return best;
}

/** Guarda el borrador de ese evento; sin juegos anotados (o null), lo borra. */
export function saveDraft(lid: string, playerId: string, eventId: string, d: Pick<GameDraft, 'values' | 'frames' | 'date'> | null) {
  try {
    if (d && d.values.some((v) => v.trim() !== '')) {
      localStorage.setItem(key(lid, playerId, eventId), JSON.stringify({ ...d, eventId, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(key(lid, playerId, eventId));
    }
    // El borrador viejo de este evento ya quedó en su lugar nuevo.
    if (parse(readRaw(legacyKey(lid, playerId)))?.eventId === eventId) localStorage.removeItem(legacyKey(lid, playerId));
  } catch {
    // almacenamiento no disponible (modo privado): el borrador solo vive en pantalla
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Quita del borrador los juegos que se enviaron (los que siguen igual): si mientras se enviaba
 * se anotó otro juego, ese se queda en el teléfono.
 */
export function clearSent(lid: string, playerId: string, eventId: string, sent: string[]) {
  const cur = loadDraft(lid, playerId, eventId);
  if (!cur) return;
  const wasSent = (i: number) => (cur.values[i] ?? '').trim() !== '' && cur.values[i] === sent[i];
  saveDraft(lid, playerId, eventId, {
    ...cur,
    values: cur.values.map((v, i) => (wasSent(i) ? '' : v)),
    frames: Object.fromEntries(Object.entries(cur.frames ?? {}).filter(([i]) => !wasSent(+i))),
  });
}

/** Vuelve a poner en el teléfono lo que no se pudo enviar (sin pisar lo anotado después). */
export function restoreDraft(lid: string, playerId: string, eventId: string, sent: Pick<GameDraft, 'values' | 'frames' | 'date'>) {
  const cur = loadDraft(lid, playerId, eventId);
  const length = Math.max(sent.values.length, cur?.values.length ?? 0);
  const values = Array.from({ length }, (_, i) => (cur?.values[i]?.trim() ? cur.values[i] : (sent.values[i] ?? '')));
  saveDraft(lid, playerId, eventId, { date: sent.date, values, frames: { ...(sent.frames ?? {}), ...(cur?.frames ?? {}) } });
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** El borrador del jugador en ese evento, en vivo (se actualiza al guardar un juego desde cualquier pantalla). */
export function useDraft(lid: string, playerId: string | null | undefined, eventId: string): GameDraft | null {
  const snapshot = useSyncExternalStore(subscribe, () =>
    playerId ? JSON.stringify([readRaw(key(lid, playerId, eventId)), readRaw(legacyKey(lid, playerId))]) : '',
  );
  return useMemo(() => {
    if (!snapshot) return null;
    const [raw, legacyRaw] = JSON.parse(snapshot) as [string | null, string | null];
    return pick(raw, legacyRaw, eventId);
  }, [snapshot, eventId]);
}
