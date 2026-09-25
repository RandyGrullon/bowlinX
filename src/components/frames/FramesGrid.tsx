import { scoreGame } from '../../lib/bowling';
import { cx } from '../ui';

/** Hoja de 10 cuadros: marcas de cada tiro arriba y el acumulado abajo. */
export function FramesGrid({
  rolls,
  cursor,
  onPick,
  compact,
}: {
  rolls: readonly number[];
  /** Cuadro que se está anotando (se resalta). */
  cursor?: number | null;
  onPick?: (frame: number) => void;
  compact?: boolean;
}) {
  const game = scoreGame(rolls);
  return (
    <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_minmax(0,1.45fr)] overflow-hidden rounded-xl border border-line bg-surface text-center tabular-nums">
      {Array.from({ length: 10 }, (_, f) => {
        const frame = game.frames[f];
        const slots = f === 9 ? 3 : 2;
        const marks = frame?.marks ?? [];
        // Un strike en los cuadros 1–9 se dibuja en la casilla de la derecha, como en la pantalla de la bolera.
        const cells = f < 9 && marks[0] === 'X' ? ['', 'X'] : Array.from({ length: slots }, (_, k) => marks[k] ?? '');
        const Tag = onPick ? 'button' : 'div';
        return (
          <Tag
            key={f}
            type={onPick ? 'button' : undefined}
            onClick={onPick ? () => onPick(f) : undefined}
            className={cx(
              'flex min-w-0 flex-col border-line',
              f > 0 && 'border-l',
              cursor === f && 'bg-accent-soft',
              onPick && 'transition hover:bg-surface-2',
            )}
          >
            <span className={cx('border-b border-line text-[10px] text-muted', compact ? 'leading-4' : 'leading-5')}>{f + 1}</span>
            <span className="flex justify-end">
              {cells.map((m, k) => (
                <span
                  key={k}
                  className={cx(
                    'flex flex-1 items-center justify-center font-semibold',
                    compact ? 'h-5 text-[11px]' : 'h-6 text-xs',
                    k > 0 && 'border-l border-line',
                    m === 'X' || m === '/' ? 'text-accent' : '',
                  )}
                >
                  {m}
                </span>
              ))}
            </span>
            <span className={cx('border-t border-line font-bold', compact ? 'h-5 text-xs leading-5' : 'h-7 text-sm leading-7')}>
              {frame?.total ?? ''}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
