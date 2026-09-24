import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { toIsoDate } from './format';
import { db } from './firebase';

/** Colecciones que entran al respaldo. Las fotos no (pesan mucho); los juegos guardan qué foto los verificó. */
const COLLECTIONS = ['players', 'events', 'entries', 'submissions', 'users'] as const;

const plain = (v: unknown): unknown =>
  v instanceof Timestamp
    ? v.toDate().toISOString()
    : Array.isArray(v)
      ? v.map(plain)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
        : v;

/** Admin: descarga todos los datos del club en un archivo JSON (respaldo gratis, sin plan de pago). */
export async function downloadBackup() {
  const data: Record<string, unknown[]> = {};
  for (const name of COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    data[name] = snap.docs.map((d) => ({ id: d.id, ...(plain(d.data()) as object) }));
  }
  const blob = new Blob([JSON.stringify({ app: 'BowlinX', exportedAt: new Date().toISOString(), ...data }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bowlinx-respaldo-${toIsoDate(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Object.fromEntries(COLLECTIONS.map((c) => [c, data[c].length]));
}
