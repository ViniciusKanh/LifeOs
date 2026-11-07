import { useMemo, useState } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, Clock, Percent, Repeat, ScrollText, Target, TrendingUp } from "lucide-react";
import { useProofHistory } from "@/hooks/usePersonalSkills";
import { DOMAINS, DOMAIN_LABEL, PROOF_LABEL, type PersonalSkill, type ProofHistory, type SkillDomain } from "@/services/personalSkillsService";
import { Box, Chip, DOMAIN_TEXT, DOMAIN_VAR, FIELD, Segments, errMsg, fmtDate } from "./skillShared";

const TOOLTIP = { contentStyle: { background: "rgb(var(--rpg-panel))", border: "2px solid rgb(var(--rpg-border))", borderRadius: 4, fontSize: 12, color: "rgb(var(--rpg-text))" }, labelStyle: { color: "rgb(var(--rpg-gold-light))" } };
const AXIS = { tickLine: false, axisLine: false, fontSize: 10, tick: { fill: "rgb(var(--rpg-text-muted))" } } as const;
const STATUS_TONE: Record<string, string> = {
  aprovada: "border-rpg-green/60 text-rpg-green",
  reprovada: "border-rpg-red/60 text-rpg-red",
  aberta: "border-rpg-gold/60 text-rpg-gold-light",
  corrigindo: "border-rpg-gold/60 text-rpg-gold-light",
};
const MONTH = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

/**
 * Registro de todas as provas feitas e a evolução derivada delas: notas no
 * tempo (com a nota mínima de cada prova), provas por mês, desempenho por
 * habilidade e lista completa (cada prova reabre com a correção).
 */
export function ProofHistoryPanel({ skills, onOpenProof, onSelectSkill }: { skills: PersonalSkill[]; onOpenProof: (id: string) => void; onSelectSkill: (id: string) => void }) {
  const [domain, setDomain] = useState<SkillDomain | "">("");
  const [skillId, setSkillId] = useState("");
  const [status, setStatus] = useState<"" | "aprovada" | "reprovada">("");
  const q = useProofHistory({ domain: domain || null, skillId: skillId || null });
  const d = q.data;
  const options = useMemo(() => skills.filter((s) => !domain || s.domain === domain).sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" "))), [skills, domain]);
  const items = useMemo(() => (d?.items ?? []).filter((i) => !status || i.status === status), [d, status]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-rpg-muted">
          Tronco
          <select value={domain} onChange={(e) => (setDomain(e.target.value as SkillDomain | ""), setSkillId(""))} className={clsx(FIELD, "mt-1 w-40")}>
            <option value="">Todos</option>
            {DOMAINS.map((x) => (
              <option key={x} value={x}>
                {DOMAIN_LABEL[x]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1 text-xs text-rpg-muted sm:max-w-xs">
          Habilidade
          <select value={skillId} onChange={(e) => setSkillId(e.target.value)} className={clsx(FIELD, "mt-1")}>
            <option value="">Todas</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.path.join(" › ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-rpg-muted">
          Resultado
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={clsx(FIELD, "mt-1 w-36")}>
            <option value="">Todos</option>
            <option value="aprovada">Aprovadas</option>
            <option value="reprovada">Reprovadas</option>
          </select>
        </label>
      </div>

      {q.isLoading ? (
        <div className="grid gap-3 lg:grid-cols-2" aria-busy aria-label="Carregando histórico">
          <div className="rpg-panel h-40 animate-pulse" />
          <div className="rpg-panel h-40 animate-pulse" />
        </div>
      ) : q.isError || !d ? (
        <p className="rpg-panel p-3 text-sm text-rpg-red">{errMsg(q.error, "Não consegui carregar o histórico de provas.")}</p>
      ) : d.summary.total === 0 && d.summary.open === 0 ? (
        <div className="rpg-panel border-dashed p-6 text-center">
          <ScrollText size={22} className="mx-auto mb-2 text-rpg-gold-light" aria-hidden />
          <p className="text-sm text-rpg-text">Nenhuma prova entregue {domain || skillId ? "com esse filtro" : "ainda"}.</p>
          <p className="mt-1 text-xs text-rpg-muted">Escolha uma habilidade na árvore e faça a prova do próximo nível — cada entrega fica registrada aqui, com nota e correção.</p>
        </div>
      ) : (
        <>
          <Summary d={d} />
          <div className="grid gap-3 lg:grid-cols-2">
            <Box title="Notas ao longo do tempo" icon={<TrendingUp size={14} />}>
              {d.series.length < 2 ? (
                <p className="py-6 text-center text-xs text-rpg-muted">O gráfico aparece a partir da segunda prova entregue.</p>
              ) : (
                <div className="h-52" role="img" aria-label="Nota de cada prova entregue, em ordem cronológica">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.series.map((p, n) => ({ ...p, n: n + 1, label: fmtDate(p.at) }))} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                      <CartesianGrid vertical={false} stroke="rgb(var(--rpg-border) / 0.6)" strokeDasharray="3 3" />
                      <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
                      <YAxis domain={[0, 100]} {...AXIS} />
                      <ReferenceLine y={70} stroke="rgb(var(--rpg-gold) / 0.5)" strokeDasharray="4 4" />
                      <Tooltip
                        {...TOOLTIP}
                        formatter={(v, name, item) => {
                          const p = item.payload as ProofHistory["series"][number];
                          return name === "Nota" ? [`${Number(v)}/100 (mínima ${p.passScore}) · ${p.passed ? "aprovada" : "reprovada"}`, `${p.skillName} nv. ${p.level}`] : [String(v), String(name)];
                        }}
                      />
                      <Line type="monotone" dataKey="score" name="Nota" stroke="rgb(var(--rpg-purple))" strokeWidth={2.5} dot={(props) => {
                        const p = props.payload as ProofHistory["series"][number];
                        return <circle key={`${props.cx}-${props.cy}`} cx={props.cx} cy={props.cy} r={4.5} fill={p.passed ? "rgb(var(--rpg-green))" : "rgb(var(--rpg-red))"} stroke="rgb(var(--rpg-bg))" strokeWidth={1.5} />;
                      }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-1 text-[10.5px] text-rpg-muted">Ponto verde = aprovada, vermelho = reprovada. Linha tracejada: nota mínima dos níveis 1–2 (sobe para 75 e 80 nos níveis altos).</p>
            </Box>
            <Box title="Provas por mês" icon={<ScrollText size={14} />}>
              <div className="h-52" role="img" aria-label="Provas aprovadas e reprovadas por mês">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.months.map((m) => ({ ...m, label: MONTH(m.month) }))} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
                    <CartesianGrid vertical={false} stroke="rgb(var(--rpg-border) / 0.6)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" {...AXIS} />
                    <YAxis allowDecimals={false} {...AXIS} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "rgb(var(--rpg-gold) / 0.08)" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="approved" name="Aprovadas" stackId="a" fill="rgb(var(--rpg-green))" maxBarSize={32} />
                    <Bar dataKey="failed" name="Reprovadas" stackId="a" fill="rgb(var(--rpg-red) / 0.75)" maxBarSize={32} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Box>
          </div>

          {d.bySkill.length > 0 && (
            <Box title="Evolução por habilidade" icon={<Target size={14} />}>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {d.bySkill.map((s) => (
                  <li key={s.skillId}>
                    <button type="button" onClick={() => onSelectSkill(s.skillId)} className="w-full border border-rpg-border bg-rpg-bg-2/60 px-2 py-1.5 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                      <span className="flex items-center gap-2">
                        <span className={clsx("min-w-0 flex-1 truncate text-sm font-semibold", DOMAIN_TEXT[s.domain])} title={s.path.join(" › ")}>
                          {s.name}
                        </span>
                        <span className="w-20 shrink-0">
                          <Segments value={s.level} max={s.maxLevel} tone={DOMAIN_VAR[s.domain]} />
                        </span>
                        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-rpg-text">
                          {s.level}/{s.maxLevel}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-rpg-muted">
                        {s.attempts} prova(s) · {s.approved} aprovada(s) · melhor {s.best} · média {s.avg ?? "—"} · última {fmtDate(s.last)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Box>
          )}

          <Box title={`Provas registradas (${items.length})`} icon={<Clock size={14} />}>
            {items.length === 0 ? (
              <p className="text-xs text-rpg-muted">Nenhuma prova com esse resultado.</p>
            ) : (
              <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                {items.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => onOpenProof(i.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 border border-rpg-border bg-rpg-bg-2/60 px-2.5 py-2 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }} aria-label={`Abrir prova de ${i.skillName}, nível ${i.targetLevel}`}>
                      <span className="min-w-0 flex-1">
                        <span className={clsx("block truncate text-[11px] font-bold uppercase tracking-wide", DOMAIN_TEXT[i.domain])}>{i.path.slice(0, -1).join(" › ") || DOMAIN_LABEL[i.domain]}</span>
                        <span className="block truncate text-sm font-semibold text-rpg-text">
                          {i.skillName} · nível {i.targetLevel}
                          {i.levelTitle ? ` (${i.levelTitle})` : ""}
                        </span>
                        <span className="block text-[11px] text-rpg-muted">
                          {PROOF_LABEL[i.kind]} · {fmtDate(i.submittedAt ?? i.createdAt)}
                          {i.minutes != null ? ` · ${i.minutes} min` : ""}
                        </span>
                      </span>
                      {i.score != null && (
                        <span className={clsx("font-rpg text-xl font-bold tabular-nums", i.status === "aprovada" ? "text-rpg-green" : "text-rpg-red")}>
                          {i.score}
                          <span className="ml-1 font-sans text-[10.5px] font-normal text-rpg-muted">mín. {i.passScore}</span>
                        </span>
                      )}
                      <Chip className={STATUS_TONE[i.status] ?? "border-rpg-border text-rpg-muted"}>{i.status === "aberta" ? "em andamento" : i.status}</Chip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[10.5px] text-rpg-muted">Toque numa prova para rever as questões, suas respostas, a correção e a resposta-modelo.</p>
          </Box>
        </>
      )}
    </div>
  );
}

function Summary({ d }: { d: ProofHistory }) {
  const s = d.summary;
  const tiles = [
    { l: "Provas entregues", v: s.total, i: <ScrollText size={15} className="text-rpg-gold" /> },
    { l: "Aprovadas", v: `${s.approved}${s.total ? ` (${s.passRate}%)` : ""}`, i: <Award size={15} className="text-rpg-green" /> },
    { l: "Nota média", v: s.avgScore ?? "—", i: <Percent size={15} className="text-rpg-purple" /> },
    { l: "Melhor nota", v: s.bestScore ?? "—", i: <TrendingUp size={15} className="text-rpg-blue" /> },
    { l: "Tentativas por nível", v: s.avgAttemptsToPass ?? "—", i: <Repeat size={15} className="text-rpg-orange" /> },
    { l: "Em andamento", v: s.open, i: <Clock size={15} className="text-rpg-gold-light" /> },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.l} className="rpg-panel flex items-center gap-2 px-2.5 py-2">
          <span aria-hidden>{t.i}</span>
          <div className="min-w-0">
            <dt className="truncate text-[10.5px] uppercase tracking-wide text-rpg-muted">{t.l}</dt>
            <dd className="font-rpg text-lg font-bold leading-tight tabular-nums text-rpg-text">{t.v}</dd>
          </div>
        </div>
      ))}
      {s.firstAt && (
        <p className="col-span-full text-[11px] text-rpg-muted">
          Desde {fmtDate(s.firstAt)} · última entrega {fmtDate(s.lastAt)} · tentativas por nível = média de provas até aprovar cada nível
        </p>
      )}
    </dl>
  );
}
