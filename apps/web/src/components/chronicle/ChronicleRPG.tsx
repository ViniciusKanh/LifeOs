import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Droplets,
  Dumbbell,
  Feather,
  FlaskConical,
  Flame,
  Heart,
  Lightbulb,
  ListChecks,
  Moon,
  NotebookPen,
  ScrollText,
  Search,
  Send,
  Smile,
  Sparkles,
  Star,
  Tags,
  Trash2,
} from "lucide-react";
import type { ChronicleHub, DayState } from "@/services/chronicleLabService";
import { useChronicleActions, useDayContext } from "@/hooks/useChronicleLab";
import { RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection, MissionList, RankPanel } from "@/components/rpg-modules/ModuleKit";

/**
 * Diário da Jornada 2.0 — peças RPG (lê /api/chronicle). O texto das
 * crônicas fica no servidor; nada aqui envia conteúdo à IA sem um clique
 * explícito do usuário.
 */

const R = { borderRadius: 4 } as const;
const dayBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const mondayOf = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const addDays = (key: string, n: number) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MOOD = ["", "😞", "😕", "😐", "🙂", "😄"];

export function ChronicleRankPanel({ hub }: { hub: ChronicleHub }) {
  const b = hub.rankBreakdown;
  return (
    <RankPanel
      title="Rank do Cronista"
      subtitle={`${hub.indicators.daysWritten} dia(s) registrados`}
      rank={hub.rank}
      valueLabel={hub.rank.points}
      unit="pts"
      icon={<Feather size={26} />}
      rules={
        <>
          Classificação de jogo pela consistência do registro, não pelo conteúdo: 10 por dia com crônica ({b.days}), 5 por dia com fechamento ({b.closedDays}), 2 por gratidão ({b.gratitudes}) e 15 por
          retrospectiva salva ({b.retros}). Quantidade de palavras não conta.
        </>
      }
    />
  );
}

export function ChronicleIndicators({ hub }: { hub: ChronicleHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <IndicatorCard tone="orange" icon={<Flame size={24} />} label="Sequência" value={`${i.streak} dias`} hint={`recorde ${i.bestStreak}`} />
      <IndicatorCard tone="purple" icon={<NotebookPen size={24} />} label="Entradas" value={i.entries} hint={`${i.daysWritten} dia(s) com registro`} />
      <IndicatorCard tone="gold" icon={<ScrollText size={24} />} label="Palavras" value={i.words.toLocaleString("pt-BR")} hint="registradas no total" />
      <IndicatorCard tone="pink" icon={<Heart size={24} />} label="Gratidões" value={i.gratitudes} hint="itens registrados" />
      <IndicatorCard tone="green" icon={<CheckCircle2 size={24} />} label="Reflexões concluídas" value={i.reflectionsClosed} hint="dias com fechamento" />
      <IndicatorCard tone="blue" icon={<FlaskConical size={24} />} label="Experimentos vinculados" value={i.experimentsLinked} hint="com observações do Diário" />
      <IndicatorCard tone="gold" icon={<Star size={24} />} label="Memórias favoritas" value={i.favorites} hint="marcadas com estrela" />
      <IndicatorCard tone="purple" icon={<Lightbulb size={24} />} label="Insights" value={hub.insights.themes.length + hub.insights.learnings.length} hint="temas e aprendizados" />
    </div>
  );
}

const STATE_CLS: Record<DayState, string> = { none: "bg-rpg-bg border-rpg-border/60", started: "bg-rpg-purple/45 border-rpg-purple/60", done: "bg-rpg-pink border-rpg-pink" };
const STATE_LABEL: Record<DayState, string> = { none: "sem registro", started: "registro iniciado", done: "registro concluído" };

/** Jornada do Registro: mapa de 365 dias. Ausência é só "sem registro" — nada se perde. */
export function ConsistencyHeatmap({ hub, onOpenDay, weeks = 53 }: { hub: ChronicleHub; onOpenDay: (d: string) => void; weeks?: number }) {
  const cells = hub.heatmap.slice(-weeks * 7);
  // Alinha a primeira coluna na segunda-feira.
  const pad = (new Date(`${cells[0]!.date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const grid: Array<{ date: string; state: DayState } | null> = [...Array.from({ length: pad }, () => null), ...cells];
  const cols = Math.ceil(grid.length / 7);
  return (
    <KitSection title="Jornada do Registro" icon={<CalendarDays size={16} />} action={<span className="text-[10px] text-rpg-muted">clique num dia para abrir</span>}>
      <div className="overflow-x-auto pb-1">
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 12px)", gridTemplateColumns: `repeat(${cols}, 12px)` }} role="grid" aria-label="Mapa de consistência do Diário">
          {grid.map((c, i) =>
            c ? (
              <button
                key={c.date}
                type="button"
                onClick={() => onOpenDay(c.date)}
                className={clsx("h-3 w-3 border", STATE_CLS[c.state], c.date === hub.today && "ring-1 ring-rpg-gold")}
                style={{ borderRadius: 2 }}
                title={`${dayBr(c.date)}/${c.date.slice(0, 4)} — ${STATE_LABEL[c.state]}`}
                aria-label={`${dayBr(c.date)}: ${STATE_LABEL[c.state]}`}
              />
            ) : (
              <span key={`p${i}`} aria-hidden />
            ),
          )}
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-rpg-muted">
        {(Object.keys(STATE_CLS) as DayState[]).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className={clsx("h-3 w-3 border", STATE_CLS[s])} style={{ borderRadius: 2 }} aria-hidden /> {STATE_LABEL[s]}
          </li>
        ))}
      </ul>
    </KitSection>
  );
}

export function ClosingRitual({ hub, onWrite }: { hub: ChronicleHub; onWrite: () => void }) {
  const done = hub.ritual.filter((r) => r.done).length;
  return (
    <KitSection title="Ritual de fechamento" icon={<Moon size={16} />} tone="gold">
      <RPGProgressBar value={done} max={hub.ritual.length} tone="purple" label="Etapas do ritual" valueLabel={`${done}/${hub.ritual.length}`} />
      <ul className="mt-2 space-y-1">
        {hub.ritual.map((r) => (
          <li key={r.key} className="flex items-center gap-2 text-sm">
            {r.done ? <CheckCircle2 size={16} className="text-rpg-green" aria-label="Feito" /> : <Circle size={16} className="text-rpg-muted" aria-label="Pendente" />}
            <span className={r.done ? "text-rpg-muted line-through" : "text-rpg-text"}>{r.title}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="rpg-btn rpg-btn-secondary mt-2 w-full text-sm" onClick={onWrite}>
        Abrir a crônica de hoje
      </button>
      <p className="mt-1 text-[10.5px] text-rpg-muted">Todas as etapas são opcionais. Elas apenas leem o que você já registrou hoje.</p>
    </KitSection>
  );
}

/** Estado do Dia: contexto lido dos módulos de origem (nada é copiado para o Diário). */
export function DayStatePanel({ date }: { date: string }) {
  const q = useDayContext(date);
  const c = q.data;
  const items = c
    ? [
        { icon: Smile, label: "Humor / energia", value: c.mood ? `${MOOD[c.mood.mood] ?? ""} ${c.mood.mood}/5 · ${c.mood.energy}/5` : "sem registro" },
        { icon: ListChecks, label: "Hábitos", value: c.habits.total ? `${c.habits.done}/${c.habits.total}` : `${c.habits.done}` },
        { icon: CheckCircle2, label: "Missões concluídas", value: String(c.tasksDone) },
        { icon: Dumbbell, label: "Exercício", value: c.workouts.count ? `${c.workouts.count} · ${c.workouts.minutes} min` : "—" },
        { icon: Droplets, label: "Água", value: c.waterMl ? `${(c.waterMl / 1000).toLocaleString("pt-BR")} L` : "—" },
        { icon: Moon, label: "Sono", value: c.sleepMinutes ? `${Math.floor(c.sleepMinutes / 60)}h${String(c.sleepMinutes % 60).padStart(2, "0")}` : "—" },
        { icon: BookOpen, label: "Leitura", value: c.pages ? `${c.pages} pág.` : "—" },
      ]
    : [];
  return (
    <KitSection title="Estado do dia" icon={<Sparkles size={16} />}>
      {q.isLoading && <div className="h-28 animate-pulse border border-rpg-border bg-rpg-bg-2" style={R} aria-busy />}
      <dl className="grid grid-cols-2 gap-1.5">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-1.5 border border-rpg-border/60 bg-rpg-bg-2/60 px-2 py-1.5" style={R}>
            <it.icon size={14} className="shrink-0 text-rpg-gold" aria-hidden />
            <div className="min-w-0">
              <dt className="truncate font-pixel text-[9px] uppercase text-rpg-muted">{it.label}</dt>
              <dd className="truncate text-xs text-rpg-text">{it.value}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[10.5px] text-rpg-muted">Contexto opcional do dia {dayBr(date)}, vindo de Saúde, Hábitos, Missões e Biblioteca.</p>
    </KitSection>
  );
}

/** Linha do Tempo da Jornada com filtros por período, categoria/etiqueta, palavra-chave e favoritas. */
export function ChronicleTimeline({ hub, onOpenDay, limit }: { hub: ChronicleHub; onOpenDay: (d: string) => void; limit?: number }) {
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">(limit ? "all" : "30");
  const [tag, setTag] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const tags = useMemo(() => [...new Set(hub.timeline.flatMap((e) => [...e.categories, ...e.tags]))].sort(), [hub.timeline]);
  const from = period === "all" ? "0000" : addDays(hub.today, -Number(period) + 1);
  const list = hub.timeline.filter(
    (e) =>
      e.date >= from &&
      (!tag || e.categories.includes(tag) || e.tags.includes(tag)) &&
      (!onlyFav || e.favorite) &&
      (!q.trim() || `${e.title} ${e.excerpt} ${e.tags.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  return (
    <KitSection title="Linha do Tempo da Jornada" icon={<ScrollText size={16} />}>
      {!limit && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <label className="relative min-w-0 flex-1 basis-44">
            <span className="sr-only">Buscar nas crônicas</span>
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar palavra-chave" className="min-h-[40px] w-full border-2 border-rpg-border bg-rpg-bg pl-7 pr-2 text-sm text-rpg-text" style={R} />
          </label>
          <label className="sr-only" htmlFor="tl-period">
            Período
          </label>
          <select id="tl-period" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text" style={R}>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <label className="sr-only" htmlFor="tl-tag">
            Categoria ou etiqueta
          </label>
          <select id="tl-tag" value={tag} onChange={(e) => setTag(e.target.value)} className="min-h-[40px] max-w-[11rem] border-2 border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text" style={R}>
            <option value="">Todas as categorias</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" aria-pressed={onlyFav} onClick={() => setOnlyFav((v) => !v)} className={clsx("inline-flex min-h-[40px] items-center gap-1 border-2 px-2 text-xs", onlyFav ? "border-rpg-gold text-rpg-gold-light" : "border-rpg-border text-rpg-muted")} style={R}>
            <Star size={12} aria-hidden /> Favoritas
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma crônica com esses filtros.</p>
      ) : (
        <ol className="relative space-y-2 border-l-2 border-rpg-purple/40 pl-4">
          {list.slice(0, limit ?? 60).map((e) => (
            <li key={e.id} className="relative">
              <span className={clsx("absolute -left-[23px] top-2 h-3 w-3 rounded-full border-2", e.favorite ? "border-rpg-gold bg-rpg-gold" : e.state === "done" ? "border-rpg-pink bg-rpg-pink" : "border-rpg-purple bg-rpg-bg")} aria-hidden />
              <button type="button" onClick={() => onOpenDay(e.date)} className="block w-full border border-rpg-border/70 bg-rpg-bg-2/60 p-2 text-left hover:border-rpg-pink/70" style={R}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-pixel text-[10px] text-rpg-gold-light">{dayBr(e.date)}/{e.date.slice(2, 4)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{e.title}</span>
                  {e.nightMood && <span aria-label={`Humor ${e.nightMood} de 5`}>{MOOD[e.nightMood]}</span>}
                  {e.favorite && <Star size={12} className="text-rpg-gold" aria-label="Favorita" />}
                </div>
                {e.excerpt && <p className="mt-0.5 line-clamp-2 text-[12px] text-rpg-muted">{e.excerpt}</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {[...e.categories, ...e.tags].slice(0, 4).map((t) => (
                    <span key={t} className="border border-rpg-purple/50 px-1 text-[10px] text-rpg-purple" style={{ borderRadius: 2 }}>
                      {t}
                    </span>
                  ))}
                  {e.media > 0 && <span className="text-[10px] text-rpg-muted">📎 {e.media}</span>}
                  {e.links.length > 0 && <span className="text-[10px] text-rpg-muted">🔗 {e.links.length}</span>}
                  {e.location && <span className="text-[10px] text-rpg-muted">📍 {e.location}</span>}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </KitSection>
  );
}

/** Insights por regras e estatística descritiva (sem diagnóstico e sem causalidade). */
export function ChronicleInsights({ hub }: { hub: ChronicleHub }) {
  const ins = hub.insights;
  const maxW = Math.max(1, ...ins.writingByWeekday.map((w) => w.count));
  const moodTotal = ins.moodDistribution.reduce((a, m) => a + m.count, 0);
  const trend = ins.last30 - ins.prev30;
  return (
    <div className="grid items-start gap-3 lg:grid-cols-2">
      <KitSection title="Frequência e consistência" icon={<CalendarDays size={16} />}>
        <p className="text-sm text-rpg-text">
          {ins.last30} crônica(s) nos últimos 30 dias ({trend === 0 ? "igual" : trend > 0 ? `+${trend}` : trend} vs. 30 dias anteriores).
        </p>
        <ul className="mt-2 grid grid-cols-7 gap-1" aria-label="Escrita por dia da semana (90 dias)">
          {ins.writingByWeekday.map((w) => (
            <li key={w.label} className="text-center">
              <div className="mx-auto flex h-16 w-5 items-end border border-rpg-border bg-rpg-bg" style={{ borderRadius: 2 }}>
                <span className="w-full bg-rpg-pink" style={{ height: `${(w.count / maxW) * 100}%` }} />
              </div>
              <span className="font-pixel text-[9px] text-rpg-muted">{w.label}</span>
            </li>
          ))}
        </ul>
      </KitSection>
      <KitSection title="Humor autorrelatado (90 dias)" icon={<Smile size={16} />}>
        {moodTotal === 0 ? (
          <p className="text-sm text-rpg-muted">Sem humor registrado no fechamento.</p>
        ) : (
          <ul className="space-y-1">
            {ins.moodDistribution.map((m) => (
              <li key={m.mood} className="flex items-center gap-2 text-sm">
                <span className="w-6" aria-label={`Humor ${m.mood}`}>
                  {MOOD[m.mood]}
                </span>
                <RPGProgressBar className="flex-1" value={m.count} max={moodTotal} tone="pink" label={`Humor ${m.mood}`} showLabel={false} />
                <span className="w-6 text-right font-pixel text-[10px] text-rpg-muted">{m.count}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10.5px] text-rpg-muted">Distribuição descritiva do que você marcou — não é avaliação de saúde mental.</p>
      </KitSection>
      <KitSection title="Temas recorrentes" icon={<Tags size={16} />}>
        {ins.themes.length === 0 ? (
          <p className="text-sm text-rpg-muted">Use etiquetas ou o organizador de momentos para ver temas.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {ins.themes.map((t) => (
              <li key={t.label} className="border border-rpg-purple/60 bg-rpg-purple/10 px-2 py-0.5 text-xs text-rpg-text" style={R}>
                {t.label} <span className="text-rpg-muted">×{t.count}</span>
              </li>
            ))}
          </ul>
        )}
      </KitSection>
      <KitSection title="Aprendizados recorrentes" icon={<Lightbulb size={16} />}>
        {ins.learnings.length === 0 ? (
          <p className="text-sm text-rpg-muted">Os aprendizados do fechamento do dia aparecem aqui.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {ins.learnings.map((l) => (
              <li key={l.date} className="text-rpg-text">
                <span className="mr-1 font-pixel text-[10px] text-rpg-gold-light">{dayBr(l.date)}</span>
                {l.text}
              </li>
            ))}
          </ul>
        )}
      </KitSection>
    </div>
  );
}

/** Retrospectiva semanal: rascunho por regras (ou IA com consentimento), editável antes de salvar. */
export function RetrospectivePanel({ hub, onToast }: { hub: ChronicleHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { generateRetro, saveRetro, deleteRetro } = useChronicleActions();
  const [week, setWeek] = useState(() => addDays(mondayOf(hub.today), -7));
  const existing = hub.retrospectives.find((r) => r.weekStart === week) ?? null;
  const [text, setText] = useState(existing?.content ?? "");
  const [consent, setConsent] = useState(false);
  useEffect(() => setText(existing?.content ?? ""), [week, existing?.content]);
  const err = (e: unknown) => onToast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(mondayOf(hub.today), -7 * i));
  return (
    <KitSection title="Retrospectiva semanal" icon={<ScrollText size={16} />} tone="legendary">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="retro-week">
          Semana
        </label>
        <select id="retro-week" value={week} onChange={(e) => setWeek(e.target.value)} className="min-h-[40px] border-2 border-rpg-border bg-rpg-bg px-2 text-xs text-rpg-text" style={R}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              Semana de {dayBr(w)}
              {hub.retrospectives.find((r) => r.weekStart === w)?.savedAt ? " ✓" : ""}
            </option>
          ))}
        </select>
        <button type="button" className="rpg-btn rpg-btn-secondary text-xs" disabled={generateRetro.isPending} onClick={() => generateRetro.mutate({ weekStart: week, useAi: false }, { onSuccess: (r) => (setText(r.content), onToast("Rascunho gerado dos seus registros.")), onError: err })}>
          Gerar rascunho
        </button>
        <button
          type="button"
          className="rpg-btn rpg-btn-primary inline-flex items-center gap-1 text-xs"
          disabled={!consent || generateRetro.isPending}
          title={consent ? undefined : "Marque a autorização abaixo para usar a IA"}
          onClick={() => generateRetro.mutate({ weekStart: week, useAi: true }, { onSuccess: (r) => (setText(r.content), onToast(r.source === "ai" ? "Versão escrita pela IA — revise antes de salvar." : "IA indisponível: rascunho por regras.")), onError: err })}
        >
          <Sparkles size={12} aria-hidden /> Escrever com IA
        </button>
      </div>
      <label className="mb-2 flex items-start gap-2 text-[11.5px] text-rpg-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        Autorizo enviar os textos desta semana ao serviço de IA configurado no LifeOS só para esta retrospectiva.
      </label>
      <label className="sr-only" htmlFor="retro-text">
        Texto da retrospectiva
      </label>
      <textarea id="retro-text" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={8000} placeholder="Gere um rascunho ou escreva sua retrospectiva." className="w-full border-2 border-rpg-border bg-rpg-bg p-2 text-sm text-rpg-text" style={R} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" className="rpg-btn rpg-btn-success text-xs" disabled={!text.trim() || saveRetro.isPending} onClick={() => saveRetro.mutate({ weekStart: week, content: text }, { onSuccess: () => onToast("Retrospectiva salva."), onError: err })}>
          Salvar retrospectiva
        </button>
        {existing && (
          <button type="button" className="inline-flex items-center gap-1 text-xs text-rpg-muted hover:text-rpg-red" onClick={() => confirm("Excluir esta retrospectiva?") && deleteRetro.mutate(week, { onSuccess: () => (setText(""), onToast("Retrospectiva excluída.")), onError: err })}>
            <Trash2 size={12} aria-hidden /> Excluir
          </button>
        )}
        <span className="text-[10.5px] text-rpg-muted">{existing?.savedAt ? "Salva" : existing ? "Rascunho (não salvo)" : ""}</span>
      </div>
    </KitSection>
  );
}

/** Diário → Laboratório: envia um trecho escolhido como observação de um experimento ativo. */
export function LabNoteSender({ hub, date, onToast }: { hub: ChronicleHub; date: string; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { sendNote } = useChronicleActions();
  const [exp, setExp] = useState("");
  const [text, setText] = useState("");
  if (hub.activeExperiments.length === 0) return null;
  return (
    <KitSection title="Observação para o Laboratório" icon={<FlaskConical size={16} />}>
      <p className="mb-1.5 text-[11px] text-rpg-muted">Escolha o experimento e escreva (ou cole) só o trecho que quer enviar. O Diário não é lido automaticamente.</p>
      <label className="sr-only" htmlFor="note-exp">
        Experimento
      </label>
      <select id="note-exp" value={exp} onChange={(e) => setExp(e.target.value)} className="mb-1.5 min-h-[40px] w-full border-2 border-rpg-border bg-rpg-bg px-2 text-sm text-rpg-text" style={R}>
        <option value="">Escolha o experimento</option>
        {hub.activeExperiments.map((e) => (
          <option key={e.id} value={e.id}>
            {e.emoji ? `${e.emoji} ` : ""}
            {e.title}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="note-text">
        Observação
      </label>
      <textarea id="note-text" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1500} placeholder="O que você percebeu hoje em relação ao experimento?" className="w-full border-2 border-rpg-border bg-rpg-bg p-2 text-sm text-rpg-text" style={R} />
      <button
        type="button"
        className="rpg-btn rpg-btn-secondary mt-1.5 inline-flex w-full items-center justify-center gap-1 text-sm"
        disabled={!exp || !text.trim() || sendNote.isPending}
        onClick={() => sendNote.mutate({ date, experimentId: exp, text }, { onSuccess: (r) => (setText(""), onToast(r.duplicated ? "Essa observação já estava no experimento." : "Observação enviada ao Laboratório.")), onError: (e) => onToast(e instanceof Error ? e.message : "Falhou.", "error") })}
      >
        <Send size={13} aria-hidden /> Enviar ao Laboratório
      </button>
    </KitSection>
  );
}

export function ChronicleMissions({ hub }: { hub: ChronicleHub }) {
  return (
    <KitSection title="Missões do Cronista" icon={<Sparkles size={16} />}>
      <MissionList missions={hub.missions} />
      <p className="mt-2 text-[10.5px] text-rpg-muted">As quests de diário do Quadro de Avisos contam os mesmos registros (sem XP em dobro).</p>
    </KitSection>
  );
}
