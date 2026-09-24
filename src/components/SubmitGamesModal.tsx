import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Send, Sparkles } from 'lucide-react';
import { submitGames } from '../lib/data';
import { eventTitle, parseDate, toIsoDate } from '../lib/format';
import type { CompressedImage } from '../lib/image';
import type { ScanRow } from '../lib/scan';
import { bestMatch, isValidScore } from '../lib/stats';
import type { BowlingEvent, Entry, Player } from '../lib/types';
import { useFeedback } from './feedback';
import { PhotoPicker } from './PhotoPicker';
import { PhotoView } from './PhotoModal';
import { Button, Field, Input, Modal, Select, Spinner, cx } from './ui';

const draftKey = (playerId: string) => `bowlinx:borrador:${playerId}`;
/** Opción para subir juegos de un día sin evento creado. */
const BY_DATE = '__fecha__';

interface Draft {
  eventId: string;
  date?: string;
  values: string[];
}

function loadDraft(playerId: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(playerId)) ?? 'null');
  } catch {
    return null;
  }
}

function saveDraft(playerId: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(draftKey(playerId), JSON.stringify(d));
    else localStorage.removeItem(draftKey(playerId));
  } catch {
    // almacenamiento no disponible (modo privado): la vista previa solo vive en pantalla
  }
}

/** Jugador: anota sus juegos (vista previa local), adjunta la foto, se escanea y se envía al admin. */
export function SubmitGamesModal({
  open,
  onClose,
  player,
  events,
  myEntries,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
  events: BowlingEvent[];
  myEntries: Entry[];
}) {
  const { toast } = useFeedback();
  const recent = useMemo(() => {
    const cutoff = Date.now() - 120 * 86400_000;
    return events.filter((e) => parseDate(e.date).getTime() >= cutoff || myEntries.some((m) => m.eventId === e.id));
  }, [events, myEntries]);

  const [eventId, setEventId] = useState('');
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<string[]>([]);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [rowIdx, setRowIdx] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const byDate = eventId === BY_DATE;
  const event = recent.find((e) => e.id === eventId);
  // Si ese día ya hay práctica o torneo, se avisa: el admin lo pondrá ahí.
  const sameDay = byDate ? events.find((e) => e.date === date) : undefined;

  useEffect(() => {
    if (!open) return;
    const d = loadDraft(player.id);
    if (d?.eventId === BY_DATE) {
      setEventId(BY_DATE);
      setDate(d.date ?? today);
      setValues(d.values);
    } else {
      // Por defecto, el evento más reciente que ya se jugó (no uno futuro); si no hay, por fecha.
      const ev = recent.find((e) => e.id === d?.eventId) ?? recent.find((e) => e.date <= today);
      setEventId(ev?.id ?? BY_DATE);
      setDate(today);
      setValues(d && ev && d.eventId === ev.id ? d.values : Array(ev?.games ?? 3).fill(''));
    }
    setPhoto(null);
    setRows([]);
    setRowIdx(null);
    setScanError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && eventId) saveDraft(player.id, { eventId, date, values });
  }, [open, eventId, date, values, player.id]);

  function changeEvent(id: string) {
    const ev = recent.find((e) => e.id === id);
    setEventId(id);
    setValues((v) => Array.from({ length: ev?.games ?? Math.max(3, v.length) }, (_, i) => v[i] ?? ''));
  }

  const scannedRow = rowIdx != null ? rows[rowIdx] ?? null : null;
  const scanned = scannedRow?.games ?? null;
  // Juegos por posición (J1, J2...): vacío = no lo jugó.
  const typed = values.map((v) => (v.trim() === '' ? null : Number(v)));
  while (typed.length && typed[typed.length - 1] == null) typed.pop();
  const hasTyped = typed.some((v) => v != null);
  const invalid = typed.some((v) => v != null && !isValidScore(v));
  const differs =
    scanned != null && hasTyped && Array.from({ length: Math.max(typed.length, scanned.length) }, (_, i) => (typed[i] ?? null) !== (scanned[i] ?? null)).some(Boolean);
  const showGames = (gs: (number | null)[]) => gs.map((g) => g ?? '–').join(' · ');

  async function onPicked(img: CompressedImage) {
    setPhoto(img);
    setScanError(null);
    setRows([]);
    setRowIdx(null);
    setScanning(true);
    const { scanScoreboard, ScanError } = await import('../lib/scan');
    try {
      const found = await scanScoreboard(img.data);
      setRows(found);
      const match = bestMatch(player.name, found);
      const idx = match ? found.indexOf(match) : found.length === 1 ? 0 : null;
      setRowIdx(idx);
      if (idx != null && !hasTyped) {
        setValues(Array.from({ length: Math.max(values.length, found[idx].games.length) }, (_, i) => String(found[idx].games[i] ?? '')));
      }
      if (idx == null) setScanError('No encontramos tu nombre en la foto. Elige cuál fila eres.');
    } catch (e) {
      setScanError(e instanceof ScanError ? `${e.message} Igual puedes enviarla; el admin la revisará.` : 'No se pudo escanear la foto.');
    } finally {
      setScanning(false);
    }
  }

  async function send() {
    if ((!event && !byDate) || !photo) return;
    setSending(true);
    try {
      await submitGames({
        playerId: player.id,
        eventId: byDate ? null : event!.id,
        date: byDate ? date : null,
        scores: typed,
        scanned,
        photo,
      });
      saveDraft(player.id, null);
      toast('Enviado. El admin lo revisará.');
      onClose();
    } catch (e) {
      console.error(e);
      toast('No se pudo enviar. Revisa tu conexión e intenta de nuevo.', 'error');
    } finally {
      setSending(false);
    }
  }

  const dateOk = !byDate || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  const canSend = (!!event || byDate) && dateOk && !!photo && hasTyped && !invalid && !scanning;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subir mis juegos"
      footer={
        <>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="primary" icon={<Send className="size-4" />} disabled={!canSend} loading={sending} onClick={send}>
            Enviar para aprobar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="¿Dónde jugaste?">
          <Select value={eventId} onChange={(e) => changeEvent(e.target.value)}>
            {recent.map((e) => (
              <option key={e.id} value={e.id}>
                {eventTitle(e)}
              </option>
            ))}
            <option value={BY_DATE}>Otro día (elegir fecha)</option>
          </Select>
        </Field>
        {byDate && (
          <Field
            label="¿Qué día jugaste?"
            hint={
              sameDay
                ? `Ese día hay ${eventTitle(sameDay)}; el admin pondrá tus juegos ahí.`
                : 'El admin pondrá tus juegos en la práctica de ese día (se crea si no existe).'
            }
          >
            <Input type="date" max={today} required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Tus juegos</span>
          <div className="flex flex-wrap gap-2">
            {values.map((v, i) => (
              <label key={i} className="flex w-16 flex-col items-center gap-1">
                <span className="text-[11px] text-muted">J{i + 1}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={300}
                  value={v}
                  onChange={(e) => setValues((vs) => vs.map((x, j) => (j === i ? e.target.value : x)))}
                  className={cx(
                    'h-11 w-full rounded-lg border bg-surface text-center text-base font-semibold tabular-nums',
                    v.trim() && !isValidScore(Number(v)) ? 'border-danger text-danger' : 'border-line',
                  )}
                />
              </label>
            ))}
            {byDate && values.length < 10 && (
              <button
                type="button"
                onClick={() => setValues((v) => [...v, ''])}
                className="mt-5 flex size-11 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:text-fg"
                aria-label="Agregar otro juego"
              >
                <Plus className="size-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-muted">Vista previa guardada en este teléfono. Para que cuente, adjunta la foto y envíala.</span>
        </div>

        {!photo ? (
          <PhotoPicker onPicked={onPicked} label="Adjuntar foto del marcador" />
        ) : (
          <div className="flex flex-col gap-3">
            <PhotoView src={photo.data} />
            {scanning && (
              <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
                <Spinner className="text-accent" /> Leyendo la foto…
              </div>
            )}
            {scanError && (
              <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {scanError}
              </div>
            )}
            {rows.length > 1 && (
              <Field label="Tu fila en la foto">
                <Select value={rowIdx ?? ''} onChange={(e) => setRowIdx(e.target.value === '' ? null : +e.target.value)}>
                  <option value="">— Elegir —</option>
                  {rows.map((r, i) => (
                    <option key={i} value={i}>
                      {r.name}: {showGames(r.games)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {scanned && (
              <div className={cx('flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-sm', differs ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')}>
                {differs ? <Sparkles className="size-4" /> : <CheckCircle2 className="size-4" />}
                <span>
                  La foto dice <b className="tabular-nums">{showGames(scanned)}</b>
                  {scannedRow?.matchesTotal === true && ` (cuadra con el total ${scannedRow.total})`}
                  {differs ? ', distinto a lo que anotaste.' : '. Coincide con lo que anotaste.'}
                </span>
                {differs && (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => setValues(Array.from({ length: Math.max(values.length, scanned.length) }, (_, i) => String(scanned[i] ?? '')))}
                  >
                    Usar lo de la foto
                  </Button>
                )}
              </div>
            )}
            <PhotoPicker compact label="Cambiar foto" onPicked={onPicked} />
          </div>
        )}
      </div>
    </Modal>
  );
}
