import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-bowlinx-reglas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});

afterAll(() => env.cleanup());

const leagueData = (ownerUid: string, visibility: 'public' | 'private') => ({
  name: visibility === 'public' ? 'Liga Abierta' : 'Liga del Banco',
  visibility,
  ownerUid,
  venue: 'Bolera',
  schedule: 'Martes 7 pm',
  seasonStart: '2026-01-01',
  seasonEnd: '2026-12-31',
  contactName: 'Org',
  contactPhone: '18095550000',
  requirePhoto: true,
});

const member = (lid: string, uid: string, role: string, playerId: string | null = null) => ({
  leagueId: lid,
  uid,
  name: uid.replace('u-', ''),
  role,
  playerId,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Liga privada "priv": dueño org, admin sofi, miembro luis (jugador luis), miembro ana sin jugador.
    await setDoc(doc(db, 'leagues/priv'), leagueData('u-org', 'private'));
    await setDoc(doc(db, 'leagues/priv/private/invite'), { code: 'ABCD2345' });
    await setDoc(doc(db, 'invites/ABCD2345'), { leagueId: 'priv', leagueName: 'Liga del Banco' });
    await setDoc(doc(db, 'members/priv_u-org'), member('priv', 'u-org', 'owner'));
    await setDoc(doc(db, 'members/priv_u-sofi'), member('priv', 'u-sofi', 'admin'));
    await setDoc(doc(db, 'members/priv_u-luis'), member('priv', 'u-luis', 'member', 'luis'));
    await setDoc(doc(db, 'members/priv_u-ana'), member('priv', 'u-ana', 'member'));
    await setDoc(doc(db, 'leagues/priv/players/pedro'), { name: 'Pedro', averageOverride: null });
    await setDoc(doc(db, 'leagues/priv/players/luis'), { name: 'Luis', averageOverride: null, uid: 'u-luis' });
    await setDoc(doc(db, 'leagues/priv/events/e1'), { type: 'practica', name: '', date: '2026-09-22', games: 3, teams: {}, playerCount: 0 });
    await setDoc(doc(db, 'leagues/priv/entries/e1_luis'), { eventId: 'e1', playerId: 'luis', scores: [150], photos: [null] });
    // Liga pública "pub" de otro dueño, que no exige foto.
    await setDoc(doc(db, 'leagues/pub'), { ...leagueData('u-otro', 'public'), requirePhoto: false });
    await setDoc(doc(db, 'members/pub_u-otro'), member('pub', 'u-otro', 'owner'));
    await setDoc(doc(db, 'leagues/pub/players/p1'), { name: 'Jugador Uno', averageOverride: null });
    await setDoc(doc(db, 'leagues/pub/events/e9'), { type: 'torneo', name: 'Copa', date: '2026-10-01', games: 3, teams: {}, playerCount: 0 });
    await setDoc(doc(db, 'users/u-luis'), { email: 'luis@x.com', name: 'Luis' });
    await setDoc(doc(db, 'users/u-ana'), { email: 'ana@x.com', name: 'Ana' });
    await setDoc(doc(db, 'users/u-dios2'), { email: 'dios2@x.com', name: 'Dios Dos', superadmin: true });
  });
});

const as = (uid: string, email = `${uid.replace('u-', '')}@x.com`) => env.authenticatedContext(uid, { email }).firestore() as unknown as Firestore;
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const dios = () => as('u-root', 'admin@admin.com');
const dios2 = () => as('u-dios2');
const org = () => as('u-org');
const sofi = () => as('u-sofi');
const luis = () => as('u-luis');
const ana = () => as('u-ana');
const extra = () => as('u-new');

const photo = (eventId: string | null = 'e1') => ({ data: 'data:image/jpeg;base64,AAAA', width: 10, height: 10, eventId });
const sub = (playerId: string, photoId: string | null, eventId = 'e1') => ({
  playerId,
  eventId,
  date: null,
  scores: [150, 160, 170],
  scanned: null,
  frames: { '0': { rolls: [10, 10, 10] } },
  photoId,
  status: 'pendiente',
  note: null,
});

function sendGames(db: Firestore, lid: string, playerId: string, extraFields: Record<string, unknown> = {}, eventId = 'e1') {
  const b = writeBatch(db);
  b.set(doc(db, `leagues/${lid}/photos/f1`), { ...photo(eventId), createdAt: serverTimestamp() });
  b.set(doc(db, `leagues/${lid}/submissions/s1`), { ...sub(playerId, 'f1', eventId), createdAt: serverTimestamp(), ...extraFields });
  return b.commit();
}

function createLeague(db: Firestore, uid: string, lid = 'nueva', data: Record<string, unknown> = {}) {
  const b = writeBatch(db);
  b.set(doc(db, `leagues/${lid}`), { ...leagueData(uid, 'private'), ...data, createdAt: serverTimestamp() });
  b.set(doc(db, `members/${lid}_${uid}`), { ...member(lid, uid, 'owner'), joinedAt: serverTimestamp() });
  return b.commit();
}

const join = (db: Firestore, lid: string, uid: string, code?: string) =>
  setDoc(doc(db, `members/${lid}_${uid}`), { ...member(lid, uid, 'member'), joinedAt: serverTimestamp(), ...(code ? { code } : {}) });

describe('visibilidad', () => {
  it('una liga pública se ve sin login, con todo su contenido', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'leagues/pub')));
    await assertSucceeds(getDocs(collection(anon(), 'leagues/pub/events')));
    await assertSucceeds(getDocs(collection(anon(), 'leagues/pub/players')));
    await assertSucceeds(getDocs(query(collection(anon(), 'leagues'), where('visibility', '==', 'public'))));
  });
  it('una liga privada no se ve sin ser miembro', async () => {
    await assertFails(getDoc(doc(anon(), 'leagues/priv')));
    await assertFails(getDoc(doc(extra(), 'leagues/priv')));
    await assertFails(getDocs(collection(extra(), 'leagues/priv/entries')));
    await assertFails(getDocs(collection(anon(), 'leagues')));
  });
  it('los miembros ven su liga privada y la lista de miembros', async () => {
    await assertSucceeds(getDoc(doc(ana(), 'leagues/priv')));
    await assertSucceeds(getDocs(collection(ana(), 'leagues/priv/entries')));
    await assertSucceeds(getDocs(query(collection(ana(), 'members'), where('leagueId', '==', 'priv'))));
    await assertFails(getDocs(query(collection(extra(), 'members'), where('leagueId', '==', 'priv'))));
  });
  it('cada quien ve sus membresías y el superadmin todo', async () => {
    await assertSucceeds(getDocs(query(collection(extra(), 'members'), where('uid', '==', 'u-new'))));
    await assertSucceeds(getDoc(doc(extra(), 'members/priv_u-new')));
    await assertSucceeds(getDocs(collection(dios(), 'leagues')));
    await assertSucceeds(getDocs(collection(dios2(), 'leagues/priv/entries')));
    await assertSucceeds(getDocs(collection(dios(), 'users')));
    await assertFails(getDocs(collection(sofi(), 'users')));
  });
  it('el código vigente solo lo leen los admins de la liga', async () => {
    await assertSucceeds(getDoc(doc(sofi(), 'leagues/priv/private/invite')));
    await assertFails(getDoc(doc(luis(), 'leagues/priv/private/invite')));
    await assertSucceeds(getDoc(doc(anon(), 'invites/ABCD2345')));
    await assertFails(getDocs(collection(anon(), 'invites')));
  });
});

describe('crear ligas y unirse', () => {
  it('cualquiera con cuenta crea una liga y queda como dueño', async () => {
    await assertSucceeds(createLeague(extra(), 'u-new'));
  });
  it('también un torneo sin liga, y después crea el torneo adentro', async () => {
    const db = extra();
    await assertSucceeds(createLeague(db, 'u-new', 'copa', { kind: 'torneo', visibility: 'public' }));
    await assertSucceeds(setDoc(doc(db, 'leagues/copa/events/t1'), { type: 'torneo', name: 'Copa', date: '2026-11-01', games: 3, teams: {}, playerCount: 0 }));
    await assertFails(createLeague(db, 'u-new', 'raro', { kind: 'club' }));
  });
  it('no se crea una liga a nombre de otro, sin dueño o con campos raros', async () => {
    await assertFails(createLeague(anon(), 'u-new'));
    await assertFails(createLeague(extra(), 'u-new', 'x2', { ownerUid: 'u-org' }));
    await assertFails(createLeague(extra(), 'u-new', 'x3', { visibility: 'secreta' }));
    await assertFails(createLeague(extra(), 'u-new', 'x4', { hack: true }));
    // sin la membresía de dueño en el mismo lote
    await assertFails(setDoc(doc(extra(), 'leagues/x5'), { ...leagueData('u-new', 'public'), createdAt: serverTimestamp() }));
  });
  it('no puede hacerse dueño de una liga que ya existe', async () => {
    await assertFails(setDoc(doc(extra(), 'members/priv_u-new'), { ...member('priv', 'u-new', 'owner'), joinedAt: serverTimestamp() }));
  });
  it('a una pública se une cualquiera; a una privada solo con el código', async () => {
    await assertSucceeds(join(extra(), 'pub', 'u-new'));
    await assertFails(join(as('u-otra'), 'priv', 'u-otra'));
    await assertFails(join(as('u-otra'), 'priv', 'u-otra', 'MALO2345'));
    await assertSucceeds(join(extra(), 'priv', 'u-new', 'ABCD2345'));
  });
  it('no se une como admin ni por otra persona', async () => {
    await assertFails(setDoc(doc(extra(), 'members/pub_u-new'), { ...member('pub', 'u-new', 'admin'), joinedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(extra(), 'members/pub_u-otra'), { ...member('pub', 'u-otra', 'member'), joinedAt: serverTimestamp() }));
  });
  it('los admins cambian el código de invitación', async () => {
    const db = sofi();
    const b = writeBatch(db);
    b.delete(doc(db, 'invites/ABCD2345'));
    b.set(doc(db, 'invites/NUEVO234'), { leagueId: 'priv', leagueName: 'Liga del Banco', createdAt: serverTimestamp() });
    b.set(doc(db, 'leagues/priv/private/invite'), { code: 'NUEVO234' });
    await assertSucceeds(b.commit());
    // un miembro no puede fabricar códigos
    const m = luis();
    const c = writeBatch(m);
    c.set(doc(m, 'invites/LUIS2345'), { leagueId: 'priv', leagueName: 'x', createdAt: serverTimestamp() });
    c.set(doc(m, 'leagues/priv/private/invite'), { code: 'LUIS2345' });
    await assertFails(c.commit());
  });
});

describe('roles en la liga', () => {
  it('el dueño y los admins nombran o quitan admins, pero no tocan al dueño', async () => {
    await assertSucceeds(updateDoc(doc(org(), 'members/priv_u-ana'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(sofi(), 'members/priv_u-luis'), { role: 'admin' }));
    await assertFails(updateDoc(doc(sofi(), 'members/priv_u-org'), { role: 'member' }));
    await assertFails(updateDoc(doc(sofi(), 'members/priv_u-ana'), { role: 'owner' }));
  });
  it('un miembro no se sube de rol', async () => {
    await assertFails(updateDoc(doc(ana(), 'members/priv_u-ana'), { role: 'admin' }));
  });
  it('el admin de una liga no administra otra', async () => {
    await assertFails(setDoc(doc(org(), 'leagues/pub/events/x'), { type: 'torneo' }));
    await assertFails(updateDoc(doc(org(), 'leagues/pub'), { name: 'Mía' }));
  });
  it('el superadmin administra cualquier liga y nombra superadmins', async () => {
    await assertSucceeds(setDoc(doc(dios(), 'leagues/pub/events/x'), { type: 'torneo' }));
    await assertSucceeds(updateDoc(doc(dios2(), 'leagues/priv'), { name: 'Liga Renombrada' }));
    await assertFails(updateDoc(doc(org(), 'users/u-ana'), { superadmin: true }));
    await assertFails(updateDoc(doc(ana(), 'users/u-ana'), { superadmin: true }));
    await assertSucceeds(updateDoc(doc(dios(), 'users/u-ana'), { superadmin: true }));
  });
  it('los admins editan la liga pero no cambian el dueño', async () => {
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv'), { venue: 'Otra bolera', requirePhoto: false }));
    await assertFails(updateDoc(doc(sofi(), 'leagues/priv'), { ownerUid: 'u-sofi' }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv'), { venue: 'x' }));
  });
  it('solo el dueño (o el superadmin) borra la liga', async () => {
    await assertFails(deleteDoc(doc(sofi(), 'leagues/priv')));
    // Como en la app: primero el contenido y los demás miembros; al final su membresía y la liga juntas.
    const db = org();
    const b = writeBatch(db);
    ['pedro', 'luis'].forEach((p) => b.delete(doc(db, `leagues/priv/players/${p}`)));
    b.delete(doc(db, 'leagues/priv/events/e1'));
    b.delete(doc(db, 'leagues/priv/entries/e1_luis'));
    ['u-sofi', 'u-luis', 'u-ana'].forEach((u) => b.delete(doc(db, `members/priv_${u}`)));
    b.delete(doc(db, 'invites/ABCD2345'));
    b.delete(doc(db, 'leagues/priv/private/invite'));
    await assertSucceeds(b.commit());
    const last = writeBatch(db);
    last.delete(doc(db, 'members/priv_u-org'));
    last.delete(doc(db, 'leagues/priv'));
    await assertSucceeds(last.commit());
  });
  it('salir de la liga: cualquiera menos el dueño; un admin saca miembros', async () => {
    await assertFails(deleteDoc(doc(sofi(), 'members/priv_u-org')));
    await assertSucceeds(deleteDoc(doc(ana(), 'members/priv_u-ana')));
    await assertSucceeds(deleteDoc(doc(sofi(), 'members/priv_u-luis')));
    await assertFails(deleteDoc(doc(luis(), 'members/priv_u-sofi')));
  });
});

describe('vincular jugador', () => {
  it('un miembro reclama un jugador libre (jugador + membresía juntos)', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/pedro'), { uid: 'u-ana' });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'pedro' });
    await assertSucceeds(b.commit());
  });
  it('no reclama un jugador que ya tiene cuenta ni uno de otra liga', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: 'u-ana' });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'luis' });
    await assertFails(b.commit());
    const c = writeBatch(db);
    c.update(doc(db, 'leagues/pub/players/p1'), { uid: 'u-ana' });
    c.update(doc(db, 'members/priv_u-ana'), { playerId: 'p1' });
    await assertFails(c.commit());
  });
  it('crea su propio jugador si no está en la lista', async () => {
    const db = ana();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/players/nuevo'), { name: 'Ana', averageOverride: null, uid: 'u-ana', createdAt: serverTimestamp() });
    b.update(doc(db, 'members/priv_u-ana'), { playerId: 'nuevo' });
    await assertSucceeds(b.commit());
  });
  it('quien ya tiene jugador no crea otro', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/players/otro'), { name: 'Luis 2', averageOverride: null, uid: 'u-luis', createdAt: serverTimestamp() });
    await assertFails(b.commit());
  });
  it('al salir suelta su jugador', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.update(doc(db, 'leagues/priv/players/luis'), { uid: null });
    b.delete(doc(db, 'members/priv_u-luis'));
    await assertSucceeds(b.commit());
  });
});

describe('juegos', () => {
  it('solo los admins de la liga anotan en participaciones', async () => {
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/entries/e1_luis'), { scores: [200] }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/entries/e1_luis'), { scores: [300] }));
  });
  it('un miembro envía juegos de su jugador con foto y cuadros', async () => {
    await assertSucceeds(sendGames(luis(), 'priv', 'luis'));
  });
  it('no envía juegos de otro jugador, ni sin jugador, ni aprobados', async () => {
    await assertFails(sendGames(luis(), 'priv', 'pedro'));
    await assertFails(sendGames(ana(), 'priv', 'pedro'));
    await assertFails(sendGames(luis(), 'priv', 'luis', { status: 'aprobado' }));
  });
  it('sin foto solo si la liga no la exige', async () => {
    await assertFails(
      setDoc(doc(luis(), 'leagues/priv/submissions/s2'), { ...sub('luis', null), createdAt: serverTimestamp() }),
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'members/pub_u-luis'), member('pub', 'u-luis', 'member', 'p1'));
    });
    await assertSucceeds(
      setDoc(doc(luis(), 'leagues/pub/submissions/s2'), { ...sub('p1', null, 'e9'), createdAt: serverTimestamp() }),
    );
  });
  it('por fecha, sin evento', async () => {
    const db = luis();
    const b = writeBatch(db);
    b.set(doc(db, 'leagues/priv/photos/f2'), { ...photo(null), createdAt: serverTimestamp() });
    b.set(doc(db, 'leagues/priv/submissions/s3'), { ...sub('luis', 'f2'), eventId: null, date: '2026-09-15', createdAt: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
  it('solo los admins aprueban', async () => {
    await sendGames(luis(), 'priv', 'luis');
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/submissions/s1'), { status: 'aprobado' }));
    await assertSucceeds(updateDoc(doc(sofi(), 'leagues/priv/submissions/s1'), { status: 'aprobado' }));
  });
  it('asistencia: cada quien marca solo su "voy"', async () => {
    await assertSucceeds(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.luis': true }));
    await assertSucceeds(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.luis': deleteField() }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { 'rsvp.pedro': true }));
    await assertFails(updateDoc(doc(ana(), 'leagues/priv/events/e1'), { 'rsvp.ana': true }));
    await assertFails(updateDoc(doc(luis(), 'leagues/priv/events/e1'), { name: 'hack' }));
  });
});

describe('cuentas', () => {
  it('crea su perfil sin flag de superadmin', async () => {
    await assertSucceeds(setDoc(doc(extra(), 'users/u-new'), { email: 'new@x.com', name: 'Nuevo', createdAt: serverTimestamp() }));
    await assertFails(
      setDoc(doc(as('u-new2'), 'users/u-new2'), { email: 'new2@x.com', name: 'Nuevo', superadmin: true, createdAt: serverTimestamp() }),
    );
  });
  it('cambia su nombre pero no se hace superadmin', async () => {
    await assertSucceeds(updateDoc(doc(ana(), 'users/u-ana'), { name: 'Ana María' }));
    await assertFails(updateDoc(doc(ana(), 'users/u-ana'), { superadmin: true }));
  });
});
