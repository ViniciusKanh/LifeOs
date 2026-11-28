import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle, Bot, Clock3, Database, Download, Info, KeyRound, Lightbulb, Loader2, RefreshCw, ScrollText, ShieldAlert, Sparkles, Star } from "lucide-react";
import { RPGBadge, RPGButton, type RpgTone } from "@/components/rpg";
import { ApiError } from "@/services/api";
import type { CatalogEntry, Cell, CityApi, CityApiState, CityDomain, ColumnKind, ColumnMeta, FetchMeta, OracleAnswer, Row } from "@/services/cityService";
import { useCityActions, useCityCatalog } from "@/hooks/useCity";

export const R = { borderRadius: 4 } as const;
export const FIELD = "min-h-[40px] w-full min-w-0 border border-rpg-border bg-rpg-bg-2 px-2 text-sm text-rpg-text outline-none focus:border-rpg-gold focus-visible:ring-2 focus-visible:ring-rpg-gold/40";

/* ═══════════════════════ identidade por domínio ═══════════════════════ */

/** Cores por domínio (pedido do produto): o mesmo RPG, com o "brasão" de cada área. */
export const DOMAIN: Record<CityDomain, { label: string; from: string; to: string; text: string; border: string; tone: RpgTone }> = {
  educacao: { label: "Educação", from: "#1e3a8a", to: "#7c3aed", text: "text-violet-300", border: "border-violet-400/60", tone: "purple" },
  financas: { label: "Finanças públicas", from: "#713f12", to: "#eab308", text: "text-amber-300", border: "border-amber-400/60", tone: "gold" },
  mobilidade: { label: "Mobilidade", from: "#1e40af", to: "#f97316", text: "text-orange-300", border: "border-orange-400/60", tone: "orange" },
  cidadania: { label: "Cidadania", from: "#164e63", to: "#06b6d4", text: "text-cyan-300", border: "border-cyan-400/60", tone: "cyan" },
  consumo: { label: "Consumo", from: "#3b0764", to: "#a855f7", text: "text-purple-300", border: "border-purple-400/60", tone: "purple" },
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
export function SourceStrip({ apiId, meta, reference }: { apiId: CityApi; meta?: (Partial<FetchMeta> & { fetchedAt: string }) | null; reference?: string | null }) {
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
      {!!meta?.redacted?.length && <p className="mt-2 text-rpg-muted">Por privacidade, campos pessoais foram ocultados: {meta.redacted!.join(", ")}.</p>}
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

const NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
export const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
/** R$ compacto para cards (R$ 4,6 mi / R$ 1,2 bi). */
export const moneyShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e9) return `R$ ${NUM.format(n / 1e9)} bi`;
  if (a >= 1e6) return `R$ ${NUM.format(n / 1e6)} mi`;
  if (a >= 1e4) return `R$ ${NUM.format(n / 1e3)} mil`;
  return money(n);
};
export const duration = (sec: number) => {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
};
export const dayBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
export const dateTimeBR = (d: string | null) => (d ? `${dayBR(d)}${d.length > 10 ? ` ${d.slice(11, 16)}` : ""}` : "—");

/** Formata um valor pelo tipo que o servidor deu à coluna. */
export function formatValue(kind: ColumnKind, v: Cell | undefined, opts: { short?: boolean } = {}): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") {
    if (kind === "money") return opts.short ? moneyShort(v) : money(v);
    if (kind === "percent") return `${NUM.format(v)}%`;
    if (kind === "duration") return duration(v);
    if (kind === "code") return String(v);
    return NUM.format(v);
  }
  if (typeof v === "string" && (kind === "date" || kind === "datetime")) return dateTimeBR(v);
  return cellText(v);
}
const RIGHT: ColumnKind[] = ["money", "number", "percent", "duration"];

/** Colunas preferidas primeiro (quando existem), depois as demais, até `max`. */
export function pickColumns(columns: ColumnMeta[], prefer: RegExp[] = [], max = 8): ColumnMeta[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const chosen: ColumnMeta[] = [];
  for (const re of prefer) {
    const c = columns.find((x) => !chosen.includes(x) && (re.test(norm(x.key)) || re.test(norm(x.label))));
    if (c) chosen.push(c);
  }
  for (const c of columns) if (!chosen.includes(c)) chosen.push(c);
  return chosen.slice(0, max);
}

export function DataTable({ rows, columns, caption, actions, onRowOpen, wrap = [] }: { rows: Row[]; columns: ColumnMeta[]; caption: string; actions?: (r: Row, i: number) => ReactNode; onRowOpen?: (r: Row) => void; wrap?: string[] }) {
  if (!rows.length) return <EmptyBox title="Nenhum registro para este filtro." />;
  return (
    <>
      {/* desktop/tablet: tabela com rolagem própria (nunca estoura a página) */}
      <div className="hidden max-h-[560px] overflow-auto border-2 border-rpg-border md:block" style={R}>
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-[1] bg-rpg-panel-light">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={clsx("whitespace-nowrap px-2 py-2 text-left font-pixel text-[10px] uppercase text-rpg-gold", RIGHT.includes(c.kind) && "text-right")} title={c.key}>
                  {c.label}
                </th>
              ))}
              {actions && <th className="sr-only">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={clsx("border-t border-rpg-border/60 odd:bg-rpg-bg-2/40", onRowOpen && "cursor-pointer hover:bg-rpg-panel-hover")} onClick={onRowOpen ? () => onRowOpen(r) : undefined}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={clsx("px-2 py-1.5 text-rpg-text/90", RIGHT.includes(c.kind) && "whitespace-nowrap text-right tabular-nums", wrap.includes(c.key) ? "min-w-[260px] max-w-[420px] whitespace-normal" : "max-w-[260px] truncate", c.kind === "money" && "text-rpg-gold-light")}
                    title={formatValue(c.kind, r[c.key])}
                  >
                    {wrap.includes(c.key) ? <span className="line-clamp-2">{formatValue(c.kind, r[c.key])}</span> : formatValue(c.kind, r[c.key])}
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
              <p className="line-clamp-2 font-semibold text-rpg-text">{formatValue(columns[0]!.kind, r[columns[0]!.key])}</p>
              <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                {columns.slice(1, 7).map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="truncate text-rpg-muted">{c.label}</dt>
                    <dd className={clsx("truncate", c.kind === "money" ? "text-rpg-gold-light" : "text-rpg-text/90")}>{formatValue(c.kind, r[c.key])}</dd>
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

/** Ficha completa de um registro (todas as colunas, já formatadas). */
export function RecordSheet({ row, columns }: { row: Row; columns: ColumnMeta[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
      {columns.map((c) => {
        const long = typeof row[c.key] === "string" && String(row[c.key]).length > 80;
        return (
          <div key={c.key} className={clsx("min-w-0 border-b border-rpg-border/50 pb-1", long && "sm:col-span-2")}>
            <dt className="truncate font-pixel text-[10px] uppercase text-rpg-muted">{c.label}</dt>
            <dd className={clsx("whitespace-pre-line break-words", c.kind === "money" ? "text-rpg-gold-light" : "text-rpg-text")}>{formatValue(c.kind, row[c.key])}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ═══════════════════════ ações pessoais ═══════════════════════ */

export function exportCsv(rows: Row[], columns: ColumnMeta[], filename: string) {
  const esc = (v: Cell | undefined) => {
    const s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ";" + vírgula decimal + BOM: abre certo no Excel em português.
  const csv = "\ufeff" + [columns.map((c) => c.label).join(";"), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvButton({ rows, columns, filename }: { rows: Row[]; columns: ColumnMeta[]; filename: string }) {
  return (
    <RPGButton variant="ghost" disabled={!rows.length} onClick={() => exportCsv(rows, columns, filename)} aria-label="Exportar os registros carregados em CSV">
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

