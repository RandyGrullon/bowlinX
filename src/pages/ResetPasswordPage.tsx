import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, KeyRound, TriangleAlert } from 'lucide-react';
import { applyEmailCode, authErrorMessage, checkResetCode, finishReset, MIN_PASSWORD } from '../lib/auth';
import { Logo } from '../components/Logo';
import { PasswordInput } from '../components/PasswordInput';
import { useFeedback } from '../components/feedback';
import { Button, Card, Field, Loading } from '../components/ui';

type State = { step: 'checking' } | { step: 'form'; email: string } | { step: 'done'; message: string } | { step: 'error'; message: string };

/**
 * Adonde lleva el link de los correos de Firebase (URL de acción personalizada: /cambiar-clave).
 * Sobre todo "olvidé mi contraseña": revisa el link, pide la nueva dos veces y entra de una.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const mode = params.get('mode');
  const code = params.get('oobCode') ?? '';
  const [state, setState] = useState<State>({ step: 'checking' });
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const fail = (e: unknown) => alive && setState({ step: 'error', message: authErrorMessage(e) });
    if (!code) {
      setState({ step: 'error', message: 'Este link no está completo. Ábrelo otra vez desde el correo.' });
    } else if (mode === 'resetPassword') {
      checkResetCode(code)
        .then((email) => alive && setState({ step: 'form', email }))
        .catch(fail);
    } else if (mode === 'verifyEmail' || mode === 'recoverEmail') {
      applyEmailCode(code)
        .then(
          () =>
            alive &&
            setState({
              step: 'done',
              message:
                mode === 'verifyEmail'
                  ? 'Tu correo quedó verificado.'
                  : 'Se restauró tu correo anterior. Por seguridad, cambia tu contraseña.',
            }),
        )
        .catch(fail);
    } else {
      setState({ step: 'error', message: 'Este link no es válido.' });
    }
    return () => {
      alive = false;
    };
  }, [mode, code]);

  const short = password !== '' && password.length < MIN_PASSWORD;
  const mismatch = password2 !== '' && password !== password2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (state.step !== 'form' || short || mismatch || !password2) return;
    setBusy(true);
    setError(null);
    try {
      await finishReset(code, state.email, password);
      toast('Contraseña cambiada. ¡Ya entraste!');
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="size-12" />
          <h1 className="text-2xl font-bold tracking-tight">BowlinX</h1>
        </div>
        {state.step === 'checking' ? (
          <Loading label="Revisando el link…" />
        ) : state.step === 'form' ? (
          <Card className="animate-fade-up flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <KeyRound className="size-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">Contraseña nueva</h2>
                <p className="truncate text-sm text-muted">{state.email}</p>
              </div>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Contraseña nueva" hint={short ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined}>
                <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" invalid={short} autoFocus />
              </Field>
              <Field label="Repítela" hint={mismatch ? 'Las contraseñas no coinciden.' : undefined}>
                <PasswordInput value={password2} onChange={setPassword2} autoComplete="new-password" invalid={mismatch} />
              </Field>
              {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" variant="primary" loading={busy} disabled={short || mismatch || !password || !password2} icon={<KeyRound className="size-4" />}>
                Guardar y entrar
              </Button>
            </form>
          </Card>
        ) : (
          <Card className="animate-fade-up flex flex-col items-center gap-3 p-6 text-center">
            {state.step === 'done' ? <CheckCircle2 className="size-10 text-ok" /> : <TriangleAlert className="size-10 text-warn" />}
            <p className="text-sm">{state.message}</p>
            <Link to="/login" className="text-sm font-medium text-accent">
              Ir a entrar
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
