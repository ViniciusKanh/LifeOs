import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleSlash, Loader2, Settings2 } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { ApiError } from "@/services/api";

/**
 * Peças compartilhadas pelas telas de aventura (Raid, Companheiro, Atlas,
 * Tempo de Jogo) — mesmo visual RPG das outras telas.
 */

export const R = { borderRadius: 6 } as const;
/** Campo de formulário no tema RPG (mesmo visual da Forja do Código). */
export const INPUT = "border border-rpg-border bg-rpg-bg-2 p-2 text-sm text-rpg-text outline-none focus:border-rpg-gold";

export const errMsg = (e: unknown, fb: string) => (e instanceof ApiError || e instanceof Error ? e.message || fb : fb);

export function fmtMin(min: number | null | undefined): string {
  if (min == null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso.includes("T") || iso.endsWith("Z") ? iso : iso.replace(" ", "T") + "Z");
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export const fmtDay = (day: string) => day.split("-").reverse().slice(0, 2).join("/");
export const nf = (n: number) => n.toLocaleString("pt-BR");

export function BackToWorld() {
  return (
    <Link to="/meu-mundo" className="inline-flex items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 px-2.5 py-1 text-xs font-semibold text-rpg-green" style={R}>
      <ArrowLeft size={13} aria-hidden /> Meu Mundo — Vila
    </Link>
  );
}

export function AdventureHeader({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start gap-3">
      <div className="shrink-0 text-rpg-text" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="font-rpg text-2xl font-bold leading-tight text-rpg-text sm:text-3xl">{title}</h1>
        <p className="text-sm text-rpg-muted">{subtitle}</p>
      </div>
      {children && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{children}</div>}
    </header>
  );
}

/** Pílula de status de integração (nunca diz "conectado" sem autorização real). */
export function StatusPill({ state, label, detail, onClick }: { state: "ok" | "off" | "warn" | "config"; label: string; detail?: string | null; onClick?: () => void }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warn" ? AlertTriangle : state === "config" ? Settings2 : CircleSlash;
  const tone = state === "ok" ? "border-rpg-green/70 text-rpg-green" : state === "warn" ? "border-rpg-orange/70 text-rpg-orange" : "border-rpg-border text-rpg-muted";
  const body = (
    <>
      <Icon size={18} aria-hidden />
      <span className="text-left">
        <span className="block text-xs font-semibold text-rpg-text">{label}</span>
        {detail && <span className={clsx("block text-[11px]", tone.split(" ")[1])}>{detail}</span>}
      </span>
    </>
  );
  const cls = clsx("flex min-w-[150px] items-center gap-2 border-2 bg-rpg-bg-2/80 px-3 py-2", tone);
  return onClick ? (
    <button type="button" onClick={onClick} className={clsx(cls, "hover:brightness-110")} style={R}>
      {body}
    </button>
  ) : (
    <div className={cls} style={R}>
      {body}
    </div>
  );
}

export function StatTile({ icon, tone = "text-rpg-blue", value, label, hint }: { icon: ReactNode; tone?: string; value: ReactNode; label: string; hint?: ReactNode }) {
  return (
    <div className="rpg-tile flex flex-col gap-0.5 p-3">
      <span className={clsx("flex items-center gap-1.5 text-xs text-rpg-muted", tone)}>
        {icon}
        <span className="text-rpg-muted">{label}</span>
      </span>
      <span className="font-rpg text-2xl font-bold leading-tight text-rpg-text">{value}</span>
      {hint && <span className="text-[11px] text-rpg-muted">{hint}</span>}
    </div>
  );
}

export function Panel({ title, icon, action, children, className, label }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={clsx("rpg-panel p-4", className)} aria-label={label ?? title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-rpg text-lg font-bold text-rpg-text">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4 px-3 py-4 sm:px-4 md:px-6" aria-busy="true" aria-label="Carregando">
      <div className="h-10 w-72 animate-pulse bg-rpg-bg-2" style={R} />
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="aspect-[16/9] animate-pulse bg-rpg-bg-2" style={R} />
        <div className="h-64 animate-pulse bg-rpg-bg-2" style={R} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 animate-pulse bg-rpg-bg-2" style={R} />
        ))}
      </div>
    </div>
  );
}

export function PageError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="px-4 py-6">
      <div className="rpg-panel p-6 text-center" role="alert">
        <p className="text-sm text-rpg-red">Não foi possível carregar {what}.</p>
        <RPGButton variant="secondary" className="mt-3" onClick={onRetry}>
          Tentar de novo
        </RPGButton>
      </div>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="border border-dashed border-rpg-border/70 p-3 text-center text-sm text-rpg-muted" style={R}>{children}</p>;
}

/**
 * Resultado do OAuth/OpenID: o callback da API volta com ?conectado=1 ou ?erro=…
 * Mostra o aviso uma vez e limpa a URL.
 */
export function useIntegrationReturn(notify: (msg: string, tone?: "success" | "error") => void, name: string) {
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const ok = params.get("conectado");
    const err = params.get("erro");
    if (!ok && !err) return;
    if (ok) notify(`${name} conectado com sucesso.`);
    else notify(err ?? `Não foi possível conectar ${name}.`, "error");
    params.delete("conectado");
    params.delete("erro");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Pede a URL de autorização à API e navega para ela (o segredo nunca passa pelo navegador). */
export function useConnect(getUrl: () => Promise<{ url: string }>, notify: (msg: string, tone?: "success" | "error") => void) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const { url } = await getUrl();
      window.location.assign(url);
    } catch (e) {
      notify(errMsg(e, "Não foi possível iniciar a conexão."), "error");
      setBusy(false);
    }
  };
  return { go, busy };
}

export function Spinner() {
  return <Loader2 size={14} className="animate-spin" aria-hidden />;
}

/** Barra simples de valor com rótulo (dados reais; vazio quando não há). */
export function MeterRow({ label, value, max, tone = "bg-rpg-green", right }: { label: ReactNode; value: number; max: number; tone?: string; right?: ReactNode }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-rpg-text">{label}</span>
        <span className="font-semibold tabular-nums text-rpg-muted">{right ?? `${Math.round(pct)}%`}</span>
      </div>
      <div className="h-2.5 overflow-hidden bg-rpg-bg-2" style={R} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={typeof label === "string" ? label : undefined}>
        <div className={clsx("h-full transition-[width] duration-700", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
