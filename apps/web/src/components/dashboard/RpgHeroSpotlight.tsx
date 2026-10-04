import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Coins, Crown, Flame, ScrollText, Sparkles, Store, Swords, Trophy, Zap } from "lucide-react";
import { RPGBadge, RPGPanel, RPGPortrait, RPGProgressBar, rpgButtonClass } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useGamificationProfile, useXpHistory } from "@/hooks/useGamification";
import { useAchievements } from "@/hooks/useAchievements";
import { useContracts } from "@/hooks/useContracts";
import { useCampaigns } from "@/hooks/useCampaigns";
import { pickFeatured, forgeKpis } from "@/utils/campaignDisplay";
import { Hammer } from "lucide-react";
import { useEquippedTitle } from "@/hooks/useCodex";
import { XP_SOURCES } from "@/utils/gamification";
import { difficultyLabel } from "@/services/gamificationService";

/** Cores dos tokens RPG (sem hex solto). */
const tok = (name: string) => `rgb(var(--rpg-${name}))`;

function Chip({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center gap-2 border border-rpg-border/70 bg-rpg-bg-2/70 px-2.5 py-1.5 min-w-0" style={{ borderRadius: 3 }}>
      <span className={tone} aria-hidden>{icon}</span>
      <div className="min-w-0">
        <p className="font-pixel text-sm text-rpg-text leading-none">{value}</p>
        <p className="text-[10px] text-rpg-muted truncate">{label}</p>
      </div>
    </div>
  );
}

/**
 * Destaque do personagem: nível em evidência, XP até o próximo nível e o
 * "mapa de atributos" (as 7 dimensões reais do Life Score). Nada inventado:
 * sem dados, cada bloco mostra o estado vazio.
 */
export function RpgLevelSpotlight({ dimensions }: { dimensions: Array<{ key: string; label: string; value: number }> }) {
  const { user } = useAuth();
  const title = useEquippedTitle();
  const { data: p, isLoading, isError } = useGamificationProfile();
  const { achievements } = useAchievements(false);
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const level = p?.level ?? 1;
  const hasAttributes = dimensions.some((d) => d.value > 0);

  return (
    <RPGPanel variant="legendary" bodyClassName="p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,320px)] items-center">
        <div className="relative mx-auto">
          <RPGPortrait size="xl" />
          <span
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center border-2 border-rpg-gold bg-rpg-bg px-3 py-1 shadow-rpg"
            style={{ borderRadius: 3 }}
            aria-label={`Nível ${level}`}
          >
            <span className="font-pixel text-[9px] uppercase tracking-widest text-rpg-gold">Nível</span>
            <span className="font-pixel text-3xl leading-none text-rpg-gold-light">{level}</span>
          </span>
        </div>

        <div className="min-w-0 pt-4 lg:pt-0 text-center lg:text-left">
          <p className="font-pixel text-[11px] uppercase tracking-[0.18em] text-rpg-purple">{title}</p>
          <h2 className="rpg-title text-3xl sm:text-4xl font-bold leading-tight">{user?.name?.split(" ")[0] ?? "Aventureiro"}</h2>
          {isLoading && <div className="mt-3 h-4 rpg-bar animate-pulse" aria-label="Carregando progressão" />}
          {isError && <p className="mt-2 text-sm text-rpg-red">Não foi possível carregar a progressão.</p>}
          {p && (
            <>
              <RPGProgressBar
                className="mt-3"
                tone="purple"
                label={`Experiência do nível ${p.level}`}
                value={p.xpIntoLevel}
                max={p.xpForNextLevel}
                valueLabel={`${p.xpIntoLevel.toLocaleString("pt-BR")} / ${p.xpForNextLevel.toLocaleString("pt-BR")} XP`}
              />
              <p className="mt-1 text-xs text-rpg-muted">
                Faltam <span className="font-pixel text-rpg-gold-light">{(p.xpForNextLevel - p.xpIntoLevel).toLocaleString("pt-BR")} XP</span> para o nível {p.level + 1}
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Chip icon={<Zap size={15} />} label="XP hoje" value={`+${p.xpToday}`} tone="text-rpg-purple" />
                <Chip icon={<Flame size={15} />} label="Dias seguidos" value={String(p.streakDays)} tone="text-rpg-orange" />
                <Chip icon={<Coins size={15} />} label="Moedas" value={String(p.coins)} tone="text-rpg-gold" />
                <Chip icon={<Trophy size={15} />} label="Conquistas" value={`${unlocked}/${achievements.length}`} tone="text-rpg-green" />
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap justify-center lg:justify-start gap-2">
            <Link to="/contratos" className={rpgButtonClass("gold")}><ScrollText size={14} aria-hidden /> Contratos</Link>
            <Link to="/tesouro" className={rpgButtonClass("secondary")}><Coins size={14} aria-hidden /> Tesouro</Link>
            <Link to="/perfil" className={rpgButtonClass("ghost")}><Crown size={14} aria-hidden /> Ficha</Link>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-center font-rpg text-sm font-semibold text-rpg-text">Atributos do herói</p>
          {hasAttributes ? (
            <div className="h-56" role="img" aria-label={`Atributos (Life Score por dimensão): ${dimensions.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={dimensions} outerRadius="72%">
                  <PolarGrid stroke={tok("border")} />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: tok("text-muted") }} />
                  <Radar dataKey="value" name="Pontos" stroke={tok("gold")} fill={tok("purple")} fillOpacity={0.35} />
                  <Tooltip formatter={(v: number) => [`${v}/100`, "Pontos"]} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-10 text-center text-xs text-rpg-muted">Dados insuficientes — registre tarefas, hábitos e saúde para revelar seus atributos.</p>
          )}
        </div>
      </div>
    </RPGPanel>
  );
}

/** Origem do XP nos últimos 30 dias (rosca), só com XP real do ledger. */
export function RpgXpSources() {
  const { data, isLoading } = useXpHistory(30);
  const slices = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of data?.days ?? []) for (const [k, v] of Object.entries(d.bySource)) totals[k] = (totals[k] ?? 0) + v;
    return XP_SOURCES.map((s) => ({ ...s, value: totals[s.id] ?? 0 })).filter((s) => s.value > 0);
  }, [data]);
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <RPGPanel title="De onde vem seu XP" icon={<Sparkles size={16} />} className="h-full">
      {isLoading && <div className="h-48 rpg-bar animate-pulse" aria-label="Carregando origens de XP" />}
      {!isLoading && total === 0 && <p className="py-10 text-center text-sm text-rpg-muted">Sem XP nos últimos 30 dias.</p>}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-40 h-40 shrink-0" role="img" aria-label={`XP por origem: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="95%" stroke={tok("bg")} strokeWidth={2} isAnimationActive={false}>
                  {slices.map((s) => <Cell key={s.id} fill={tok(s.tone)} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <span className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="font-pixel text-lg text-rpg-gold-light">{total.toLocaleString("pt-BR")}</span>
              <span className="text-[10px] text-rpg-muted">XP · 30 dias</span>
            </span>
          </div>
          <ul className="w-full space-y-1 text-xs">
            {slices.sort((a, b) => b.value - a.value).map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 shrink-0" style={{ backgroundColor: tok(s.tone), borderRadius: 1 }} aria-hidden />
                <span className="flex-1 text-rpg-text">{s.label}</span>
                <span className="font-pixel text-rpg-muted">{Math.round((s.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </RPGPanel>
  );
}

/** Contratos em andamento mais avançados (progresso real das tarefas). */
export function RpgActiveContracts() {
  const { contracts, isLoading } = useContracts();
  const active = contracts.filter((c) => c.status === "ativo").sort((a, b) => b.progressPct - a.progressPct).slice(0, 3);
  return (
    <RPGPanel
      title="Contratos em andamento"
      icon={<Swords size={16} />}
      className="h-full"
      actions={<Link to="/contratos" className="text-xs text-rpg-gold-light hover:underline">Gestão de contratos</Link>}
    >
      {isLoading && <div className="h-32 rpg-bar animate-pulse" aria-label="Carregando contratos" />}
      {!isLoading && active.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm text-rpg-muted">Nenhum contrato ativo.</p>
          <Link to="/contratos" className={rpgButtonClass("gold", "mt-2")}>Firmar um contrato</Link>
        </div>
      )}
      <ul className="space-y-3">
        {active.map((c) => (
          <li key={c.id}>
            <div className="flex items-center justify-between gap-2">
              <Link to="/contratos" className="min-w-0 truncate text-sm font-semibold text-rpg-text hover:text-rpg-gold-light">{c.title}</Link>
              <RPGBadge tone="gold">{difficultyLabel(c.difficulty)}</RPGBadge>
            </div>
            <RPGProgressBar className="mt-1" tone="gold" label={`Progresso de ${c.title}`} value={c.doneTasks} max={Math.max(1, c.totalTasks)} valueLabel={`${c.doneTasks}/${c.totalTasks} · bônus +${c.reward.xp} XP`} />
          </li>
        ))}
      </ul>
    </RPGPanel>
  );
}

/** Campanha em foco (Forja): progresso médio, próximo marco e XP já ganho — dados reais. */
export function RpgCampaignFocus() {
  const { campaigns, isLoading } = useCampaigns();
  const featured = pickFeatured(campaigns);
  const k = forgeKpis(campaigns);
  const next = featured?.milestones.find((m) => m.state === "current") ?? null;
  return (
    <RPGPanel
      title="Campanha em foco"
      icon={<Hammer size={16} />}
      className="h-full"
      actions={<Link to="/forja-campanhas" className="text-xs text-rpg-gold-light hover:underline">Forja de Campanhas</Link>}
    >
      {isLoading && <div className="h-28 rpg-bar animate-pulse" aria-label="Carregando campanhas" />}
      {!isLoading && !featured && (
        <div className="py-6 text-center">
          <p className="text-sm text-rpg-muted">Nenhuma campanha forjada ainda.</p>
          <Link to="/forja-campanhas" className={rpgButtonClass("gold", "mt-2")}>⚒️ Forjar campanha</Link>
        </div>
      )}
      {featured && (
        <>
          <Link to={`/forja-campanhas/${featured.id}`} className="font-rpg font-bold text-rpg-text hover:text-rpg-gold-light">{featured.title}</Link>
          <RPGProgressBar className="mt-2" tone="purple" label={`Progresso de ${featured.title}`} value={featured.progress.pct} valueLabel={`${featured.progress.pct}%`} />
          <ul className="mt-2 space-y-1 text-xs text-rpg-muted">
            <li>Próximo marco: <span className="text-rpg-text">{next?.title ?? "—"}</span></li>
            <li>Missões abertas: <span className="text-rpg-text">{featured.counts.missions - featured.counts.missionsDone}</span> · XP ganho: <span className="font-pixel text-rpg-purple">{featured.earned.xp}</span></li>
            <li>{k.active} campanha(s) ativa(s){k.avgProgress != null && ` · progresso médio ${k.avgProgress}%`}</li>
          </ul>
        </>
      )}
    </RPGPanel>
  );
}
