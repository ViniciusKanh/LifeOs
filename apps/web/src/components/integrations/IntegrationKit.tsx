import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { Eye, EyeOff, ExternalLink, KeyRound, Lock, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { INPUT, R, Spinner, ago } from "@/components/adventures/AdventureKit";

/**
 * Peças comuns das integrações pessoais (Zotero, WakaTime, ClickUp):
 * formulário de chave (nunca reexibida), linha de sincronização e selos de XP.
 */

export function KeyConnectForm({
  service,
  placeholder,
  steps,
  link,
  busy,
  onSubmit,
  minLength = 16,
  pattern,
  patternHint,
}: {
  service: string;
  placeholder: string;
  steps: ReactNode[];
  link: { href: string; text: string };
  busy: boolean;
  onSubmit: (key: string) => void;
  minLength?: number;
  pattern?: RegExp;
  patternHint?: string;
}) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const trimmed = key.trim();
  const invalid = trimmed.length > 0 && (trimmed.length < minLength || (pattern ? !pattern.test(trimmed) : false));
  const id = `key-${service.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid && trimmed) onSubmit(trimmed);
      }}
    >
      <ol className="space-y-1.5 text-xs text-rpg-muted">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rpg-gold/60 font-rpg text-[10px] font-bold text-rpg-gold" aria-hidden>
              {i + 1}
            </span>
            <span className="min-w-0">{s}</span>
          </li>
        ))}
      </ol>
      <a href={link.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs font-semibold text-rpg-blue underline-offset-2 hover:underline">
        {link.text} <ExternalLink size={12} aria-hidden />
      </a>
      <div>
        <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-rpg-text">
          <KeyRound size={13} className="text-rpg-gold" aria-hidden /> Chave pessoal do {service}
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            type={show ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={placeholder}
            className={clsx(INPUT, "min-w-0 flex-1 font-mono")}
            style={R}
            aria-invalid={invalid}
            aria-describedby={`${id}-hint`}
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="border border-rpg-border px-2 text-rpg-muted hover:text-rpg-text" style={R} aria-label={show ? "Ocultar chave" : "Mostrar chave"}>
            {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
          </button>
        </div>
        <p id={`${id}-hint`} className={clsx("mt-1 text-[11px]", invalid ? "text-rpg-orange" : "text-rpg-muted")}>
          {invalid ? patternHint ?? "Essa chave parece incompleta." : (
            <span className="inline-flex items-center gap-1">
              <Lock size={11} aria-hidden /> Fica criptografada no servidor e nunca volta para o navegador.
            </span>
          )}
        </p>
      </div>
      <RPGButton type="submit" variant="gold" disabled={busy || !trimmed || invalid} className="w-full justify-center text-sm">
        {busy ? <Spinner /> : <ShieldCheck size={15} aria-hidden />} Conectar {service}
      </RPGButton>
    </form>
  );
}

/** Estado da sincronização + ações (sincronizar / desconectar com confirmação). */
export function SyncBar({
  status,
  lastSyncAt,
  error,
  busy,
  onSync,
  onDisconnect,
  disconnecting,
  keepNote,
}: {
  status: "ok" | "parcial" | "erro" | null;
  lastSyncAt: string | null;
  error: string | null;
  busy: boolean;
  onSync: () => void;
  onDisconnect: () => void;
  disconnecting?: boolean;
  keepNote: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const tone = status === "ok" ? "text-rpg-green" : status === "parcial" ? "text-rpg-gold" : status === "erro" ? "text-rpg-orange" : "text-rpg-muted";
  const dot = status === "ok" ? "bg-rpg-green" : status === "parcial" ? "bg-rpg-gold" : status === "erro" ? "bg-rpg-orange" : "bg-rpg-muted";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={clsx("flex items-center gap-1.5 text-xs", tone)} role="status">
          <span className={clsx("h-2 w-2 rounded-full", dot, busy && "animate-pulse")} aria-hidden />
          {busy ? "Sincronizando…" : status === "ok" ? `Sincronizado ${ago(lastSyncAt)}` : status === "parcial" ? "Sincronização em partes — continue" : status === "erro" ? "Erro na última sincronização" : "Aguardando a primeira sincronização"}
        </span>
        <span className="flex-1" />
        <RPGButton variant="secondary" className="text-xs" onClick={onSync} disabled={busy}>
          <RefreshCw size={13} className={clsx(busy && "animate-spin")} aria-hidden /> Sincronizar
        </RPGButton>
        {confirm ? (
          <span className="flex items-center gap-1">
            <RPGButton variant="danger" className="text-xs" onClick={onDisconnect} disabled={disconnecting}>
              Confirmar
            </RPGButton>
            <RPGButton variant="ghost" className="text-xs" onClick={() => setConfirm(false)}>
              Cancelar
            </RPGButton>
          </span>
        ) : (
          <RPGButton variant="ghost" className="text-xs" onClick={() => setConfirm(true)} aria-label="Desconectar">
            <Unplug size={13} aria-hidden />
          </RPGButton>
        )}
      </div>
      {confirm && <p className="text-[11px] text-rpg-muted">A chave será apagada. {keepNote}</p>}
      {error && status === "erro" && (
        <p className="border border-rpg-orange/60 bg-rpg-orange/10 px-2 py-1.5 text-[11px] text-rpg-orange" style={R} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Selo de recompensa (sempre dado real: o servidor diz quanto pagou). */
export function XpChip({ xp, coins, className }: { xp: number; coins?: number; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 border border-rpg-gold/60 bg-rpg-gold/10 px-1.5 py-0.5 font-rpg text-[10px] font-bold text-rpg-gold-light", className)} style={R}>
      +{xp} XP{coins ? ` · ${coins} 🪙` : ""}
    </span>
  );
}

/** Cabeçalho chamativo de módulo de integração (ícone em "brasão"). */
export function IntegrationBanner({ icon, title, subtitle, tone, right }: { icon: ReactNode; title: string; subtitle: string; tone: "blue" | "purple" | "green" | "gold" | "pink" | "orange" | "cyan"; right?: ReactNode }) {
  const ring = {
    blue: "border-rpg-blue/70 bg-rpg-blue/15 text-rpg-blue",
    purple: "border-rpg-purple/70 bg-rpg-purple/15 text-rpg-purple",
    green: "border-rpg-green/70 bg-rpg-green/15 text-rpg-green",
    gold: "border-rpg-gold/70 bg-rpg-gold/15 text-rpg-gold",
    pink: "border-rpg-pink/70 bg-rpg-pink/15 text-rpg-pink",
    orange: "border-rpg-orange/70 bg-rpg-orange/15 text-rpg-orange",
    cyan: "border-rpg-cyan/70 bg-rpg-cyan/15 text-rpg-cyan",
  }[tone];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <span className={clsx("flex h-11 w-11 shrink-0 items-center justify-center border-2 shadow-rpg", ring)} style={{ borderRadius: 10 }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-rpg text-lg font-bold leading-tight text-rpg-text">{title}</h2>
        <p className="text-[11px] text-rpg-muted">{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

/** Formata segundos como "2h 05min" / "45 min". */
export function fmtSec(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}min`;
}
