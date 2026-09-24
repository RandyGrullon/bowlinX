import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bowlinx-reglas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'players/pedro'), { name: 'Pedro', averageOverride: null });
    await setDoc(doc(db, 'players/luis'), { name: 'Luis', averageOverride: null, uid: 'u-luis' });
    await setDoc(doc(db, 'events/e1'), { type: 'practica', name: '', date: '2026-09-22', games: 3, teams: {}, playerCount: 0 });
    await setDoc(doc(db, 'users/u-luis'), { email: 'luis@x.com', name: 'Luis', playerId: 'luis', role: 'jugador' });
    await setDoc(doc(db, 'users/u-ana'), { email: 'ana@x.com', name: 'Ana', playerId: null, role: 'jugador' });
    await setDoc(doc(db, 'users/u-org'), { email: 'org@x.com', name: 'Org', playerId: null, role: 'admin' });
  });
});

const as = (uid: string, email: string) => env.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const fixedAdmin = () => as('u-root', 'admin@admin.com');
const luis = () => as('u-luis', 'luis@x.com');
const ana = () => as('u-ana', 'ana@x.com');
const org = () => as('u-org', 'org@x.com');

const photo = { data: 'data:image/jpeg;base64,AAAA', width: 10, height: 10, eventId: 'e1' };
const sub = (playerId: string, photoId: string) => ({
  playerId,
  eventId: 'e1',
  scores: [150, 160, 170],
  scanned: null,
  photoId,
  status: 'pendiente',
  note: null,
});

function sendGames(db: Firestore, playerId: string, extra: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, 'photos/f1'), { ...photo, createdAt: serverTimestamp() });
  b.set(doc(db, 'submissions/s1'), { ...sub(playerId, 'f1'), createdAt: serverTimestamp(), ...extra });
  return b.commit();
}

describe('sin sesión', () => {
  it('lee jugadores, eventos y juegos (página pública)', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'players/pedro')));
    await assertSucceeds(getDocs(collection(anon(), 'events')));
    await assertSucceeds(getDocs(collection(anon(), 'entries')));
  });
  it('no envía juegos ni fotos, ni lee cuentas', async () => {
    await assertFails(sendGames(anon(), 'pedro'));
    await assertFails(getDoc(doc(anon(), 'users/u-luis')));
  });
});

describe('registro', () => {
  it('crea su cuenta como jugador sin vincular', async () => {
    const db = as('u-new', 'new@x.com');
    await assertSucceeds(
      setDoc(doc(db, 'users/u-new'), { email: 'new@x.com', name: 'Nuevo', playerId: null, role: 'jugador', createdAt: serverTimestamp() }),
    );
  });
  it('no puede registrarse como admin, con otro correo ni ya vinculado', async () => {
    const db = as('u-new', 'new@x.com');
    const base = { email: 'new@x.com', name: 'Nuevo', playerId: null, role: 'jugador', createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(db, 'users/u-new'), { ...base, role: 'admin' }));
    await assertFails(setDoc(doc(db, 'users/u-new'), { ...base, email: 'otro@x.com' }));
    await assertFails(setDoc(doc(db, 'users/u-new'), { ...base, playerId: 'pedro' }));
    await assertFails(setDoc(doc(db, 'users/u-otro'), base));
  });
  it('cada quien lee su cuenta; solo el admin lee todas', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'users/u-ana')));
    await assertFails(getDoc(doc(ana(), 'users/u-luis')));
    await assertSucceeds(getDocs(collection(fixedAdmin(), 'users')));
    await assertSucceeds(getDocs(collection(org(), 'users')));
  });
  it('no puede cambiarse el rol', async () => {
    await assertFails(updateDoc(doc(ana(), 'users/u-ana'), { role: 'admin' }));
  });
});

describe('vincular cuenta con jugador', () => {
  function claim(db: Firestore, uid: string, playerId: string) {
    const b = writeBatch(db);
    b.update(doc(db, 'players', playerId), { uid });
    b.update(doc(db, 'users', uid), { playerId });
    return b.commit();
  }
  it('reclama un jugador sin cuenta', async () => {
    await assertSucceeds(claim(ana(), 'u-ana', 'pedro'));
  });
  it('no reclama un jugador que ya tiene cuenta', async () => {
    await assertFails(claim(ana(), 'u-ana', 'luis'));
  });
  it('no reclama un segundo jugador si ya está vinculado', async () => {
    await assertFails(claim(luis(), 'u-luis', 'pedro'));
  });
  it('no marca el jugador sin vincular su cuenta en la misma escritura', async () => {
    await assertFails(updateDoc(doc(ana(), 'players/pedro'), { uid: 'u-ana' }));
  });
  it('crea su propio jugador si no está en la lista', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.set(doc(db, 'players/nuevo'), { name: 'Ana', averageOverride: null, uid: 'u-ana', createdAt: serverTimestamp() });
    b.update(doc(db, 'users/u-ana'), { playerId: 'nuevo' });
    await assertSucceeds(b.commit());
  });
  it('no se pone promedio al crear su jugador', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.set(doc(db, 'players/nuevo'), { name: 'Ana', averageOverride: 220, uid: 'u-ana', createdAt: serverTimestamp() });
    b.update(doc(db, 'users/u-ana'), { playerId: 'nuevo' });
    await assertFails(b.commit());
  });
  it('el admin desvincula', async () => {
    const db = fixedAdmin();
    const b = writeBatch(db);
    b.update(doc(db, 'players/luis'), { uid: null });
    b.update(doc(db, 'users/u-luis'), { playerId: null });
    await assertSucceeds(b.commit());
  });
});

describe('subir juegos', () => {
  it('el jugador vinculado envía los suyos con foto', async () => {
    await assertSucceeds(sendGames(luis(), 'luis'));
  });
  it('no envía juegos de otro jugador', async () => {
    await assertFails(sendGames(luis(), 'pedro'));
  });
  it('sin jugador vinculado no envía', async () => {
    await assertFails(sendGames(ana(), 'pedro'));
  });
  it('sube juegos de un día sin evento (por fecha)', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'photos/f2'), { ...photo, eventId: null, createdAt: serverTimestamp() });
    b.set(doc(db, 'submissions/s2'), { ...sub('luis', 'f2'), eventId: null, date: '2026-09-20', createdAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  it('por fecha exige una fecha válida y no ambas cosas', async () => {
    const send = (extra: Record<string, unknown>) => {
      const db = luis();
      const b = writeBatch(db);
      b.set(doc(db, 'photos/f3'), { ...photo, eventId: null, createdAt: serverTimestamp() });
      b.set(doc(db, 'submissions/s3'), { ...sub('luis', 'f3'), createdAt: serverTimestamp(), ...extra });
      return b.commit();
    };
    await assertFails(send({ eventId: null }));
    await assertFails(send({ eventId: null, date: 'ayer' }));
    await assertFails(send({ eventId: 'e1', date: '2026-09-20' }));
  });
  it('no se autoaprueba', async () => {
    await assertFails(sendGames(luis(), 'luis', { status: 'aprobado' }));
  });
  it('no aprueba envíos ni toca juegos o eventos', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'submissions/s9'), sub('luis', 'f1')));
    await assertFails(updateDoc(doc(luis(), 'submissions/s9'), { status: 'aprobado' }));
    await assertFails(setDoc(doc(luis(), 'entries/e1_luis'), { eventId: 'e1', playerId: 'luis', scores: [300] }));
    await assertFails(updateDoc(doc(luis(), 'events/e1'), { name: 'x' }));
    await assertFails(updateDoc(doc(luis(), 'players/luis'), { averageOverride: 250 }));
  });
});

describe('asistencia a la práctica', () => {
  it('el jugador marca y quita su propio "voy"', async () => {
    await assertSucceeds(updateDoc(doc(luis(), 'events/e1'), { 'rsvp.luis': true }));
    await assertSucceeds(updateDoc(doc(luis(), 'events/e1'), { 'rsvp.luis': deleteField() }));
  });
  it('no marca a otro jugador ni toca otra cosa del evento', async () => {
    await assertFails(updateDoc(doc(luis(), 'events/e1'), { 'rsvp.pedro': true }));
    await assertFails(updateDoc(doc(luis(), 'events/e1'), { 'rsvp.luis': true, name: 'x' }));
    await assertFails(updateDoc(doc(luis(), 'events/e1'), { 'rsvp.luis': 'quizas' }));
  });
  it('sin jugador vinculado no confirma', async () => {
    await assertFails(updateDoc(doc(ana(), 'events/e1'), { 'rsvp.pedro': true }));
    await assertFails(updateDoc(doc(anon(), 'events/e1'), { 'rsvp.pedro': true }));
  });
});

describe('admins', () => {
  it('el admin fijo y el nombrado por rol administran', async () => {
    await assertSucceeds(updateDoc(doc(fixedAdmin(), 'events/e1'), { name: 'Martes' }));
    await assertSucceeds(updateDoc(doc(org(), 'events/e1'), { name: 'Martes 2' }));
    await assertSucceeds(updateDoc(doc(org(), 'users/u-ana'), { role: 'admin' }));
  });
});
