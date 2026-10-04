import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown, Flag, Lock, ScrollText, Sparkles, Trophy } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGButton, RPGPanel, RPGProgressBar, RPGStatCard } from "@/components/rpg";
import { RPG_TONE_SOFT, RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import { TIER_LABEL } from "@/components/achievements/tierDisplay";
import { useAchievements } from "@/hooks/useAchievements";
import { useCodexMilestones } from "@/hooks/useCodex";
import { useHabits } from "@/hooks/useHabits";
import { useTasks } from "@/hooks/useTasks";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useGoals } from "@/hooks/useGoals";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import type { Codex, Rarity } from "@/services/codexService";
import { ATTR_UI, CONFIDENCE_LABEL, RARITY, relicSrc, timeAgo } from "@/utils/codexDisplay";
import { LIFE_AREAS } from "@/utils/lifeOsLabels";
import type { CodexSelection } from "./CodexSidebar";

type Select = (s: CodexSelection) => void;
const fmtDay = (at: string) => new Date(at.includes("T") ? at : `${at.replace(" ", "T")}Z`).toLocaleDateString("pt-BR");

/** Visão geral: resumo do Códex (sem repetir o Dashboard) + todas as descobertas. */
export function CodexOverview({ codex, onSelect }: { codex: Codex; onSelect: Select }) {
  const { data: milestones } = useCodexMilestones();
  const top = [...codex.attributes].sort((a, b) => b.xp - a.xp).slice(0, 3);
  const lastRelic = [...codex.relics].filter((r) => r.unlocked).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))[0];
  const equipped = codex.titles.find((t) => t.equipped);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <RPGStatCard icon={<Crown size={18} />} tone="purple" label="Nível global" value={`Nv. ${codex.global.level}`} pct={codex.global.progressPct} caption={`${codex.global.totalXp} XP no total`} />
        <RPGStatCard icon={<Sparkles size={18} />} tone="gold" label="Sinergia" value={`${codex.synergy.synergy}%`} caption={`equilíbrio ${Math.round(codex.synergy.balance * 100)}%`} />
        <RPGStatCard icon={<ScrollText size={18} />} tone="blue" label="Progresso no Códex" value={`${codex.completion.pct}%`} pct={codex.completion.pct} caption={`${codex.completion.unlocked} de ${codex.completion.total} itens`} />
        <RPGStatCard icon={<Trophy size={18} />} tone="green" label="Título equipado" value={equipped?.name ?? "—"} caption={equipped ? RARITY[equipped.rarity].label : "Escolha na aba Classes"} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RPGPanel title="Atributos mais fortes">
          <ul className="space-y-2">
            {top.map((a) => (
              <li key={a.key}>
                <RPGProgressBar tone={ATTR_UI[a.key].tone} label={`${a.label} · Nv. ${a.level}`} value={a.xp - a.levelStartXp} max={a.nextLevelXp - a.levelStartXp} valueLabel={`${a.xp} XP`} />
              </li>
            ))}
          </ul>
        </RPGPanel>
        <RPGPanel title="Últimos registros do Códex">
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between gap-2"><span className="text-rpg-muted">Última relíquia</span><span className="text-rpg-text truncate">{lastRelic ? lastRelic.name : "—"}</span></li>
            <li className="flex justify-between gap-2"><span className="text-rpg-muted">Último marco</span><span className="text-rpg-text truncate">{milestones?.[0]?.title ?? "—"}</span></li>
            <li className="flex justify-between gap-2"><span className="text-rpg-muted">Classe sugerida</span><span className="text-rpg-text truncate">{codex.suggestedClass?.name ?? "Dados insuficientes"}</span></li>
          </ul>
        </RPGPanel>
      </div>
      <RPGPanel title="Descobertas">
        <p className="-mt-1 mb-2 text-xs text-rpg-muted">Padrões encontrados nos seus próprios registros, sempre com evidência. Sem amostra mínima, nada é exibido.</p>
        {codex.discoveries.length === 0 && <p className="text-sm text-rpg-muted">Nenhuma descoberta ainda.</p>}
        <ul className="grid gap-2 md:grid-cols-2">
          {codex.discoveries.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onSelect({ kind: "discovery", item: d })} className="w-full border border-rpg-border/70 bg-rpg-bg-2/60 p-3 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                <p className="font-semibold text-rpg-text">{d.title}</p>
                <p className="mt-0.5 text-xs text-rpg-muted line-clamp-2">{d.description}</p>
                <p className="mt-1 text-[10px] text-rpg-muted">{d.category} · {CONFIDENCE_LABEL[d.confidence]} · {timeAgo(d.discoveredAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      </RPGPanel>
    </div>
  );
}

/** Classes da rotina (cosméticas, sugeridas pelos atributos) + catálogo de títulos. */
export function CodexClasses({ codex, onSelect }: { codex: Codex; onSelect: Select }) {
  const { prefs, update } = useRpgPreferences();
  const max = Math.max(1, ...codex.classes.map((c) => c.score));
  const label = (k: string) => codex.attributes.find((a) => a.key === k)?.label ?? k;
  return (
    <div className="space-y-3">
      <RPGPanel variant="gold" title="Classe sugerida">
        {codex.suggestedClass ? (
          <>
            <p className="text-sm text-rpg-text">Seu padrão atual se aproxima de <span className="font-rpg text-lg font-bold text-rpg-gold-light">{codex.suggestedClass.name}</span>.</p>
            <p className="mt-1 text-xs text-rpg-muted">
              Base: seus dois atributos com mais XP são {codex.suggestedClass.basedOn.map(label).join(" e ")}. É só um arquétipo de rotina, cosmético — não é teste de personalidade e não dá bônus.
            </p>
          </>
        ) : (
          <p className="text-sm text-rpg-muted">Dados insuficientes: conclua missões e hábitos para revelar sua classe.</p>
        )}
      </RPGPanel>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {codex.classes.map((c) => {
          const active = prefs.classId === c.id;
          return (
            <div key={c.id} className={clsx("rpg-panel p-3", active && "rpg-panel-gold")}>
              <p className="font-rpg font-bold text-rpg-text">{c.name}</p>
              <p className="text-xs text-rpg-muted">{c.description}</p>
              <RPGProgressBar className="mt-2" tone="purple" label={`${label(c.attributes[0])} + ${label(c.attributes[1])}`} value={c.score} max={max} valueLabel={`${c.score} XP méd.`} />
              <RPGButton variant={active ? "ghost" : "secondary"} className="mt-2" disabled={active} onClick={() => update({ classId: c.id })}>{active ? "Classe escolhida" : "Escolher"}</RPGButton>
            </div>
          );
        })}
      </div>
      <RPGPanel title="Títulos">
        <ul className="grid gap-2 sm:grid-cols-2">
          {codex.titles.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onSelect({ kind: "title", item: t })} className={clsx("flex w-full items-center gap-2 border px-2 py-2 text-left", t.unlocked ? RPG_TONE_SOFT[RARITY[t.rarity].tone] : "border-rpg-border bg-rpg-bg-2/60 text-rpg-muted")} style={{ borderRadius: 3 }}>
                {t.unlocked ? <Crown size={16} aria-hidden /> : <Lock size={14} aria-label="Bloqueado" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.name}{t.equipped && " (equipado)"}</span>
                  <span className="block truncate text-[11px] opacity-80">{t.description}</span>
                </span>
                <span className="font-pixel text-[9px] uppercase">{RARITY[t.rarity].label}</span>
              </button>
            </li>
          ))}
        </ul>
      </RPGPanel>
    </div>
  );
}

/** Conquistas: visão compacta do motor existente (a tela completa continua em Conquistas). */
export function CodexAchievements() {
  const { achievements, isLoading } = useAchievements(false);
  const unlocked = achievements.filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""));
  return (
    <RPGPanel title="Conquistas" icon={<Trophy size={16} />} actions={<Link to="/conquistas" className="text-xs text-rpg-gold-light hover:underline">Hall de troféus →</Link>}>
      {isLoading && <div className="h-24 rpg-bar animate-pulse" />}
      <p className="text-sm text-rpg-text">{unlocked.length} de {achievements.length} desbloqueadas</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {unlocked.slice(0, 8).map((a) => (
          <li key={a.id} className="flex items-center gap-2 border border-rpg-border/60 bg-rpg-bg-2/60 p-2 text-sm" style={{ borderRadius: 3 }}>
            <span aria-hidden>{a.icon ?? "🏆"}</span>
            <span className="min-w-0 flex-1 truncate text-rpg-text">{a.title}</span>
            <RPGBadge tone="gold">{TIER_LABEL[a.tier]}</RPGBadge>
          </li>
        ))}
        {unlocked.length === 0 && !isLoading && <li className="text-sm text-rpg-muted">Nenhuma conquista ainda.</li>}
      </ul>
    </RPGPanel>
  );
}

/** Marcos da jornada em ordem cronológica (campanhas, metas, projetos, níveis, conquistas de ouro/platina). */
export function CodexMilestones() {
  const { data, isLoading, isError } = useCodexMilestones();
  return (
    <RPGPanel title="Marcos da jornada" icon={<Flag size={16} />}>
      {isLoading && <div className="h-24 rpg-bar animate-pulse" />}
      {isError && <p className="text-sm text-rpg-red">Não foi possível carregar os marcos.</p>}
      {data && data.length === 0 && <p className="text-sm text-rpg-muted">Nenhum marco ainda.</p>}
      <ol className="relative ml-2 border-l-2 border-rpg-border/70 space-y-2">
        {(data ?? []).slice(0, 60).map((m, i) => (
          <li key={i} className="relative pl-4">
            <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-rpg-gold bg-rpg-bg" aria-hidden />
            <p className="font-pixel text-[11px] text-rpg-gold-light">{fmtDay(m.at)}</p>
            {m.link ? <Link to={m.link} className="text-sm text-rpg-text hover:underline">{m.title}</Link> : <p className="text-sm text-rpg-text">{m.title}</p>}
            {m.detail && <p className="text-[11px] text-rpg-muted">{m.detail}</p>}
          </li>
        ))}
      </ol>
    </RPGPanel>
  );
}

/** Contratos (hábitos): sequências e consistência, sem repetir o CRUD de Hábitos. */
export function CodexContracts() {
  const { habits, summaryByHabitId } = useHabits();
  const rows = habits.map((h) => ({ h, s: summaryByHabitId.get(h.id) })).sort((a, b) => (b.s?.bestStreak ?? 0) - (a.s?.bestStreak ?? 0));
  return (
    <RPGPanel title="Contratos da rotina" actions={<Link to="/habitos" className="text-xs text-rpg-gold-light hover:underline">Hábitos →</Link>}>
      {rows.length === 0 && <p className="text-sm text-rpg-muted">Nenhum hábito cadastrado.</p>}
      <ul className="space-y-2">
        {rows.map(({ h, s }) => (
          <li key={h.id} className="border border-rpg-border/60 bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-rpg-text">{h.icon ?? "🔁"} {h.name}</span>
              <span className="shrink-0 font-pixel text-xs text-rpg-orange">🔥 {s?.currentStreak ?? 0} · recorde {s?.bestStreak ?? 0}</span>
            </div>
            <RPGProgressBar className="mt-1" tone="green" label="Consistência em 30 dias" value={s?.completionPct30d ?? 0} />
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}

/** Missões (tarefas): totais, recordes e campanhas — sem repetir o Kanban. */
export function CodexMissions() {
  const { tasks } = useTasks();
  const { campaigns } = useCampaigns();
  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.status === "Concluído" && t.completed_at);
    const byDay = new Map<string, number>();
    for (const t of done) byDay.set(t.completed_at!.slice(0, 10), (byDay.get(t.completed_at!.slice(0, 10)) ?? 0) + 1);
    const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return { total: done.length, last30: done.filter((t) => t.completed_at!.slice(0, 10) >= since).length, best, inCampaigns: campaigns.reduce((s, c) => s + c.counts.missionsDone, 0) };
  }, [tasks, campaigns]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <RPGStatCard icon={<Trophy size={18} />} tone="purple" label="Missões concluídas" value={String(stats.total)} />
        <RPGStatCard icon={<Sparkles size={18} />} tone="blue" label="Últimos 30 dias" value={String(stats.last30)} />
        <RPGStatCard icon={<Crown size={18} />} tone="gold" label="Recorde num dia" value={stats.best ? String(stats.best[1]) : "—"} caption={stats.best ? fmtDay(stats.best[0]) : undefined} />
        <RPGStatCard icon={<Flag size={18} />} tone="green" label="Em campanhas" value={String(stats.inCampaigns)} caption="missões concluídas" to="/forja-campanhas" />
      </div>
      <Link to="/tarefas" className="text-xs text-rpg-gold-light hover:underline">Abrir o quadro de missões →</Link>
    </div>
  );
}

const FILTERS: Array<{ id: "all" | Rarity | "locked"; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "common", label: "Comuns" },
  { id: "rare", label: "Raras" },
  { id: "epic", label: "Épicas" },
  { id: "legendary", label: "Lendárias" },
  { id: "locked", label: "Bloqueadas" },
];

/** Inventário de relíquias com filtros por raridade (cosméticas). */
export function CodexRelics({ codex, onSelect }: { codex: Codex; onSelect: Select }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const list = codex.relics.filter((r) => (f === "all" ? true : f === "locked" ? !r.unlocked : r.rarity === f || (f === "common" && r.rarity === "uncommon")));
  return (
    <RPGPanel title="Relíquias">
      <div className="mb-3 flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar relíquias">
        {FILTERS.map((x) => (
          <button key={x.id} role="tab" aria-selected={f === x.id} onClick={() => setF(x.id)} className={`shrink-0 border px-2.5 py-1 text-xs ${f === x.id ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border text-rpg-muted"}`} style={{ borderRadius: 3 }}>{x.label}</button>
        ))}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {list.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onSelect({ kind: "relic", item: r })} className="w-full border-2 border-rpg-border bg-rpg-bg-2/60 p-2 text-center hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
              <img src={relicSrc(r.id)} alt="" loading="lazy" className={`pixelated mx-auto w-16 h-16 ${r.unlocked ? "" : "grayscale opacity-40"}`} />
              <p className="mt-1 truncate text-xs text-rpg-text">{r.name}</p>
              <p className={`text-[10px] ${RPG_TONE_TEXT[RARITY[r.rarity].tone]}`}>{r.unlocked ? RARITY[r.rarity].label : `${Math.round(r.progress * 100)}% · bloqueada`}</p>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="col-span-full text-sm text-rpg-muted">Nenhuma relíquia neste filtro.</li>}
      </ul>
    </RPGPanel>
  );
}

/** Áreas da vida (LIFE_AREAS): atributo ligado, metas ativas e campanhas da área. */
export function CodexLifeAreas({ codex }: { codex: Codex }) {
  const { goals } = useGoals();
  const { campaigns } = useCampaigns();
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {LIFE_AREAS.map((a) => {
        const attrKey = codex.areaAttribute[a.key];
        const attr = codex.attributes.find((x) => x.key === attrKey);
        const areaGoals = goals.filter((g) => (g as unknown as { life_area?: string | null }).life_area === a.key && g.status === "active").length;
        const areaCamps = campaigns.filter((c) => c.lifeArea === a.key && c.status !== "archived");
        return (
          <div key={a.key} className="rpg-panel p-3">
            <p className="font-rpg font-bold text-rpg-text">{a.emoji} {a.label}</p>
            {attr && <p className={`text-xs ${RPG_TONE_TEXT[ATTR_UI[attr.key].tone]}`}>{attr.label} Nv. {attr.level}</p>}
            <ul className="mt-2 space-y-0.5 text-[11px] text-rpg-muted">
              <li>{areaGoals} meta(s) ativa(s)</li>
              <li>{areaCamps.length} campanha(s)</li>
              <li>{areaCamps.reduce((s, c) => s + c.counts.missions, 0)} missões em campanhas</li>
            </ul>
          </div>
        );
      })}
    </div>
  );
}
