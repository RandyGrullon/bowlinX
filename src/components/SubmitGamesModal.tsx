import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Grid3x3, Plus, Send, Sparkles } from 'lucide-react';
import { submitGames } from '../lib/data';
import { clearSent, draftCount, latestDraft, loadDraft, restoreDraft, saveDraft } from '../lib/draft';
import { eventTitle, parseDate, toIsoDate } from '../lib/format';
import type { CompressedImage } from '../lib/image';
import { useLeagueCtx } from '../lib/league';
import type { ScanRow } from '../lib/scan';
import { bestMatch, isValidScore } from '../lib/stats';
import type { BowlingEvent, Entry, GameFrames, Player } from '../lib/types';
import { useFeedback } from './feedback';
import { ScoreEntryModal } from './frames/ScoreEntryModal';
import { PhotoPicker } from './PhotoPicker';
import { PhotoView } from './PhotoModal';
import { Button, Field, Input, Modal, Select, Spinner, cx } from './ui';

/** Opción para subir juegos de un día sin evento creado. */
const BY_DATE = '__fecha__';
/** Cuánto se espera la respuesta del servidor antes de dar el envío por guardado (sin señal). */
const OFFLINE_WAIT_MS = 6000;

/** Juegos del borrador con al menos los del evento (J1…Jn). */
function padded(values: string[] | undefined, games = 3): string[] {
  return Array.from({ length: Math.max(games, values?.length ?? 0) }, (_, i) => values?.[i] ?? '');
}

/** Jugador: anota sus juegos (vista previa local, por total o por cuadros), adjunta la foto y lo envía al admin. */
export function SubmitGamesModal({
  open,
  onClose,
  player,
  events,
  myEntries,
  preferEventId,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
  events: BowlingEvent[];
  myEntries: Entry[];
  /** Evento que se abre elegido (desde la pantalla del evento). */
  preferEventId?: string;
}) {
  const { lid, league } = useLeagueCtx();
  const requirePhoto = league.requirePhoto !== false;
  const { toast, confirm } = useFeedback();

  const recent = useMemo(() => {
    const cutoff = Date.now() - 120 * 86400_000;
    return events.filter((e) => parseDate(e.date).getTime() >= cutoff || myEntries.some((m) => m.eventId === e.id) || e.id === preferEventId);
  }, [events, myEntries, preferEventId]);

  const [eventId, setEventId] = useState('');
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<string[]>([]);
  const [frames, setFrames] = useState<Record<string, GameFrames>>({});
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [rowIdx, setRowIdx] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [framesFor, setFramesFor] = useState<number | null>(null);
  // El borrador se guarda solo después de cargarlo al abrir (si no, se guardaría lo de la vez anterior).
  const [loaded, setLoaded] = useState(false);
  // Lo que se cargó al abrir: mientras no se toque, no se publica en vivo (abrir no es anotar).
  // Una vez que el jugador cambia algo, todo lo que sigue se publica (aunque vuelva a lo de antes).
  const loadedValues = useRef('');
  const touched = useRef(false);

  const byDate = eventId === BY_DATE;
  const event = recent.find((e) => e.id === eventId);
  // Si ese día ya hay práctica o torneo, se avisa: el admin lo pondrá ahí.
  const sameDay = byDate ? events.find((e) => e.date === date) : undefined;

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      return;
    }
    // El evento pedido; si no, donde se quedó el último borrador; si no, el más reciente que ya se jugó (o por fecha).
    const preferred = preferEventId ? recent.find((e) => e.id === preferEventId) : undefined;
    const last = preferred ? null : latestDraft(lid, player.id);
    const ev =
      preferred ??
      (last?.eventId === BY_DATE ? undefined : (recent.find((e) => e.id === last?.eventId) ?? recent.find((e) => e.date <= today)));
    const id = ev?.id ?? BY_DATE;
    const d = loadDraft(lid, player.id, id);
    setEventId(id);
    setDate(id === BY_DATE ? (d?.date ?? today) : today);
    setValues(padded(d?.values, ev?.games));
    setFrames(d?.frames ?? {});
    loadedValues.current = `${id}:${padded(d?.values, ev?.games).join('|')}`;
    touched.current = false;
    setPhoto(null);
    setRows([]);
    setRowIdx(null);
    setScanError(null);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cada evento tiene su propio borrador en el teléfono.
  useEffect(() => {
    if (!open || !loaded || !eventId) return;
    saveDraft(
      lid,
      player.id,
      eventId,
      { date: eventId === BY_DATE ? date : undefined, values, frames },
      { live: (touched.current ||= `${eventId}:${values.join('|')}` !== loadedValues.current) },
    );
  }, [open, loaded, eventId, date, values, frames, lid, player.id]);

  function changeEvent(id: string) {
    const ev = recent.find((e) => e.id === id);
    const there = loadDraft(lid, player.id, id);
    if (draftCount(there) > 0) {
      // Ese evento ya tiene juegos en el teléfono: se muestran esos (los de aquí se quedan en su evento).
      setValues(padded(there!.values, ev?.games));
      setFrames(there!.frames ?? {});
      loadedValues.current = `${id}:${padded(there!.values, ev?.games).join('|')}`;
    } else {
      // Lo anotado se pasa al evento elegido (se había elegido mal el evento).
      saveDraft(lid, player.id, eventId, null);
      setValues((v) => Array.from({ length: ev?.games ?? Math.max(3, v.length) }, (_, i) => v[i] ?? ''));
    }
    setEventId(id);
  }

  function setValue(i: number, v: string) {
    setValues((vs) => vs.map((x, j) => (j === i ? v : x)));
    // Si cambia el total a mano, los cuadros de ese juego ya no valen.
    setFrames((fs) => {
      if (!fs[i]) return fs;
      const next = { ...fs };
      delete next[i];
      return next;
    });
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
      const found = await scanScoreboard(img.scan);
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
    if (!event && !byDate) return;
    if (!photo && requirePhoto) {
      const ok = await confirm({
        title: '¿Enviar sin foto?',
        message:
          'Vas a enviar tu puntuación sin comprobación de imagen. El admin puede no aceptarla. ¿Deseas enviarla?',
        confirmText: 'Enviar sin foto',
      });
      if (!ok) return;
    }
    setSending(true);
    const draftId = eventId;
    const sent = { values: [...values], frames, date: byDate ? date : undefined };
    try {
      const kept = Object.fromEntries(Object.entries(frames).filter(([i]) => typed[+i] != null));
      const sending = submitGames(lid, {
        playerId: player.id,
        eventId: byDate ? null : event!.id,
        date: byDate ? date : null,
        scores: typed,
        scanned,
        frames: Object.keys(kept).length ? kept : null,
        photo,
      });
      // Sin señal (común en la bolera) el envío queda guardado y sale solo al volver la conexión.
      const result = await Promise.race([
        sending.then(() => 'ok' as const),
        new Promise<'sin-senal'>((r) => setTimeout(() => r('sin-senal'), OFFLINE_WAIT_MS)),
      ]);
      clearSent(lid, player.id, draftId, sent.values);
      if (result === 'ok') {
        toast('Enviado. Un admin lo revisará.');
      } else {
        toast('Sin señal: tus juegos se envían solos cuando vuelva la conexión.');
        sending.catch((e) => {
          console.error(e);
          restoreDraft(lid, player.id, draftId, sent);
          toast('No se pudieron enviar tus juegos. Siguen en tu teléfono: vuelve a enviarlos.', 'error');
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast('No se pudo enviar. Revisa tu conexión e intenta de nuevo.', 'error');
    } finally {
      setSending(false);
    }
  }

  const dateOk = !byDate || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  const canSend = (!!event || byDate) && dateOk && hasTyped && !invalid && !scanning;

  return (
    <>
      <Modal
        open={open && framesFor == null}
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
                <div key={i} className="flex w-16 flex-col items-center gap-1">
                  <span className="text-[11px] text-muted">J{i + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={300}
                    value={v}
                    aria-label={`Juego ${i + 1}`}
                    onChange={(e) => setValue(i, e.target.value)}
                    className={cx(
                      'h-11 w-full rounded-lg border bg-surface text-center text-base font-semibold tabular-nums',
                      v.trim() && !isValidScore(Number(v)) ? 'border-danger text-danger' : frames[i] ? 'border-accent' : 'border-line',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setFramesFor(i)}
                    className={cx('flex items-center gap-0.5 text-[11px] font-medium', frames[i] ? 'text-accent' : 'text-muted hover:text-fg')}
                  >
                    <Grid3x3 className="size-3" /> cuadros
                  </button>
                </div>
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
            <span className="text-xs text-muted">
              Vista previa guardada en este teléfono.{' '}
              {requirePhoto
                ? 'Adjunta la foto del marcador para que el admin lo compruebe. Sin foto se puede enviar, pero quizá no lo acepte.'
                : 'La foto es opcional en esta liga; un admin lo aprueba.'}
            </span>
          </div>

          {!photo ? (
            <PhotoPicker onPicked={onPicked} label={requirePhoto ? 'Adjuntar foto del marcador' : 'Adjuntar foto (opcional)'} />
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
                      onClick={() => {
                        setValues(Array.from({ length: Math.max(values.length, scanned.length) }, (_, i) => String(scanned[i] ?? '')));
                        setFrames({});
                      }}
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
      <ScoreEntryModal
        open={framesFor != null}
        onClose={() => setFramesFor(null)}
        title={`Juego ${(framesFor ?? 0) + 1}`}
        resetKey={String(framesFor)}
        initial={{
          score: framesFor != null && values[framesFor]?.trim() ? Number(values[framesFor]) : null,
          frames: framesFor != null ? (frames[framesFor] ?? null) : null,
        }}
        saveText="Listo"
        onSave={(v) => {
          if (framesFor == null) return;
          const i = framesFor;
          setValues((vs) => vs.map((x, j) => (j === i ? (v.score == null ? '' : String(v.score)) : x)));
          setFrames((fs) => {
            const next = { ...fs };
            if (v.frames) next[i] = v.frames;
            else delete next[i];
            return next;
          });
          setFramesFor(null);
        }}
      />
    </>
  );
}
