import { useMemo } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Copy, Crown, History, Pencil, Plus, Scale, Sparkles, Trash2, TrendingUp, Zap, GraduationCap, Gift, BarChart3 } from "lucide-react";
import { RPGAvatar } from "@/components/rpg/RPGAvatar";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { useSkillTree } from "@/hooks/useSkillTree";
import { STATE_LABEL, type SkillPreset, type SkillTreeView } from "@/services/skillTreeService";
import { BRANCH_ICON, BRANCH_TEXT, BRANCH_VAR, Box, Chip, STATE_TONE, Segments, TYPE_LABEL, skillIcon } from "./skillShared";

const TOOLTIP = { contentStyle: { background: "rgb(var(--rpg-panel))", border: "1px solid rgb(var(--rpg-border))", borderRadius: 4, fontSize: 12 }, labelStyle: { color: "rgb(var(--rpg-gold-light))" } };

export function JourneyCard({ v }: { v: SkillTreeView }) {
  const { avatarId } = useRpgAvatar();
  return (
    <Box title="Sua jornada" icon={<Crown size={14} />} gold>
      <div className="flex items-center gap-3">
        <RPGAvatar avatarId={avatarId} size="lg" frame="gold" alt="" />
        <div className="min-w-0 flex-1">
          <span className="inline-block border-2 border-rpg-gold/70 bg-rpg-bg px-2 py-0.5 font-rpg text-lg font-bold text-rpg-gold-light" style={{ borderRadius: 3 }}>
            Nível {v.hero.level}
          </span>
          <Segments className="mt-2" value={Math.round(v.hero.progressPct / 10)} max={10} tone="--rpg-purple" />
          <p className="mt-1 text-xs tabular-nums text-rpg-text">
            {v.hero.xpIntoLevel.toLocaleString("pt-BR")} / {v.hero.xpForNextLevel.toLocaleString("pt-BR")} XP
          </p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {[
          { l: "Pontos totais", v: v.points.total, i: <Sparkles size={14} className="text-rpg-gold" /> },
          { l: "Pontos investidos", v: v.points.invested, i: <BarChart3 size={14} className="text-rpg-green" /> },
          { l: "Pontos disponíveis", v: v.points.available, i: <Sparkles size={14} className="text-rpg-purple" /> },
        ].map((r) => (
          <div key={r.l} className="flex items-center gap-2">
            <span aria-hidden>{r.i}</span>
            <dt className="flex-1 text-rpg-text">{r.l}</dt>
            <dd className="font-bold tabular-nums text-rpg-text">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-rpg-border pt-2" title={v.title.rule}>
        <p className="text-[11px] uppercase tracking-wide text-rpg-muted">Título da árvore</p>
        <p className="font-rpg text-base font-bold text-rpg-gold-light">{v.title.title}</p>
        {v.title.next && (
          <p className="text-[10.5px] text-rpg-muted">
            {v.points.invested}/{v.title.next.min} PH investidos → {v.title.next.title}
          </p>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-rpg-muted">{v.points.rule}</p>
    </Box>
  );
}

export function ActiveEffects({ v, onAll }: { v: SkillTreeView; onAll: () => void }) {
  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of v.effects) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m];
  }, [v.effects]);
  return (
    <Box title={`Bônus ativos (${v.effects.length})`} icon={<Gift size={14} />}>
      {v.effects.length === 0 ? (
        <p className="text-xs text-rpg-muted">Desbloqueie habilidades para liberar rituais de foco, modelos, reflexões e análises nos módulos.</p>
      ) : (
        <ul className="space-y-1.5">
          {byType.map(([t, n]) => (
            <li key={t} className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rotate-45 bg-rpg-gold" aria-hidden />
              <span className="flex-1 text-rpg-text">{TYPE_LABEL[t] ?? t}</span>
              <span className="font-bold tabular-nums text-rpg-green">+{n}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onAll} className="mt-3 w-full border border-rpg-border bg-rpg-bg-2/70 px-2 py-1.5 text-xs font-semibold text-rpg-text hover:border-rpg-gold" style={{ borderRadius: 3 }}>
        Ver e usar todos os bônus →
      </button>
      <p className="mt-1.5 text-[10px] text-rpg-muted">Bônus são recursos opcionais do app. Nenhum altera Life Score, hábitos ou métricas reais.</p>
    </Box>
  );
}

export function BranchProgress({ v, onBranch }: { v: SkillTreeView; onBranch: (b: SkillTreeView["branches"][number]["key"]) => void }) {
  return (
    <Box title="Progresso por ramo" icon={<TrendingUp size={14} />}>
      <ul className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
        {v.branches.map((b) => {
          const Icon = BRANCH_ICON[b.key];
          return (
            <li key={b.key}>
              <button type="button" onClick={() => onBranch(b.key)} className="grid w-full grid-cols-[18px_96px_minmax(0,1fr)_38px] items-center gap-2 text-left text-sm hover:opacity-90" title={`${b.unlocked}/${b.skills} habilidades · nível médio ${b.avgLevel}`}>
                <Icon size={15} className={BRANCH_TEXT[b.key]} aria-hidden />
                <span className="truncate text-rpg-text">{b.label}</span>
                <span className="h-2.5 overflow-hidden border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                  <span className="block h-full" style={{ width: `${b.pct}%`, background: `rgb(var(${BRANCH_VAR[b.key]}))` }} />
                </span>
                <span className="text-right text-xs font-bold tabular-nums text-rpg-text">{b.pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-rpg-muted">Especialização da árvore = níveis investidos por ramo. Não é o Life Score.</p>
    </Box>
  );
}

const PRESET_ICON: Record<string, JSX.Element> = { Scale: <Scale size={18} />, Zap: <Zap size={18} />, GraduationCap: <GraduationCap size={18} />, Sparkles: <Sparkles size={18} /> };

export function PresetsBar({ presets, onOpen, onNew, onEdit, onDuplicate, onDelete }: { presets: SkillPreset[]; onOpen: (p: SkillPreset) => void; onNew: () => void; onEdit: (p: SkillPreset) => void; onDuplicate: (p: SkillPreset) => void; onDelete: (p: SkillPreset) => void }) {
  return (
    <Box title="Presets de evolução" icon={<Sparkles size={14} />} gold>
      <p className="-mt-1 mb-2 text-[11px] text-rpg-muted">Distribuições sugeridas. Aplicar sempre mostra a simulação e pede confirmação — nunca concede pontos nem pula requisitos.</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {presets.map((p) => (
          <li key={p.id} className="shrink-0">
            <div className={clsx("flex w-[176px] flex-col border-2 bg-rpg-bg-2/70 p-2", p.builtin ? "border-rpg-gold/60" : "border-rpg-purple/50")} style={{ borderRadius: 4 }}>
              <button type="button" onClick={() => onOpen(p)} className="flex items-start gap-2 text-left">
                <span className="mt-0.5 text-rpg-gold" aria-hidden>
                  {PRESET_ICON[p.icon] ?? <Sparkles size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-rpg-text">{p.name}</span>
                  <span className="line-clamp-2 block text-[10.5px] text-rpg-muted">{p.description || `${p.targets.length} alvo(s)`}</span>
                </span>
              </button>
              <div className="mt-1.5 flex items-center gap-1 text-rpg-muted">
                <span className="text-[10px]">{p.targets.length} alvos</span>
                <span className="ml-auto flex gap-0.5">
                  <IconBtn label={`Duplicar ${p.name}`} onClick={() => onDuplicate(p)}>
                    <Copy size={12} />
                  </IconBtn>
                  {!p.builtin && (
                    <>
                      <IconBtn label={`Editar ${p.name}`} onClick={() => onEdit(p)}>
                        <Pencil size={12} />
                      </IconBtn>
                      <IconBtn label={`Excluir ${p.name}`} onClick={() => onDelete(p)}>
                        <Trash2 size={12} />
                      </IconBtn>
                    </>
                  )}
                </span>
              </div>
            </div>
          </li>
        ))}
        <li className="shrink-0">
          <button type="button" onClick={onNew} className="flex h-full min-h-[76px] w-16 items-center justify-center border-2 border-dashed border-rpg-border text-rpg-gold hover:border-rpg-gold" style={{ borderRadius: 4 }} aria-label="Criar preset personalizado">
            <Plus size={20} />
          </button>
        </li>
      </ul>
    </Box>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: JSX.Element }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="p-1 hover:text-rpg-gold-light">
      {children}
    </button>
  );
}

export function HistoryPanel({ v }: { v: SkillTreeView }) {
  const items = [...v.history.map((h) => ({ at: h.at, kind: h.kind, text: h.kind === "reset" ? `Árvore redefinida (+${-h.points} PH reembolsados)` : `${h.name} → nível ${h.to}`, detail: h.kind === "reset" ? `ciclo ${h.epoch + 1}` : `−${h.points} PH · ${h.origin === "manual" ? "manual" : h.origin === "build" ? "build" : h.origin === "preset" ? "preset" : "Oráculo"}` })), ...v.grants.map((g) => ({ at: g.at, kind: "grant" as const, text: g.label, detail: `+${g.amount} PH` }))]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
  return (
    <Box title="Histórico de evolução" icon={<History size={14} />}>
      {items.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhum investimento ainda.</p>
      ) : (
        <ol className="relative max-h-[420px] space-y-2 overflow-y-auto border-l-2 border-rpg-border pl-4">
          {items.map((h, i) => (
            <li key={i} className="relative">
              <span className={clsx("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rotate-45 border", h.kind === "reset" ? "border-rpg-orange bg-rpg-orange" : h.kind === "grant" ? "border-rpg-gold bg-rpg-bg" : "border-rpg-purple bg-rpg-purple")} aria-hidden />
              <p className="text-[13px] font-semibold text-rpg-text">{h.text}</p>
              <p className="text-[10.5px] text-rpg-muted">
                {new Date(h.at.includes("T") ? h.at : `${h.at.replace(" ", "T")}Z`).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.detail}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Box>
  );
}

export function StatsPanel({ v, simulated }: { v: SkillTreeView; simulated?: Array<{ branch: string; pct: number }> | null }) {
  const radar = v.branches.filter((b) => b.key !== "avancada").map((b) => ({ ramo: b.label, Atual: b.pct, Desejada: simulated?.find((s) => s.branch === b.key)?.pct ?? null }));
  const timeline = useMemo(() => {
    const ups = [...v.history].filter((h) => h.kind === "upgrade").sort((a, b) => a.at.localeCompare(b.at));
    let total = 0;
    const byDay = new Map<string, number>();
    for (const h of ups) {
      total += h.points;
      byDay.set(h.at.slice(0, 10), total);
    }
    return [...byDay].map(([d, n]) => ({ dia: d.slice(5).split("-").reverse().join("/"), PH: n }));
  }, [v.history]);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
      <Box title="Radar de especialização" icon={<Sparkles size={14} />}>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="rgb(var(--rpg-border) / 0.6)" />
              <PolarAngleAxis dataKey="ramo" tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 11 }} />
              <Radar name="Atual" dataKey="Atual" stroke="rgb(var(--rpg-purple))" fill="rgb(var(--rpg-purple))" fillOpacity={0.45} />
              {simulated && <Radar name="Desejada" dataKey="Desejada" stroke="rgb(var(--rpg-gold))" fill="none" strokeDasharray="4 3" />}
              <Tooltip {...TOOLTIP} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </Box>
      <Box title="Investimentos no tempo" icon={<TrendingUp size={14} />}>
        {timeline.length < 2 ? (
          <p className="py-10 text-center text-sm text-rpg-muted">O gráfico aparece a partir do segundo dia com investimentos.</p>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--rpg-border) / 0.5)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fill: "rgb(var(--rpg-text-muted))", fontSize: 11 }} />
                <Tooltip {...TOOLTIP} />
                <Line type="stepAfter" dataKey="PH" stroke="rgb(var(--rpg-gold))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Box>
      <Box title="Números da árvore" icon={<BarChart3 size={14} />}>
        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Desbloqueadas", `${v.stats.unlocked}/${v.stats.total}`],
            ["Maximizadas", String(v.stats.maxed)],
            ["Prontas para evoluir", String(v.stats.available)],
            ["Níveis", `${v.stats.levels}/${v.stats.maxLevels}`],
            ["PH investidos", String(v.points.invested)],
            ["Reembolsados", String(v.points.refunded)],
          ].map(([l, n]) => (
            <div key={l} className="border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
              <dd className="text-lg font-bold tabular-nums text-rpg-text">{n}</dd>
              <dt className="text-[10px] uppercase tracking-wide text-rpg-muted">{l}</dt>
            </div>
          ))}
        </dl>
        {v.nearest.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-rpg-gold-light">Próximos desbloqueios</p>
            <ul className="mt-1 space-y-1 text-[11.5px] text-rpg-text">
              {v.nearest.slice(0, 3).map((n) => (
                <li key={n.key}>
                  <strong>{n.name} nv. {n.level}</strong> <span className="text-rpg-muted">— falta: {n.missing.join("; ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Box>
    </div>
  );
}

/** Alternativa acessível ao grafo: a mesma árvore em lista, por ramo. */
export function SkillList({ v, onSelect, selected }: { v: SkillTreeView; onSelect: (k: string) => void; selected: string | null }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {v.branches.map((b) => (
        <section key={b.key} className="rpg-panel p-2.5" aria-label={b.label}>
          <h3 className={clsx("mb-1.5 font-pixel text-[12px] uppercase tracking-wider", BRANCH_TEXT[b.key])}>{b.label}</h3>
          <ul className="space-y-1">
            {v.skills
              .filter((s) => s.branch === b.key)
              .map((s) => {
                const Icon = skillIcon(s.icon);
                return (
                  <li key={s.key}>
                    <button type="button" onClick={() => onSelect(s.key)} aria-pressed={selected === s.key} className={clsx("flex w-full items-center gap-2 border px-2 py-1.5 text-left text-sm", selected === s.key ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border bg-rpg-bg-2/60 hover:border-rpg-gold/60")} style={{ borderRadius: 3 }}>
                      <Icon size={15} className={BRANCH_TEXT[s.branch]} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-rpg-text">
                        <span className="text-[10px] text-rpg-muted">T{s.tier} · </span>
                        {s.name}
                      </span>
                      <span className="text-[11px] tabular-nums text-rpg-muted">
                        {s.level}/{s.maxLevel}
                      </span>
                      <Chip className={STATE_TONE[s.state]}>{STATE_LABEL[s.state]}</Chip>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Resumo da especialização para o Perfil do Herói e a Build (o cálculo dos arquétipos não muda). */
export function SkillTreeSummary({ v }: { v: SkillTreeView }) {
  const top = [...v.branches].filter((b) => b.levels > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  return (
    <Box title="Árvore de Habilidades" icon={<Sparkles size={14} />} action={<Link to="/arvore-habilidades" className="text-xs font-semibold text-rpg-gold-light hover:underline">Abrir →</Link>}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-rpg text-lg font-bold text-rpg-gold-light">{v.title.title}</p>
        <p className="text-sm text-rpg-text">
          <strong>{v.points.available}</strong> PH disponíveis · {v.stats.unlocked}/{v.stats.total} habilidades · {v.effects.length} bônus ativos
        </p>
      </div>
      {top.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {top.map((b) => (
            <li key={b.key} className={clsx("border px-2 py-1 text-xs font-semibold", BRANCH_TEXT[b.key])} style={{ borderRadius: 3, borderColor: `rgb(var(${BRANCH_VAR[b.key]}) / 0.6)` }}>
              {b.label} {b.pct}%
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-rpg-muted">Nenhuma especialização ainda — invista seus primeiros PH.</p>
      )}
    </Box>
  );
}


/** Cartão para o Perfil do Herói e a Build (busca os dados da própria árvore). */
export function SkillTreeSummaryCard() {
  const q = useSkillTree();
  if (!q.data) return null;
  return <SkillTreeSummary v={q.data} />;
}
