import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, Quote } from "lucide-react";
import type { Count, EsicItem, EsicStatus, Outcome } from "@/services/cityService";
import { R, dayBR } from "../CityKit";

/**
 * Peças visuais de Cidadania e Consumo (PROCON, SP156, e-SIC): barras empilhadas de desfecho,
 * mapa das 5 regiões, grade de subprefeituras, cartões de pergunta e resposta e afins.
 * Só apresentação — classificação e contas vêm prontas do servidor (civicService).
 */

/* ───────────── cores por desfecho / situação (com rótulo sempre visível) ───────────── */

export const OUTCOME_STYLE: Record<Outcome, { bg: string; text: string; dot: string }> = {
  resolvido: { bg: "bg-emerald-500", text: "text-emerald-300", dot: "bg-emerald-400" },
  parcial: { bg: "bg-lime-500", text: "text-lime-300", dot: "bg-lime-400" },
  nao_resolvido: { bg: "bg-rose-500", text: "text-rose-300", dot: "bg-rose-400" },
  desistencia: { bg: "bg-rpg-muted", text: "text-rpg-muted", dot: "bg-rpg-muted" },
  orientacao: { bg: "bg-sky-500", text: "text-sky-300", dot: "bg-sky-400" },
  encaminhado: { bg: "bg-amber-500", text: "text-amber-300", dot: "bg-amber-400" },
  arquivado: { bg: "bg-zinc-600", text: "text-zinc-300", dot: "bg-zinc-500" },
  concluido: { bg: "bg-teal-700", text: "text-teal-300", dot: "bg-teal-600" },
  sem_desfecho: { bg: "bg-indigo-900", text: "text-indigo-300", dot: "bg-indigo-700" },
};

export const ESIC_STYLE: Record<EsicStatus, { label: string; bg: string; text: string; border: string }> = {
  atendido: { label: "Atendido", bg: "bg-emerald-500", text: "text-emerald-300", border: "border-emerald-400/50" },
  parcial: { label: "Atendido em parte", bg: "bg-lime-500", text: "text-lime-300", border: "border-lime-400/50" },
  negado: { label: "Negado", bg: "bg-rose-500", text: "text-rose-300", border: "border-rose-400/50" },
  finalizado: { label: "Finalizado (sem detalhe)", bg: "bg-teal-600", text: "text-teal-300", border: "border-teal-400/50" },
  tramitando: { label: "Em tramitação", bg: "bg-sky-500", text: "text-sky-300", border: "border-sky-400/50" },
  outro: { label: "Outra situação", bg: "bg-zinc-500", text: "text-zinc-300", border: "border-zinc-400/50" },
};

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("pt-BR"));
/** Eixo de gráfico: 27.000 → "27 mil", 4.512.390 → "4,5 mi". */
export const fmtCompact = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(n).toLocaleString("pt-BR"));
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`);

/** Barra 100% empilhada com legenda (cor + rótulo + número — nunca só cor). */
export function StackedBar<K extends string>({ parts, styles, label }: { parts: Array<{ key: K; label: string; count: number }>; styles: Record<K, { bg: string; text?: string; dot?: string }>; label: string }) {
  const total = parts.reduce((s, p) => s + p.count, 0) || 1;
  return (
    <figure className="min-w-0" aria-label={label}>
      <div className="flex h-5 w-full overflow-hidden border border-rpg-border" style={R} role="img" aria-label={parts.map((p) => `${p.label}: ${p.count}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.key} className={clsx("h-full", styles[p.key].bg)} style={{ width: `${(p.count / total) * 100}%` }} title={`${p.label}: ${p.count}`} />
        ))}
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.key} className="flex min-w-0 items-center gap-2">
            <span className={clsx("h-2.5 w-2.5 shrink-0", styles[p.key].bg)} style={{ borderRadius: 2 }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-rpg-text/90">{p.label}</span>
            <span className="tabular-nums text-rpg-muted">
              {fmtInt(p.count)} · {fmtPct((p.count / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Selo de taxa (verde/âmbar/vermelho) com a base sempre à vista. */
export function RatePill({ rate, base, min = 5 }: { rate: number | null; base: number; min?: number }) {
  if (rate == null || base < min)
    return (
      <span className="inline-flex items-center border border-rpg-border px-1.5 py-0.5 text-[11px] text-rpg-muted" style={R} title="Poucos casos com decisão para calcular a taxa">
        poucos casos
      </span>
    );
  const tone = rate >= 60 ? "border-emerald-400/60 text-emerald-300" : rate >= 35 ? "border-amber-400/60 text-amber-300" : "border-rose-400/60 text-rose-300";
  return (
    <span className={clsx("inline-flex items-center gap-1 border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", tone)} style={R} title={`${base} caso(s) com decisão`}>
      {fmtPct(rate, 0)} <span className="font-normal text-rpg-muted">de {base}</span>
    </span>
  );
}

/** Pílulas de ano (ou semestre) — navegação rápida entre bases. */
export function Pills<T extends string | number>({ items, value, onChange, label, render }: { items: T[]; value: T; onChange: (v: T) => void; label: string; render?: (v: T) => ReactNode }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={String(it)}
          type="button"
          role="radio"
          aria-checked={it === value}
          onClick={() => onChange(it)}
          className={clsx("min-h-[38px] border-2 px-3 font-pixel text-xs", it === value ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light shadow-[0_0_12px_-4px_rgb(var(--rpg-gold)/0.7)]" : "border-rpg-border bg-rpg-bg-2/70 text-rpg-muted hover:text-rpg-text")}
          style={R}
        >
          {render ? render(it) : String(it)}
        </button>
      ))}
    </div>
  );
}

/** Cartão-número grande com faixa de cor do domínio. */
export function BigStat({ label, value, hint, accent = "bg-rpg-gold", icon }: { label: string; value: ReactNode; hint?: ReactNode; accent?: string; icon?: ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden border-2 border-rpg-border bg-rpg-panel p-3" style={R}>
      <span className={clsx("absolute inset-y-0 left-0 w-1", accent)} aria-hidden />
      <div className="flex items-start gap-2 pl-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-pixel text-[10px] uppercase text-rpg-muted" title={label}>
            {label}
          </p>
          <p className={clsx("mt-0.5 font-rpg font-bold leading-tight text-rpg-text tabular-nums", typeof value === "string" && value.length > 12 ? "line-clamp-2 text-lg" : "truncate text-2xl")} title={typeof value === "string" ? value : undefined}>{value}</p>
          {hint && <p className="mt-0.5 line-clamp-2 text-[11px] text-rpg-muted">{hint}</p>}
        </div>
        {icon && (
          <span className="shrink-0 text-rpg-muted" aria-hidden>
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Mapa esquemático das 5 regiões de São Paulo (Norte, Oeste, Centro, Leste, Sul) — posições
 * aproximadas, só para orientar; a intensidade é proporcional à contagem.
 */
const REGION_POS: Record<string, string> = { Norte: "col-start-2 row-start-1", Oeste: "col-start-1 row-start-2", Centro: "col-start-2 row-start-2", Leste: "col-start-3 row-start-2", Sul: "col-start-2 row-start-3" };
export function RegionMap({ regions, color = "168 85 247" }: { regions: Count[]; color?: string }) {
  const known = regions.filter((r) => REGION_POS[r.label]);
  const other = regions.filter((r) => !REGION_POS[r.label]);
  const max = Math.max(1, ...known.map((r) => r.count));
  const total = regions.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div>
      <div className="mx-auto grid max-w-[340px] grid-cols-3 grid-rows-3 gap-1.5" role="img" aria-label={known.map((r) => `${r.label}: ${r.count}`).join(", ")}>
        {Object.keys(REGION_POS).map((name) => {
          const r = known.find((x) => x.label === name);
          const a = r ? 0.18 + 0.72 * (r.count / max) : 0.06;
          return (
            <div key={name} className={clsx("flex aspect-[4/3] flex-col items-center justify-center border-2 border-rpg-border text-center", REGION_POS[name])} style={{ ...R, background: `rgb(${color} / ${a})` }}>
              <span className="font-pixel text-[10px] uppercase text-white/90">{name}</span>
              <span className="font-rpg text-lg font-bold text-white tabular-nums">{fmtInt(r?.count ?? 0)}</span>
              <span className="text-[10px] text-white/70">{fmtPct(((r?.count ?? 0) / total) * 100, 0)}</span>
            </div>
          );
        })}
      </div>
      {!!other.length && <p className="mt-2 text-center text-[11px] text-rpg-muted">Fora das 5 regiões: {other.map((o) => `${o.label} (${o.count})`).join(", ")}</p>}
    </div>
  );
}

/** Grade de calor (subprefeituras, distritos): cada célula clicável. */
export function HeatGrid({ items, onPick, color = "6 182 212", label }: { items: Count[]; onPick?: (label: string) => void; color?: string; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4" aria-label={label}>
      {items.map((it) => {
        const a = 0.12 + 0.75 * (it.count / max);
        return (
          <li key={it.label}>
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.(it.label)}
              className="flex min-h-[52px] w-full flex-col justify-center border border-rpg-border px-2 py-1 text-left transition hover:border-rpg-gold disabled:cursor-default"
              style={{ ...R, background: `rgb(${color} / ${a})` }}
              title={`${it.label}: ${it.count}`}
            >
              <span className="line-clamp-1 text-[11px] font-semibold text-white">{it.label}</span>
              <span className="font-rpg text-base font-bold leading-tight text-white tabular-nums">{fmtInt(it.count)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Lista ranqueada simples (posição, nome, valor, extra). */
export function RankList({ items }: { items: Array<{ label: string; value: string; extra?: ReactNode; onClick?: () => void }> }) {
  return (
    <ol className="divide-y divide-rpg-border/60">
      {items.map((it, i) => {
        const body = (
          <>
            <span className={clsx("w-6 shrink-0 font-pixel text-xs tabular-nums", i < 3 ? "text-rpg-gold-light" : "text-rpg-muted")}>{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-rpg-text" title={it.label}>
              {it.label}
            </span>
            <span className="shrink-0 tabular-nums text-sm text-rpg-text/90">{it.value}</span>
            {it.extra && <span className="shrink-0">{it.extra}</span>}
          </>
        );
        return (
          <li key={it.label}>
            {it.onClick ? (
              <button type="button" onClick={it.onClick} className="flex min-h-[40px] w-full items-center gap-2 py-1.5 text-left hover:bg-rpg-panel-hover">
                {body}
              </button>
            ) : (
              <div className="flex min-h-[40px] items-center gap-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Cartão de pergunta e resposta do e-SIC (resposta recolhida por padrão). */
export function QACard({ item, onOpen, highlight }: { item: EsicItem; onOpen?: () => void; highlight?: string | null }) {
  const [open, setOpen] = useState(false);
  const st = ESIC_STYLE[item.status];
  const mark = (text: string) => {
    if (!highlight || highlight.trim().length < 3) return text;
    const words = highlight
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!words.length) return text;
    const parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
    return parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-rpg-gold/30 text-rpg-text">{p}</mark> : p));
  };
  return (
    <article className={clsx("min-w-0 border-2 bg-rpg-bg-2/60 p-3", st.border)} style={R}>
      <header className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        <span className={clsx("inline-flex items-center gap-1 border px-1.5 py-0.5 font-semibold", st.border, st.text)} style={R}>
          <span className={clsx("h-1.5 w-1.5 rounded-full", st.bg)} aria-hidden />
          {item.statusRaw ?? st.label}
        </span>
        {item.orgao && <span className="truncate text-rpg-muted">{item.orgao}</span>}
        <span className="ml-auto tabular-nums text-rpg-muted">{item.data ? dayBR(item.data) : ""}{item.id ? ` · nº ${item.id}` : ""}</span>
      </header>
      <p className="flex gap-2 text-sm text-rpg-text">
        <Quote size={14} className="mt-0.5 shrink-0 text-rpg-cyan" aria-hidden />
        <span className={clsx(!open && "line-clamp-3")}>{mark(item.pedido || "(pergunta não publicada)")}</span>
      </p>
      {item.resposta && (
        <div className="mt-2 border-l-2 border-rpg-border pl-3">
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (!open) onOpen?.();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-rpg-blue"
            aria-expanded={open}
          >
            <ChevronDown size={14} className={clsx("transition-transform", open && "rotate-180")} aria-hidden /> {open ? "Ocultar resposta" : "Ver resposta da Prefeitura"}
          </button>
          {open && <p className="mt-1 whitespace-pre-line text-sm text-rpg-text/85">{mark(item.resposta)}</p>}
        </div>
      )}
    </article>
  );
}

/** Seção recolhível (ex.: "Todos os registros"). */
export function Collapsible({ title, icon, children, defaultOpen = false }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-2 border-rpg-border bg-rpg-panel/60" style={R}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-[48px] w-full items-center gap-2 px-3 text-left" aria-expanded={open}>
        {icon}
        <span className="rpg-title flex-1 text-sm font-bold uppercase">{title}</span>
        <ChevronDown size={16} className={clsx("text-rpg-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="border-t border-rpg-border p-3">{children}</div>}
    </section>
  );
}

/** Painel com título no padrão do módulo. */
export function Panel({ title, icon, children, action, className, subtitle }: { title: string; icon?: ReactNode; children: ReactNode; action?: ReactNode; className?: string; subtitle?: string }) {
  return (
    <section className={clsx("rpg-panel min-w-0 p-3", className)} aria-label={title}>
      <div className="mb-2.5 flex items-start gap-2">
        {icon && (
          <span className="mt-0.5 text-rpg-gold" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="rpg-title truncate text-sm font-bold uppercase">{title}</h2>
          {subtitle && <p className="text-[11px] text-rpg-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
