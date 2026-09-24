import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button, Modal, cx } from './ui';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmText?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (text: string, tone?: Toast['tone']) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2800);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setPending(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <Modal
        open={pending != null}
        onClose={() => close(false)}
        title={pending?.title}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancelar</Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.confirmText ?? 'Aceptar'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{pending?.message}</div>
      </Modal>
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'animate-fade-up pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg',
              t.tone === 'ok' ? 'bg-fg text-bg' : 'bg-danger text-white',
            )}
          >
            {t.tone === 'ok' ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}

/** Ejecuta una escritura mostrando el error si falla. */
export function useAction() {
  const { toast } = useFeedback();
  return useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : String(e);
        toast(/permission/i.test(msg) ? 'Sin permiso para guardar. ¿Sesión de admin activa?' : 'No se pudo guardar. Intenta de nuevo.', 'error');
        return undefined;
      }
    },
    [toast],
  );
}
