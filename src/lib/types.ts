export type EventType = 'torneo' | 'practica';

/** Cómo se ordena una clasificación: con handicap o solo pinos (scratch). */
export type RankBy = 'hcp' | 'scratch';

/** Marca de juegos cargados del Excel histórico: cuentan como verificados aunque no tengan foto. */
export const IMPORTED = 'importado';

export interface Player {
  id: string;
  name: string;
  /** Promedio fijado a mano; null = se calcula con sus juegos verificados. */
  averageOverride: number | null;
  /** Cuenta vinculada (users/{uid}); sin cuenta = null o ausente. */
  uid?: string | null;
}

export type Role = 'jugador' | 'admin';

/** Cuenta de la app (users/{uid}). Se crea al registrarse; el jugador se vincula después. */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  playerId: string | null;
  role: Role;
}

export interface Team {
  name: string;
  order: number;
}

export interface BowlingEvent {
  id: string;
  type: EventType;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  games: number;
  /** Handicap = (hcpBase - promedio) * hcpPercent / 100. Solo torneos. */
  hcpBase: number;
  hcpPercent: number;
  teams: Record<string, Team>;
  playerCount: number;
  /** Torneo 2025: individual con handicap y equipos por scratch. */
  individualRankBy?: RankBy;
  teamRankBy?: RankBy;
  /** Promedio mínimo para categoría A, B y C (debajo es D). */
  categoryCuts?: [number, number, number];
  /** Asistencia confirmada por los jugadores (práctica): playerId → true. */
  rsvp?: Record<string, boolean>;
}

/** Participación de un jugador en un evento. id = `${eventId}_${playerId}`. */
export interface Entry {
  id: string;
  eventId: string;
  playerId: string;
  teamId: string | null;
  /** Promedio con el que entró al evento (congelado para el handicap del torneo). */
  average: number;
  handicapOverride: number | null;
  /** Pinos por juego (índice = juego - 1). */
  scores: (number | null)[];
  /** Foto que verifica cada juego (o IMPORTED). null = borrador: no cuenta en estadísticas. */
  photos: (string | null)[];
}

export type SubmissionStatus = 'pendiente' | 'aprobado' | 'rechazado';

/** Juegos que un jugador sube desde su página; esperan aprobación del admin. */
export interface Submission {
  id: string;
  playerId: string;
  /** Evento donde jugó; null si lo subió por fecha (no había evento creado). */
  eventId: string | null;
  /** Día que jugó (YYYY-MM-DD) cuando no hay evento: se aprueba en la práctica de ese día. */
  date?: string | null;
  /** Lo que anotó el jugador. */
  scores: (number | null)[];
  /** Lo que leyó la IA en la foto para ese jugador (null si no pudo). */
  scanned: (number | null)[] | null;
  photoId: string;
  status: SubmissionStatus;
  note: string | null;
  createdAt?: { toMillis(): number } | null;
}

export interface Photo {
  id: string;
  /** data URL JPEG comprimida */
  data: string;
  width: number;
  height: number;
}
