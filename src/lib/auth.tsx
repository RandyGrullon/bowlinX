import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { isFixedAdmin } from './admins';
import { auth, db } from './firebase';
import { hideSplash } from './splash';
import type { UserProfile } from './types';

interface AuthState {
  user: User | null;
  /** Cuenta en users/{uid}; null para admins fijos sin perfil o mientras no exista. */
  profile: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
}

const initial: AuthState = { user: null, profile: null, isAdmin: false, loading: true };
const Ctx = createContext<AuthState>(initial);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initial);

  // La animación de apertura se va cuando ya se sabe quién es el usuario.
  useEffect(() => {
    if (!state.loading) hideSplash();
  }, [state.loading]);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = undefined;
      if (!user) {
        setState({ user: null, profile: null, isAdmin: false, loading: false });
        return;
      }
      const fixed = isFixedAdmin(user.email);
      setState({ user, profile: null, isAdmin: fixed, loading: true });
      // El perfil manda el rol y el jugador vinculado; se escucha en vivo (vincular, nombrar admin).
      stopProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const profile = snap.exists() ? ({ id: snap.id, ...snap.data() } as UserProfile) : null;
          setState({ user, profile, isAdmin: fixed || profile?.role === 'admin', loading: false });
        },
        () => setState({ user, profile: null, isAdmin: fixed, loading: false }),
      );
    });
    return () => {
      stopProfile?.();
      stopAuth();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export const login = (email: string, password: string) => signInWithEmailAndPassword(auth, email.trim(), password);

export const logout = () => signOut(auth);

/** Perfil de la cuenta en users/{uid}: jugador sin vincular. También sirve para cuentas creadas en la consola. */
export async function createProfile(user: User, name: string) {
  await updateProfile(user, { displayName: name.trim() });
  await setDoc(doc(db, 'users', user.uid), {
    email: user.email,
    name: name.trim(),
    playerId: null,
    role: 'jugador',
    createdAt: serverTimestamp(),
  });
}

/** Registro con correo y contraseña, sin verificación de correo. Crea la cuenta como jugador sin vincular. */
export async function signUp(name: string, email: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  try {
    await createProfile(user, name);
  } catch (e) {
    // Sin perfil la cuenta queda a medias: se borra para que pueda volver a registrarse con el mismo correo.
    await deleteUser(user).catch(() => undefined);
    throw e;
  }
}

export const MIN_PASSWORD = 6;

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'Correo o contraseña incorrectos.';
  if (code.includes('invalid-email')) return 'Ese correo no es válido.';
  if (code.includes('email-already-in-use')) return 'Ya existe una cuenta con ese correo. Entra con tu contraseña.';
  if (code.includes('weak-password') || code.includes('password-does-not-meet'))
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (/operation-not-allowed|admin-restricted-operation/.test(code))
    return 'El registro de cuentas está desactivado. Pídele al admin que lo active en Firebase.';
  if (code.includes('too-many-requests')) return 'Demasiados intentos. Espera unos minutos.';
  if (code.includes('network')) return 'Sin conexión. Revisa tu internet.';
  if (/api-key|invalid-api-key/.test(code)) return 'La configuración de Firebase no es válida (API key). Revisa las variables en Vercel.';
  if (code.includes('permission-denied')) return 'No se pudo crear tu perfil (permisos). Avísale al admin.';
  return 'No se pudo completar. Intenta de nuevo.';
}
