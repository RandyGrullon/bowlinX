import { useEffect, useState } from 'react';
import { Delete, Eraser, Grid3x3, Hash, Minus, Plus, SlidersHorizontal, Target } from 'lucide-react';
import { bitCount, scoreGame, standingMask, standingNow } from '../../lib/bowling';
import { isValidScore } from '../../lib/stats';
import type { GameFrames } from '../../lib/types';
import { Button, Input, cx } from '../ui';
import { FramesGrid } from './FramesGrid';
import { PinDeck } from './PinDeck';

export interface ScoreValue {
  score: number | null;
  /** Tiros del juego si se anotó por cuadros. */
  frames: GameFrames | null;
}

type Mode = 'pines' | 'teclado' | 'total';
const MODE_KEY = 'bowlinx:modo-anotar';

function savedMode(): Mode | null {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'pines' || m === 'teclado' || m === 'total' ? m : null;
  } catch {
    return null;
  }
}

/**
 * Anotar un juego de 3 formas:
 * - Pines: se tocan los pines que cayeron en cada tiro y la hoja se calcula sola.
 * - Teclado: se escribe cada tiro (X, /, números); se bloquea lo imposible (tras un 8 solo 0, 1 o spare).
 * - Total: solo el puntaje final, con la barra o escribiéndolo.
 */
export function FrameEditor({ initial, onChange }: { initial: ScoreValue; onChange: (v: ScoreValue & { ready: boolean }) => void }) {
  const [mode, setMode] = useState<Mode>(() =>
    initial.frames?.rolls.length ? (initial.frames.masks?.some((m) => m != null) ? 'pines' : 'teclado') : initial.score != null ? 'total' : (savedMode() ?? 'teclado'),
  );
  const [rolls, setRolls] = useState<number[]>(initial.frames?.rolls ?? []);
  const [masks, setMasks] = useState<(number | null)[]>(initial.frames?.masks ?? initial.frames?.rolls.map(() => null) ?? []);
  const [total, setTotal] = useState(initial.score != null ? String(initial.score) : '');
  const [knocked, setKnocked] = useState(0);

  const game = scoreGame(rolls);
  const now = standingNow(rolls);

  useEffect(() => {
    if (mode === 'total') {
      const n = total.trim() === '' ? null : Number(total);
      onChange({ score: n, frames: null, ready: n != null && isValidScore(n) });
    } else {
      const withMasks = masks.some((m) => m != null);
      onChange({
        score: game.complete ? game.score : null,
        frames: rolls.length ? { rolls, ...(withMasks ? { masks } : {}) } : null,
        ready: game.complete,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rolls, masks, total]);

  function pickMode(m: Mode) {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // sin almacenamiento
    }
    if (m === 'total' && game.complete && total.trim() === '') setTotal(String(game.score));
    setKnocked(0);
    setMode(m);
  }

  function push(pins: number, mask: number | null) {
    setRolls((r) => [...r, pins]);
    setMasks((ms) => [...ms, mask]);
    setKnocked(0);
  }

  function undo() {
    setRolls((r) => r.slice(0, -1));
    setMasks((ms) => ms.slice(0, -1));
    setKnocked(0);
  }

  function clear() {
    setRolls([]);
    setMasks([]);
    setKnocked(0);
  }

  const remaining = game.frames.length && !game.complete ? 10 - game.frames.filter((f) => f.total != null).length : 0;
  const standing = standingMask(rolls, masks);

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ['pines', 'Pines', <Target key="p" className="size-4" />],
            ['teclado', 'Teclado', <Grid3x3 key="t" className="size-4" />],
            ['total', 'Total', <SlidersHorizontal key="s" className="size-4" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => pickMode(key)}
            className={cx(
              'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
              mode === key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {mode !== 'total' && (
        <>
          <FramesGrid rolls={rolls} cursor={now?.frame ?? null} />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted">
              {game.complete ? (
                <span className="font-medium text-ok">Juego completo</span>
              ) : now ? (
                <>
                  Cuadro <b className="text-fg">{now.frame + 1}</b>, tiro <b className="text-fg">{now.roll + 1}</b>
                  {remaining > 0 && rolls.length > 0 && ` · faltan ${remaining}`}
                </>
              ) : null}
            </span>
            <span className="text-2xl font-bold tabular-nums">{rolls.length ? game.score : '—'}</span>
          </div>
        </>
      )}

      {mode === 'pines' && (
        <div className="flex flex-col gap-3">
          <PinDeck
            standing={standing}
            knocked={knocked}
            disabled={!now}
            onToggle={(bit) => setKnocked((k) => k ^ bit)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!now} onClick={() => push(0, 0)}>
              Ninguno (−)
            </Button>
            <Button disabled={!now} onClick={() => push(bitCount(standing), standing)}>
              {now?.fresh ? 'Strike (X)' : 'Spare (/)'}
            </Button>
          </div>
          <Button variant="primary" disabled={!now || knocked === 0} onClick={() => push(bitCount(knocked), knocked)}>
            {knocked ? `Anotar ${bitCount(knocked)} ${bitCount(knocked) === 1 ? 'pin' : 'pines'}` : 'Toca los pines que cayeron'}
          </Button>
        </div>
      )}

      {mode === 'teclado' && (
        <Keypad
          standing={now?.standing ?? -1}
          fresh={now?.fresh ?? false}
          onRoll={(n) => push(n, null)}
        />
      )}

      {mode !== 'total' && rolls.length > 0 && (
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" icon={<Delete className="size-4" />} onClick={undo}>
            Deshacer tiro
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" icon={<Eraser className="size-4" />} onClick={clear}>
            Empezar de nuevo
          </Button>
        </div>
      )}

      {mode === 'total' && <TotalInput value={total} onChange={setTotal} />}
    </div>
  );
}

/** Teclado de tiros: desactiva lo imposible según los pinos que quedan parados. */
function Keypad({ standing, fresh, onRoll }: { standing: number; fresh: boolean; onRoll: (n: number) => void }) {
  const over = standing < 0;
  const key = (label: string, value: number, enabled: boolean, accent?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={!enabled}
      onClick={() => onRoll(value)}
      className={cx(
        'h-12 rounded-xl text-lg font-bold transition select-none active:scale-95 disabled:opacity-25',
        accent ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg hover:brightness-95',
      )}
    >
      {label}
    </button>
  );
  // Segundo tiro: solo menos de los que quedan (el que tumba todos es spare "/").
  const digit = (d: number) => key(String(d), d, !over && (fresh ? d <= 9 : d < standing));
  return (
    <div className="grid grid-cols-4 gap-2">
      {digit(7)}
      {digit(8)}
      {digit(9)}
      {key('X', 10, !over && fresh, true)}
      {digit(4)}
      {digit(5)}
      {digit(6)}
      {key('/', standing, !over && !fresh && standing > 0, true)}
      {digit(1)}
      {digit(2)}
      {digit(3)}
      {key('−', 0, !over)}
    </div>
  );
}

/** Puntaje final: barra para arrastrar o número escrito. */
function TotalInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = value.trim() === '' ? null : Number(value);
  const invalid = n != null && !isValidScore(n);
  const set = (v: number) => onChange(String(Math.min(300, Math.max(0, Math.round(v)))));
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-center gap-3">
        <Button size="md" aria-label="Menos" icon={<Minus className="size-4" />} onClick={() => set((n ?? 150) - 1)} />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={300}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Puntaje del juego"
          className={cx('h-16 w-32 text-center text-4xl! font-bold tabular-nums', invalid && 'border-danger text-danger')}
          placeholder="0"
        />
        <Button size="md" aria-label="Más" icon={<Plus className="size-4" />} onClick={() => set((n ?? 150) + 1)} />
      </div>
      <input
        type="range"
        min={0}
        max={300}
        step={1}
        value={n != null && !invalid ? n : 150}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Arrastra para el puntaje"
        className="w-full accent-[var(--accent)]"
      />
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>0</span>
        <span className="flex items-center gap-1">
          <Hash className="size-3" /> Arrastra o escribe
        </span>
        <span>300</span>
      </div>
    </div>
  );
}
