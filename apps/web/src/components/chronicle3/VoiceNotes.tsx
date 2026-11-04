import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Download, FileText, Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import type { JournalMedia } from "@/types";

const MAX_SECONDS = 600;
const R = { borderRadius: 3 };

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Forma de onda real do áudio gravado (decodificada no navegador, nada é enviado). */
function useWaveform(dataUri: string, bars = 48) {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    fetch(dataUri)
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audio) => {
        const ch = audio.getChannelData(0);
        const step = Math.max(1, Math.floor(ch.length / bars));
        const out: number[] = [];
        for (let i = 0; i < bars; i++) {
          let max = 0;
          for (let j = i * step; j < Math.min(ch.length, (i + 1) * step); j += 32) max = Math.max(max, Math.abs(ch[j]!));
          out.push(max);
        }
        const top = Math.max(0.01, ...out);
        if (!cancelled) setPeaks(out.map((v) => v / top));
      })
      .catch(() => !cancelled && setPeaks(null))
      .finally(() => void ctx.close().catch(() => undefined));
    return () => {
      cancelled = true;
    };
  }, [dataUri, bars]);
  return peaks;
}

function VoiceItem({ m, onRemove, onTranscribe, canTranscribe }: { m: JournalMedia; onRemove: () => void; onTranscribe: () => Promise<void>; canTranscribe: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [rate, setRate] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const peaks = useWaveform(m.dataUri);
  const dur = m.durationSeconds ?? 0;
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (ref.current) ref.current.playbackRate = next;
  };
  const ext = (m.mimeType ?? m.dataUri.slice(5, m.dataUri.indexOf(";"))).split("/")[1]?.split(";")[0] ?? "webm";
  return (
    <li className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={R}>
      <div className="flex items-center gap-2">
        <button type="button" onClick={toggle} className="flex h-9 w-9 shrink-0 items-center justify-center border border-rpg-pink/60 text-rpg-pink" style={{ borderRadius: 999 }} aria-label={playing ? "Pausar nota de voz" : "Reproduzir nota de voz"}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-rpg-text">{m.caption || "Nota de voz"} · {fmt(dur)}</p>
          <div className="mt-1 flex h-6 items-center gap-[2px]" aria-hidden>
            {(peaks ?? Array.from({ length: 48 }, () => 0.25)).map((p, i) => (
              <span key={i} className={clsx("w-[3px] flex-1", dur && i / 48 < pos / dur ? "bg-rpg-pink" : "bg-rpg-purple/50")} style={{ height: `${Math.max(12, p * 100)}%` }} />
            ))}
          </div>
        </div>
        <button type="button" onClick={cycleRate} className="shrink-0 border border-rpg-border px-1.5 py-0.5 font-pixel text-[10px] text-rpg-text" style={R} aria-label={`Velocidade ${rate}x`}>
          {rate.toLocaleString("pt-BR")}x
        </button>
        <a href={m.dataUri} download={`nota-de-voz.${ext}`} className="shrink-0 p-1 text-rpg-muted hover:text-rpg-gold-light" aria-label="Baixar nota de voz">
          <Download size={15} />
        </a>
        {canTranscribe && (
          <button type="button" disabled={busy} onClick={() => (setBusy(true), void onTranscribe().finally(() => setBusy(false)))} className="shrink-0 p-1 text-rpg-muted hover:text-rpg-purple disabled:opacity-50" aria-label="Transcrever com IA" title="Transcrever com IA (pede autorização)">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
          </button>
        )}
        {confirm ? (
          <span className="flex items-center gap-1 text-[10px]">
            <button type="button" className="text-rpg-red" onClick={onRemove}>
              Excluir
            </button>
            <button type="button" className="text-rpg-muted" onClick={() => setConfirm(false)}>
              Não
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="shrink-0 p-1 text-rpg-muted hover:text-rpg-red" aria-label="Excluir nota de voz">
            <Trash2 size={15} />
          </button>
        )}
      </div>
      <audio ref={ref} src={m.dataUri} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => (setPlaying(false), setPos(0))} onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)} className="hidden" />
    </li>
  );
}

/**
 * Notas de voz 3.0: gravar (com pausa), ouvir com velocidade, baixar, excluir e
 * transcrever opcionalmente. O microfone só é pedido ao clicar em gravar; no
 * app desktop (Tauri/WebView2) e no navegador usamos a mesma API MediaRecorder.
 */
export function VoiceNotes({
  media,
  onAdd,
  onRemove,
  isUploading,
  onTranscribe,
  aiAllowed,
}: {
  media: JournalMedia[];
  onAdd: (dataUri: string, durationSeconds: number) => Promise<unknown>;
  onRemove: (id: string) => void;
  isUploading: boolean;
  onTranscribe: (m: JournalMedia) => Promise<void>;
  aiAllowed: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState<number[]>(Array.from({ length: 24 }, () => 0));
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

  const cleanup = () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    if (timer.current) window.clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
  };
  useEffect(() => cleanup, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
      const r = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.onstop = () => {
        // O servidor aceita "data:audio/<tipo>;base64," — removemos parâmetros de codec do tipo.
        const type = (r.mimeType || "audio/webm").split(";")[0]!;
        const blob = new Blob(chunks.current, { type });
        const reader = new FileReader();
        const seconds = Math.max(1, elapsedRef.current);
        reader.onloadend = () => {
          if (typeof reader.result === "string") void onAdd(reader.result, seconds).catch(() => setError("Não foi possível salvar a nota de voz (tamanho ou formato)."));
        };
        reader.readAsDataURL(blob);
        cleanup();
      };
      // Medidor de nível ao vivo (só local).
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtx.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 64;
        ctx.createMediaStreamSource(stream).connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const tick = () => {
          an.getByteFrequencyData(data);
          setLevel(Array.from({ length: 24 }, (_, i) => (data[i] ?? 0) / 255));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      }
      rec.current = r;
      r.start(1000);
      elapsedRef.current = 0;
      setElapsed(0);
      setState("recording");
      timer.current = window.setInterval(() => {
        if (rec.current?.state !== "recording") return;
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
        if (elapsedRef.current >= MAX_SECONDS) stop();
      }, 1000);
    } catch {
      setError("Permissão do microfone negada ou indisponível. Libere o microfone nas configurações do navegador ou do Windows.");
    }
  };
  const elapsedRef = useRef(0);
  const pause = () => {
    if (rec.current?.state === "recording") {
      rec.current.pause();
      setState("paused");
    } else if (rec.current?.state === "paused") {
      rec.current.resume();
      setState("recording");
    }
  };
  const stop = () => {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    setState("idle");
  };

  return (
    <div className="space-y-2">
      {!supported ? (
        <p className="text-xs text-rpg-muted">Este navegador não permite gravar áudio. Use um navegador atualizado ou o app desktop.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {state === "idle" ? (
            <button type="button" onClick={() => void start()} disabled={isUploading || media.length >= 12} className="flex min-h-[44px] items-center gap-2 border-2 border-rpg-pink/70 bg-rpg-pink/10 px-4 text-sm font-semibold text-rpg-pink disabled:opacity-50" style={R}>
              {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} {isUploading ? "Salvando…" : "Gravar nota de voz"}
            </button>
          ) : (
            <>
              <button type="button" onClick={pause} className="flex min-h-[44px] items-center gap-1.5 border-2 border-rpg-border px-3 text-sm text-rpg-text" style={R}>
                {state === "paused" ? <Play size={15} /> : <Pause size={15} />} {state === "paused" ? "Continuar" : "Pausar"}
              </button>
              <button type="button" onClick={stop} className="flex min-h-[44px] items-center gap-1.5 border-2 border-rpg-red/70 px-3 text-sm text-rpg-red" style={R}>
                <Square size={14} /> Parar e salvar
              </button>
              <span className="font-pixel text-xs text-rpg-pink" aria-live="polite">
                {state === "paused" ? "Pausado" : "● Gravando"} {fmt(elapsed)} / {fmt(MAX_SECONDS)}
              </span>
              <span className="flex h-6 items-center gap-[2px]" aria-hidden>
                {level.map((l, i) => (
                  <span key={i} className="w-[3px] bg-rpg-pink" style={{ height: `${Math.max(10, l * 100)}%` }} />
                ))}
              </span>
            </>
          )}
        </div>
      )}
      {error && (
        <p className="text-xs text-rpg-red" role="alert">
          {error}
        </p>
      )}
      {media.length > 0 ? (
        <ul className="space-y-1.5">
          {media.map((m) => (
            <VoiceItem key={m.id} m={m} onRemove={() => onRemove(m.id)} onTranscribe={() => onTranscribe(m)} canTranscribe={aiAllowed} />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-rpg-muted">Nenhuma nota de voz hoje. O áudio fica guardado só na sua crônica (com login) e nunca vai para a IA sem você pedir.</p>
      )}
    </div>
  );
}
