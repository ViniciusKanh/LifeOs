import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, Bot, Clock3, Database, Download, Info, KeyRound, Lightbulb, Loader2, RefreshCw, ScrollText, ShieldAlert, Sparkles, Star } from "lucide-react";
import { RPGBadge, RPGButton, type RpgTone } from "@/components/rpg";
import { ApiError } from "@/services/api";
import type { CatalogEntry, Cell, CityApi, CityApiState, CityDomain, FetchMeta, OracleAnswer, Row } from "@/services/cityService";
import { useCityActions, useCityCatalog } from "@/hooks/useCity";

export const R = { borderRadius: 4 } as const;
export const FIELD = "min-h-[40px] w-full min-w-0 border border-rpg-border bg-rpg-bg-2 px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold focus-visible:ring-2 focus-visible:ring-rpg-gold/40";

/* ═══════════════════════ identidade por domínio ═══════════════════════ */

/** Cores por domínio (pedido do produto): o mesmo RPG, com o "brasão" de cada área. */
export const DOMAIN: Record<CityDomain, { label: string; from: string; to: string; text: string; border: string; tone: RpgTone }> = {
  saude: { label: "Saúde", from: "#064e3b", to: "#10b981", text: "text-emerald-300", border: "border-emerald-400/60", tone: "green" },
  educacao: { label: "Educação", from: "#1e3a8a", to: "#7c3aed", text: "text-violet-300", border: "border-violet-400/60", tone: "purple" },
  financas: { label: "Finanças públicas", from: "#713f12", to: "#eab308", text: "text-amber-300", border: "border-amber-400/60", tone: "gold" },
  mobilidade: { label: "Mobilidade", from: "#1e40af", to: "#f97316", text: "text-orange-300", border: "border-orange-400/60", tone: "orange" },
  cidadania: { label: "Cidadania", from: "#164e63", to: "#06b6d4", text: "text-cyan-300", border: "border-cyan-400/60", tone: "cyan" },
  consumo: { label: "Consumo", from: "#3b0764", to: "#a855f7", text: "text-purple-300", border: "border-purple-400/60", tone: "purple" },
  territorial: { label: "Território", from: "#1e3a8a", to: "#16a34a", text: "text-sky-300", border: "border-sky-400/60", tone: "blue" },
  oportunidades: { label: "Oportunidades", from: "#854d0e", to: "#16a34a", text: "text-lime-300", border: "border-lime-400/60", tone: "gold" },
};

export const STATE_META: Record<CityApiState, { label: string; tone: RpgTone; hint: string }> = {
  nao_configurada: { label: "Não configurada", tone: "muted", hint: "Cadastre a credencial do APILIB." },
  configurada: { label: "Configurada", tone: "blue", hint: "Credencial cadastrada, ainda sem consulta bem-sucedida." },
  conectada: { label: "Conectada", tone: "green", hint: "Última consulta real respondeu com sucesso." },
  credencial_invalida: { label: "Credencial inválida", tone: "red", hint: "Gere um novo token no Store do APILIB." },
  sem_autorizacao: { label: "Sem autorização", tone: "orange", hint: "Assine esta API com a sua aplicação no Store." },
  indisponivel: { label: "Serviço indisponível", tone: "red", hint: "A Prefeitura não respondeu agora." },
  limite: { label: "Limite atingido", tone: "orange", hint: "Aguarde alguns minutos." },
  desatualizada: { label: "Dados desatualizados", tone: "orange", hint: "Mostrando a última cópia salva." },
  desativada: { label: "Desativada", tone: "muted", hint: "Você desativou esta API." },
};

export function StateBadge({ state }: { state: CityApiState }) {
  const m = STATE_META[state];
  return (
    <span title={m.hint}>
      <RPGBadge tone={m.tone}>{m.label}</RPGBadge>
    </span>
  );
}

/* ═══════════════════════ banner com o horizonte de SP ═══════════════════════ */

/** Silhueta genérica de arranha-céus + ponte estaiada (desenho próprio, pixelado). */
export function Skyline({ className }: { className?: string }) {
  const towers = [
    [0, 62, 18], [20, 40, 14], [36, 70, 22], [60, 30, 12], [74, 52, 16], [92, 78, 20], [114, 44, 14], [130, 66, 18],
    [150, 36, 12], [164, 58, 16], [182, 84, 22], [206, 48, 14], [222, 70, 18], [242, 38, 12], [256, 60, 16],
  ];
  return (
    <svg viewBox="0 0 520 110" preserveAspectRatio="xMaxYMax slice" className={clsx("pointer-events-none absolute inset-0 h-full w-full", className)} aria-hidden shapeRendering="crispEdges">
      <g fill="rgb(0 0 0 / 0.35)">
        {towers.map(([x, h, w]) => (
          <rect key={x} x={x! + 180} y={110 - h!} width={w} height={h} />
        ))}
      </g>
      <g fill="rgb(255 220 120 / 0.35)">
        {towers.flatMap(([x, h, w]) =>
          Array.from({ length: Math.floor(h! / 12) }, (_, i) => <rect key={`${x}-${i}`} x={x! + 184 + ((i * 5) % Math.max(4, w! - 6))} y={110 - h! + 6 + i * 12} width={2} height={3} />),
        )}
      </g>
      {/* ponte estaiada: mastro em X e cabos em leque */}
      <g stroke="rgb(255 255 255 / 0.5)" strokeWidth="1" fill="none" transform="translate(300 0)">
        <path d="M120 96 L150 24 L180 96" strokeWidth="3" />
        {[-60, -46, -32, -18, 18, 32, 46, 60].map((dx) => (
          <path key={dx} d={`M150 ${30 + Math.abs(dx) / 5} L${150 + dx * 1.6} 96`} />
        ))}
      </g>
      <rect x="0" y="96" width="520" height="3" fill="rgb(255 255 255 / 0.35)" />
    </svg>
  );
}

export function CityBanner({ domain, eyebrow, title, subtitle, children }: { domain: CityDomain; eyebrow: string; title: string; subtitle: string; children?: ReactNode }) {
  const d = DOMAIN[domain];
  return (
    <header className={clsx("relative overflow-hidden border-2", d.border)} style={{ ...R, background: `linear-gradient(120deg, ${d.from} 0%, #171a3a 55%, ${d.to}55 100%)` }}>
      <Skyline />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-transparent" aria-hidden />
      <div className="relative grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className={clsx("font-pixel text-[10px] uppercase tracking-widest", d.text)}>Cidade Inteligente · {eyebrow}</p>
          <h1 className="rpg-title text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-rpg-text/85">{subtitle}</p>
        </div>
        {children && <div className="flex flex-wrap gap-2 md:justify-end">{children}</div>}
      </div>
    </header>
  );
}

/* ═══════════════════════ transparência dos dados ═══════════════════════ */

const fmtStamp = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

/** Faixa obrigatória em toda tela: fonte oficial, sincronização, referência, cobertura, limitações e método. */
export function SourceStrip({ apiId, meta, reference }: { apiId: CityApi; meta?: FetchMeta | null; reference?: string | null }) {
  const cat = useCityCatalog();
  const entry = cat.data?.find((c) => c.id === apiId);
  const [open, setOpen] = useState(false);
  if (!entry) return null;
  return (
    <section className="border-2 border-rpg-border bg-rpg-bg-2/70 p-3 text-xs" style={R} aria-label="Transparência dos dados">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-rpg-gold-light">
          <Database size={13} aria-hidden /> <strong>Fonte oficial:</strong> <span className="text-rpg-text">{entry.source}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-rpg-muted">
          <Clock3 size={13} aria-hidden /> Sincronizado: <span className="text-rpg-text">{fmtStamp(meta?.fetchedAt)}</span>
          {meta?.fromCache && !meta.stale && <span>(cópia salva)</span>}
        </span>
        {reference && (
          <span className="text-rpg-muted">
            Referência: <span className="text-rpg-text">{reference}</span>
          </span>
        )}
        <span className="text-rpg-muted">
          Cobertura: <span className="text-rpg-text">{entry.coverage}</span>
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto inline-flex min-h-[32px] items-center gap-1 text-rpg-blue underline-offset-2 hover:underline" aria-expanded={open}>
          <Info size={13} aria-hidden /> {open ? "Ocultar método" : "Método e limitações"}
        </button>
      </div>
      {meta?.stale && (
        <p className="mt-2 flex items-start gap-1.5 text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Dados desatualizados: {meta.staleReason} Mostrando a última cópia salva.
        </p>
      )}
      {!!meta?.redacted.length && <p className="mt-2 text-rpg-muted">Por privacidade, campos pessoais foram ocultados: {meta.redacted.join(", ")}.</p>}
      {open && (
        <div className="mt-2 grid gap-2 border-t border-rpg-border pt-2 sm:grid-cols-2">
          <div>
            <p className="font-pixel text-[10px] uppercase text-rpg-gold">Metodologia</p>
            <p className="text-rpg-text/90">{entry.methodology}</p>
            <p className="mt-1 text-rpg-muted">
              API {entry.apilibName} {entry.version} · APILIB / Prefeitura de São Paulo{!entry.schemaDocumented && " · schema de resposta não publicado (colunas exibidas como vieram)"}
            </p>
          </div>
          <div>
            <p className="font-pixel text-[10px] uppercase text-rpg-gold">Limitações</p>
            <ul className="list-disc space-y-0.5 pl-4 text-rpg-text/90">
              {entry.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════ estados: carregando, vazio, erro ═══════════════════════ */

export function LoadingBlock({ label = "Consultando a Prefeitura…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-rpg-muted">
        <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse bg-rpg-panel-light/60 motion-reduce:animate-none" style={R} />
      ))}
    </div>
  );
}

export function EmptyBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-2 border-dashed border-rpg-border p-6 text-center" style={R}>
      <p className="font-rpg text-base font-bold text-rpg-text">{title}</p>
      {children && <div className="mt-1 text-sm text-rpg-muted">{children}</div>}
    </div>
  );
}

export const errorState = (e: unknown): CityApiState | null => (e instanceof ApiError ? ((e.data?.state as CityApiState | undefined) ?? null) : null);

/** Erro da consulta com o próximo passo certo (configurar, assinar, aguardar ou tentar de novo). */
export function CityError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const state = errorState(error);
  const msg = error instanceof Error ? error.message : "Não foi possível consultar a Prefeitura.";
  const needsSetup = state === "nao_configurada" || state === "credencial_invalida" || state === "sem_autorizacao" || state === "desativada";
  return (
    <div className={clsx("flex flex-col gap-3 border-2 p-4 sm:flex-row sm:items-center", needsSetup ? "border-rpg-gold/60 bg-rpg-gold/10" : "border-rpg-red/50 bg-rpg-red/10")} style={R} role="alert">
      <span className={needsSetup ? "text-rpg-gold" : "text-rpg-red"} aria-hidden>
        {needsSetup ? <KeyRound size={26} /> : <ShieldAlert size={26} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-rpg font-bold text-rpg-text">{state ? STATE_META[state].label : "Falha na consulta"}</p>
        <p className="text-sm text-rpg-text/85">{msg}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {needsSetup && (
          <Link to="/cidade?config=1" className="rpg-btn rpg-btn-gold">
            Configurar APILIB
          </Link>
        )}
        {onRetry && !needsSetup && (
          <RPGButton variant="secondary" onClick={onRetry}>
            <RefreshCw size={14} aria-hidden /> Tentar de novo
          </RPGButton>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ tabela automática (sem schema publicado) ═══════════════════════ */

export const cellText = (v: Cell | undefined) => (v == null ? "—" : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));
/** Exibição: números de colunas de valor/quantidade ganham separador pt-BR (códigos ficam como vieram). */
const MEASURE = /val|valor|total|qtd|quant|soma|pop|area|idh/i;
export const displayCell = (col: string, v: Cell | undefined) => (typeof v === "number" && MEASURE.test(col) ? v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : cellText(v));
const isNumericCol = (rows: Row[], c: string) => rows.slice(0, 30).every((r) => r[c] == null || typeof r[c] === "number" || /^-?\d+([.,]\d+)?$/.test(String(r[c])));

/** Colunas com mais preenchimento primeiro (as APIs sem schema trazem dezenas de campos vazios). */
export function autoColumns(rows: Row[], max = 8, prefer: string[] = []): string[] {
  const fill = new Map<string, number>();
  for (const r of rows.slice(0, 200)) for (const [k, v] of Object.entries(r)) if (v != null && v !== "") fill.set(k, (fill.get(k) ?? 0) + 1);
  const ordered = [...fill.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const pref = prefer.filter((p) => fill.has(p));
  return [...pref, ...ordered.filter((k) => !pref.includes(k))].slice(0, max);
}

export function DataTable({ rows, columns, caption, actions, onRowOpen }: { rows: Row[]; columns: string[]; caption: string; actions?: (r: Row, i: number) => ReactNode; onRowOpen?: (r: Row) => void }) {
  if (!rows.length) return <EmptyBox title="Nenhum registro para este filtro." />;
  const numeric = new Set(columns.filter((c) => isNumericCol(rows, c)));
  return (
    <>
      {/* desktop/tablet: tabela com rolagem própria (nunca estoura a página) */}
      <div className="hidden max-h-[560px] overflow-auto border-2 border-rpg-border md:block" style={R}>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-rpg-panel-light">
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className={clsx("whitespace-nowrap px-2 py-2 text-left font-pixel text-[10px] uppercase text-rpg-gold", numeric.has(c) && "text-right")}>
                  {c}
                </th>
              ))}
              {actions && <th className="sr-only">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={clsx("border-t border-rpg-border/60 odd:bg-rpg-bg-2/40", onRowOpen && "cursor-pointer hover:bg-rpg-panel-hover")} onClick={onRowOpen ? () => onRowOpen(r) : undefined}>
                {columns.map((c) => (
                  <td key={c} className={clsx("max-w-[280px] truncate px-2 py-1.5 text-rpg-text/90", numeric.has(c) && "text-right tabular-nums")} title={cellText(r[c])}>
                    {displayCell(c, r[c])}
                  </td>
                ))}
                {actions && (
                  <td className="px-2 py-1 text-right" onClick={(e) => e.stopPropagation()}>
                    {actions(r, i)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* celular: cartões */}
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 md:hidden" aria-label={caption}>
        {rows.slice(0, 120).map((r, i) => (
          <li key={i} className="min-w-0 border-2 border-rpg-border bg-rpg-panel p-2.5" style={R}>
            <button type="button" className="w-full text-left" onClick={onRowOpen ? () => onRowOpen(r) : undefined} disabled={!onRowOpen}>
              <p className="truncate font-semibold text-rpg-text">{cellText(r[columns[0]!])}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                {columns.slice(1, 7).map((c) => (
                  <div key={c} className="min-w-0">
                    <dt className="truncate text-rpg-muted">{c}</dt>
                    <dd className="truncate text-rpg-text/90">{displayCell(c, r[c])}</dd>
                  </div>
                ))}
              </dl>
            </button>
            {actions && <div className="mt-2 flex justify-end">{actions(r, i)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Contagem por valor de uma coluna — sempre rotulada como cálculo do LifeOS sobre a amostra carregada. */
export function FacetBars({ rows, column, title, top = 8, tone = "gold" }: { rows: Row[]; column: string; title: string; top?: number; tone?: RpgTone }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = cellText(r[column]);
      if (v !== "—") m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  }, [rows, column, top]);
  if (!counts.length) return null;
  const max = counts[0]![1];
  const bar = { gold: "bg-rpg-gold", green: "bg-rpg-green", blue: "bg-rpg-blue", purple: "bg-rpg-purple", cyan: "bg-rpg-cyan", orange: "bg-rpg-orange", red: "bg-rpg-red", pink: "bg-rpg-pink", muted: "bg-rpg-muted" }[tone];
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
        <span className="font-pixel text-[10px] uppercase text-rpg-gold">{title}</span>
        <span className="text-[11px] text-rpg-muted">calculado pelo LifeOS na amostra de {rows.length} registro(s)</span>
      </figcaption>
      <ul className="space-y-1">
        {counts.map(([label, n]) => (
          <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <div className="min-w-0">
              <p className="truncate text-rpg-text/90" title={label}>
                {label}
              </p>
              <div className="mt-0.5 h-2 bg-rpg-bg-2" style={R}>
                <div className={clsx("h-2", bar)} style={{ ...R, width: `${Math.max(4, (n / max) * 100)}%` }} />
              </div>
            </div>
            <span className="tabular-nums text-rpg-muted">{n}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ═══════════════════════ ações pessoais ═══════════════════════ */

export function exportCsv(rows: Row[], columns: string[], filename: string) {
  const esc = (v: Cell | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" + BOM: abre certo no Excel em português.
  const csv = "﻿" + [columns.join(";"), ...rows.map((r) => columns.map((c) => esc(r[c])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvButton({ rows, columns, filename }: { rows: Row[]; columns: string[]; filename: string }) {
  return (
    <RPGButton variant="ghost" disabled={!rows.length} onClick={() => exportCsv(rows, columns, filename)} aria-label="Exportar a amostra carregada em CSV">
      <Download size={14} aria-hidden /> CSV
    </RPGButton>
  );
}

export function FavoriteButton({
  apiId,
  itemKey,
  title,
  subtitle,
  url,
  payload,
  saved,
  notify,
}: {
  apiId: CityApi;
  itemKey: string;
  title: string;
  subtitle?: string | null;
  url?: string | null;
  payload?: Record<string, Cell>;
  saved?: boolean;
  notify: (m: string, t?: "success" | "error") => void;
}) {
  const a = useCityActions();
  const [done, setDone] = useState(!!saved);
  useEffect(() => setDone(!!saved), [saved]);
  return (
    <button
      type="button"
      className={clsx("inline-flex min-h-[36px] min-w-[36px] items-center justify-center border-2 px-2", done ? "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light" : "border-rpg-border text-rpg-muted hover:text-rpg-gold")}
      style={R}
      aria-pressed={done}
      aria-label={done ? `${title} está nos favoritos` : `Guardar ${title} nos favoritos`}
      disabled={done || a.addFavorite.isPending}
      onClick={() =>
        a.addFavorite.mutate(
          { api: apiId, itemKey, title, subtitle: subtitle ?? null, url: url ?? null, payload },
          {
            onSuccess: (r) => {
              setDone(true);
              notify(r.xp ? `Guardado! +${r.xp} XP` : r.created ? "Guardado nos favoritos." : "Já estava nos favoritos.");
            },
            onError: (e) => notify(e instanceof Error ? e.message : "Não foi possível guardar.", "error"),
          },
        )
      }
    >
      <Star size={15} fill={done ? "currentColor" : "none"} aria-hidden />
    </button>
  );
}

/** Registra uma atividade uma vez por montagem/ref (o servidor ainda deduplica por dia). */
export function useCityActivity(apiId: CityApi, action: "read" | "explore" | "compare" | "territory", ref: string | null, label?: string) {
  const a = useCityActions();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!ref || sent.current === ref) return;
    sent.current = ref;
    a.activity.mutate({ api: apiId, action, ref, label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiId, action, ref]);
}

/* ═══════════════════════ controles ═══════════════════════ */

export function Select({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; className?: string }) {
  return (
    <label className={clsx("flex min-w-0 flex-col gap-1 text-xs text-rpg-muted", className)}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} style={R}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({ label, value, onChange, placeholder, type = "text", className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return (
    <label className={clsx("flex min-w-0 flex-col gap-1 text-xs text-rpg-muted", className)}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={FIELD} style={R} />
    </label>
  );
}

export const yearOptions = (min: number, max: number) => Array.from({ length: max - min + 1 }, (_, i) => String(max - i)).map((y) => ({ value: y, label: y }));

export function Pager({ offset, limit, count, total, onChange }: { offset: number; limit: number; count: number; total: number | null; onChange: (offset: number) => void }) {
  const end = offset + count;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-xs text-rpg-muted" aria-label="Paginação">
      <span>
        Registros {count ? offset + 1 : 0}–{end}
        {total != null && ` de ${total.toLocaleString("pt-BR")}`}
      </span>
      <div className="flex gap-2">
        <RPGButton variant="secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Anterior
        </RPGButton>
        <RPGButton variant="secondary" disabled={count < limit || (total != null && end >= total)} onClick={() => onChange(offset + limit)}>
          Próxima
        </RPGButton>
      </div>
    </nav>
  );
}

/* ═══════════════════════ Oráculo da Cidade ═══════════════════════ */

const KIND = {
  dado: { label: "Dado real", icon: <Database size={13} aria-hidden />, cls: "border-rpg-blue/50 text-rpg-blue" },
  inferencia: { label: "Inferência", icon: <Lightbulb size={13} aria-hidden />, cls: "border-rpg-purple/50 text-rpg-purple" },
  sugestao: { label: "Sugestão", icon: <Sparkles size={13} aria-hidden />, cls: "border-rpg-orange/50 text-rpg-orange" },
} as const;

export function OracleBox({ apiId, resource, params, disabled, suggestions = [] }: { apiId: CityApi; resource: string; params: Record<string, string | number>; disabled?: boolean; suggestions?: string[] }) {
  const a = useCityActions();
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<OracleAnswer | null>(null);
  const ask = (question: string | null) => a.oracle.mutate({ api: apiId, resource, params, question }, { onSuccess: setAnswer });
  return (
    <section className="rpg-panel min-w-0 p-3" aria-label="Oráculo da Cidade">
      <div className="mb-2 flex items-center gap-2">
        <Bot size={18} className="text-rpg-purple" aria-hidden />
        <h2 className="rpg-title flex-1 text-sm font-bold uppercase">Oráculo da Cidade</h2>
        <RPGBadge tone="purple">Gemini</RPGBadge>
      </div>
      <p className="mb-2 text-xs text-rpg-muted">Lê só a amostra carregada (sem dados pessoais) e separa dado real, inferência e sugestão. Não executa ações.</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q.trim() || null);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 300))} placeholder="Pergunte sobre estes dados…" className={clsx(FIELD, "flex-1")} style={R} aria-label="Pergunta ao Oráculo" disabled={disabled} />
        <RPGButton type="submit" variant="primary" disabled={disabled || a.oracle.isPending}>
          {a.oracle.isPending ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <ScrollText size={14} aria-hidden />} Consultar
        </RPGButton>
      </form>
      {!!suggestions.length && !answer && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={disabled || a.oracle.isPending} onClick={() => (setQ(s), ask(s))} className="border border-rpg-border px-2 py-1 text-[11px] text-rpg-muted hover:text-rpg-text" style={R}>
              {s}
            </button>
          ))}
        </div>
      )}
      {a.oracle.isError && <p className="mt-2 text-sm text-rpg-red">{a.oracle.error instanceof Error ? a.oracle.error.message : "O Oráculo não respondeu."}</p>}
      {answer && (
        <div className="mt-3 space-y-1.5" aria-live="polite">
          {answer.items.map((it, i) => (
            <p key={i} className={clsx("flex items-start gap-2 border-l-4 bg-rpg-bg-2/60 px-2 py-1.5 text-sm text-rpg-text", KIND[it.kind].cls)}>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 font-pixel text-[9px] uppercase">
                {KIND[it.kind].icon}
                {KIND[it.kind].label}
              </span>
              <span className="min-w-0">{it.text}</span>
            </p>
          ))}
          <p className="text-[11px] text-rpg-muted">{answer.disclaimer}</p>
        </div>
      )}
    </section>
  );
}

export const catalogOf = (list: CatalogEntry[] | undefined, id: CityApi) => list?.find((c) => c.id === id);
export const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
export const dayBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const dateTimeBR = (d: string | null) => (d ? `${dayBR(d)}${d.length > 10 && !d.endsWith("00:00:00") ? ` ${d.slice(11, 16)}` : ""}` : "—");
