import { useEffect, useState, type KeyboardEvent } from 'react';
import { Camera, CheckCircle2 } from 'lucide-react';
import { isValidScore } from '../lib/stats';
import { cx } from './ui';

/**
 * Casilla de pinos de un juego. Guarda al salir (blur/Enter) como borrador.
 * Si el juego ya está verificado con foto, queda bloqueada y muestra el check.
 */
export function ScoreInput({
  value,
  verified,
  row,
  col,
  onCommit,
  onOpenPhoto,
  label,
}: {
  value: number | null;
  verified: boolean;
  row: number;
  col: number;
  onCommit: (v: number | null) => void;
  onOpenPhoto: () => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value == null ? '' : String(value));
  }, [value, focused]);

  if (verified) {
    return (
      <button
        type="button"
        onClick={onOpenPhoto}
        title="Verificado (toca para ver la foto)"
        aria-label={`${label}: ${value}, verificado`}
        className="relative flex h-10 w-full min-w-14 items-center justify-center rounded-lg border border-ok/40 bg-ok-soft font-semibold text-ok tabular-nums"
      >
        {value}
        <CheckCircle2 className="absolute top-0.5 right-0.5 size-3" />
      </button>
    );
  }

  const n = draft.trim() === '' ? null : Number(draft);
  const invalid = n != null && !isValidScore(n);

  function commit() {
    if (invalid) {
      setDraft(value == null ? '' : String(value));
      return;
    }
    if (n !== value) onCommit(n);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Baja al siguiente jugador en el mismo juego (así se anota juego por juego).
      const next = document.querySelector<HTMLInputElement>(`input[data-row="${row + 1}"][data-col="${col}"]`);
      if (next) next.focus();
      else e.currentTarget.blur();
    }
    if (e.key === 'Escape') {
      setDraft(value == null ? '' : String(value));
      e.currentTarget.blur();
    }
  }

  return (
    <div className="relative w-full min-w-14">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={300}
        aria-label={label}
        data-row={row}
        data-col={col}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={onKey}
        className={cx(
          'h-10 w-full rounded-lg border bg-surface text-center text-base font-medium tabular-nums sm:text-sm',
          'focus:outline-none focus:ring-2 focus:ring-accent/40',
          invalid ? 'border-danger text-danger' : value != null ? 'border-dashed border-warn text-fg' : 'border-line',
        )}
      />
      {value != null && !focused && (
        <Camera className="pointer-events-none absolute top-0.5 right-0.5 size-3 text-warn" aria-label="Falta foto" />
      )}
    </div>
  );
}
