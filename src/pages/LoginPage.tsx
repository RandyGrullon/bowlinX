import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { authErrorMessage, login, MIN_PASSWORD, signUp, useAuth } from '../lib/auth';
import { Button, Card, Field, Input, Loading, Tabs } from '../components/ui';
import { Logo } from '../components/Logo';

type Mode = 'entrar' | 'registro';

function PasswordInput({
  value,
  onChange,
  autoComplete,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={invalid ? 'border-danger pr-10' : 'pr-10'}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const { user, loading } = useAuth();
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('modo') === 'registro' ? 'registro' : 'entrar';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mientras se crea la cuenta no se redirige: el perfil (users/{uid}) todavía se está guardando.
  if (user && !busy) {
    if (loading) return <Loading />;
    // Vuelve a donde estaba (solo rutas internas); si no, a su liga.
    const next = params.get('next');
    return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }

  const mismatch = mode === 'registro' && password2 !== '' && password !== password2;
  const short = mode === 'registro' && password !== '' && password.length < MIN_PASSWORD;

  function switchMode(m: Mode) {
    setError(null);
    setPassword('');
    setPassword2('');
    const p = new URLSearchParams(params);
    if (m === 'registro') p.set('modo', 'registro');
    else p.delete('modo');
    setParams(p, { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'registro' && (password !== password2 || password.length < MIN_PASSWORD)) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'registro') await signUp(name, email, password);
      else await login(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-12" />
          <h1 className="text-2xl font-bold tracking-tight">BowlinX</h1>
          <p className="text-sm text-muted">Torneos y prácticas de boliche</p>
        </div>
        <Card className="flex flex-col gap-4 p-5">
          <Tabs
            items={[
              { key: 'entrar', label: 'Entrar' },
              { key: 'registro', label: 'Crear cuenta' },
            ]}
            active={mode}
            onChange={switchMode}
          />
          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'registro' && (
              <Field label="Tu nombre">
                <Input required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label="Correo">
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Contraseña" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined}>
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'registro' ? 'new-password' : 'current-password'}
                invalid={short}
              />
            </Field>
            {mode === 'registro' && (
              <Field label="Repite la contraseña" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}>
                <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
              </Field>
            )}
            {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={mode === 'registro' && (mismatch || short || !password2)}
              icon={mode === 'registro' ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
            >
              {mode === 'registro' ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-muted">
          {mode === 'registro'
            ? 'Después eliges quién eres en la lista de jugadores para ver tu perfil y subir tus juegos.'
            : 'Jugadores y administradores entran con su correo.'}
        </p>
      </div>
    </div>
  );
}
