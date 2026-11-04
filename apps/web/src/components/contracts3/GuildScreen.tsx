import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Coins,
  Crown,
  Flame,
  HelpCircle,
  ListChecks,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  Stamp,
  Wand2,
  Zap,
} from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar, RPGToast } from "@/components/rpg";
import { AdvisorPanel, KitSection } from "@/components/rpg-modules/ModuleKit";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { useUrlTab } from "@/components/hero/HeroShared";
import { useGuildActions, useGuildHub } from "@/hooks/useContractGuild";
import { difficultyLabel } from "@/services/gamificationService";
import { CATEGORIES, CATEGORY_LABEL, EVENT_LABEL, PHASE_LABEL, PHASE_TONE, RISK_LABEL, type GuildHub, type PactCard, type PactPhase, type RiskLevel } from "@/services/contractGuildService";
import { fmtDate, rpgField } from "@/components/contracts/contractUi";
import { ART, DifficultyGems, pactArt, RiskMeter, SealIcon } from "./pactUi";
import { PactForm } from "./PactForm";
import { PactDetailModal } from "./PactDetail";

const R = { borderRadius: 4 };
type Toast = (msg: string, tone?: "success" | "error") => void;
type Filter = "ativos" | "selar" | "pausados" | "rascunhos" | "cumpridos" | "arquivados";
const FILTER_PHASES: Record<Filter, PactPhase[]> = {
  ativos: ["ativo", "em_andamento"],
  selar: ["pronto_selar"],
  pausados: ["pausado"],
  rascunhos: ["rascunho"],
  cumpridos: ["cumprido"],
  arquivados: ["arquivado", "cancelado"],
};
const FILTER_LABEL: Record<Filter, string> = { ativos: "Ativos", selar: "Prontos para selar", pausados: "Pausados", rascunhos: "Rascunhos", cumpridos: "Cumpridos", arquivados: "Arquivados" };

/* ═══════════════════════════ Banner e indicadores ═══════════════════════════ */

function GuildBanner({ onAi, onNew, onCouncil }: { onAi: () => void; onNew: () => void; onCouncil: () => void }) {
  return (
    <header className="relative min-h-[180px] overflow-hidden border-2 border-rpg-gold/60 bg-rpg-bg-2" style={R}>
      <img src={`${ART}/banner-scene.webp`} alt="" aria-hidden className="pixelated absolute inset-y-0 right-0 h-full w-full object-cover object-center opacity-90 md:w-[62%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/85 to-rpg-bg/10 md:via-rpg-bg/70" aria-hidden />
      <div className="relative flex h-full flex-col justify-center gap-2 p-4 sm:p-5">
        <p className="font-pixel text-[10px] uppercase tracking-[0.25em] text-rpg-gold">Gestão de contratos</p>
        <h1 className="rpg-title text-3xl font-bold leading-none sm:text-4xl">Contratos</h1>
        <p className="max-w-md text-sm text-rpg-text/90">Firme pactos com objetivos, cumpra suas etapas e evolua na jornada.</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <RPGButton variant="gold" onClick={onAi}>
            <Wand2 size={14} aria-hidden /> Criar com IA
          </RPGButton>
          <RPGButton variant="secondary" onClick={onNew}>
            <Plus size={14} aria-hidden /> Novo contrato
          </RPGButton>
          <RPGButton variant="ghost" onClick={onCouncil}>
            <Bot size={14} aria-hidden /> Consultar a Guilda
          </RPGButton>
        </div>
      </div>
    </header>
  );
}

function Stat({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-2 border-rpg-border bg-rpg-panel px-2.5 py-2" style={R}>
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center border border-current/40 [&>svg]:h-[18px] [&>svg]:w-[18px]", tone)} style={{ borderRadius: 3 }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 font-pixel text-[9px] uppercase leading-tight text-rpg-muted">{label}</p>
        <p className={clsx("font-rpg text-lg font-bold leading-tight tabular-nums", tone)}>{value}</p>
        <p className="line-clamp-2 text-[10px] leading-tight text-rpg-muted">{hint}</p>
      </div>
    </div>
  );
}

function GuildIndicators({ hub }: { hub: GuildHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
      <Stat icon={<ScrollText />} label="Contratos ativos" value={i.active} hint={i.paused ? `${i.paused} pausado(s)` : "em andamento"} tone="text-rpg-gold-light" />
      <Stat icon={<CheckCircle2 />} label="Cumpridos" value={i.fulfilled} hint={i.readyToSeal ? `${i.readyToSeal} pronto(s) para selar` : "selados e prontos"} tone="text-rpg-green" />
      <Stat icon={<ListChecks />} label="Tarefas em aberto" value={i.openTasks} hint="nos pactos vivos" tone="text-rpg-blue" />
      <Stat icon={<Zap />} label="XP em contratos" value={`${i.xpEarned.toLocaleString("pt-BR")} XP`} hint="tarefas + bônus + selos" tone="text-rpg-purple" />
      <Stat icon={<Flame />} label="Consistência" value={`${i.streak} dia(s)`} hint={`recorde ${i.bestStreak} · Selo da Constância em 5 dias`} tone="text-rpg-orange" />
      <Stat icon={<Stamp />} label="Selos conquistados" value={i.seals} hint={`${i.sealKinds} de 5 tipos`} tone="text-rpg-pink" />
    </div>
  );
}

/* ═══════════════════════════ Card do pacto ═══════════════════════════ */

function PactCard3({ c, onOpen, onEdit, onReplan, notify }: { c: PactCard; onOpen: () => void; onEdit: () => void; onReplan: () => void; notify: Toast }) {
  const a = useGuildActions();
  const [menu, setMenu] = useState(false);
  const run = (p: Promise<unknown>, ok: string) => void p.then(() => notify(ok)).catch((err: unknown) => notify(err instanceof Error ? err.message : "Não foi possível concluir.", "error"));
  const live = c.phase === "ativo" || c.phase === "em_andamento";
  const urgent = live && c.daysLeft !== null && c.daysLeft >= 0 && c.daysLeft <= 2;
  return (
    <article className={clsx("relative border-2 bg-rpg-panel p-3", c.phase === "pronto_selar" ? "border-rpg-gold" : live ? "border-rpg-purple/60" : "border-rpg-border")} style={R} aria-label={c.title}>
      <div className="flex flex-col gap-3 md:flex-row">
        <button type="button" onClick={onOpen} className="hidden shrink-0 border-2 border-rpg-gold/50 md:block" style={R} aria-label={`Abrir ${c.title}`}>
          <img src={pactArt(c.category)} alt="" className="pixelated h-28 w-24 object-cover" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start gap-1.5">
            <button type="button" onClick={onOpen} className="min-w-0 text-left">
              <h3 className="font-rpg text-base font-bold leading-tight text-rpg-text hover:underline">{c.title}</h3>
              <p className="text-[11px] text-rpg-muted">
                {c.category ? CATEGORY_LABEL[c.category] ?? c.category : "Sem categoria"} · prioridade {c.priority}
                {c.goalTitle ? ` · Meta: ${c.goalTitle}` : ""}
              </p>
            </button>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <RPGBadge tone="orange">
                {difficultyLabel(c.difficulty)} <DifficultyGems difficulty={c.difficulty} />
              </RPGBadge>
              {urgent ? <RPGBadge tone="red" icon={<AlertTriangle size={9} aria-hidden />}>Vence em {c.daysLeft} dia(s)</RPGBadge> : <RPGBadge tone={PHASE_TONE[c.phase]}>{PHASE_LABEL[c.phase]}</RPGBadge>}
            </span>
          </div>
          <RPGProgressBar label="Progresso geral" value={c.doneTasks} max={Math.max(1, c.totalTasks)} valueLabel={`${c.progressPct}% (${c.doneTasks}/${c.totalTasks})`} tone="purple" />
          {c.stages.length > 0 && (
            <ol className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]" aria-label="Etapas">
              {c.stages.map((s) => (
                <li
                  key={s.id}
                  className={clsx(
                    "min-w-[64px] flex-1 border px-1.5 py-1 text-center text-[10px] leading-tight",
                    s.status === "concluida" ? "border-rpg-green/60 bg-rpg-green/10 text-rpg-green" : s.status === "ativa" ? "border-rpg-purple bg-rpg-purple/15 text-rpg-text" : "border-rpg-border text-rpg-muted",
                  )}
                  style={{ borderRadius: 3 }}
                  title={s.name}
                >
                  <span className="block truncate font-semibold">{s.status === "concluida" ? "✓ " : ""}{s.name}</span>
                  {s.total > 0 && s.status !== "concluida" && <span className="block">({s.done}/{s.total})</span>}
                </li>
              ))}
            </ol>
          )}
          {c.nextAction && <p className="truncate text-[12px] text-rpg-text/90" title={c.nextAction}><span className="text-rpg-gold">▸</span> {c.nextAction}</p>}
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 md:w-[260px] md:grid-cols-1">
          <div className="flex items-center gap-2 border border-rpg-border bg-rpg-bg-2/60 p-2" style={{ borderRadius: 3 }}>
            <img src={`${ART}/${c.difficulty === "epico" || c.difficulty === "dificil" ? "chest" : "chest-blue"}.webp`} alt="" aria-hidden className="pixelated h-9 w-auto" />
            <div className="text-[11px] leading-tight">
              <p className="font-pixel text-[9px] uppercase text-rpg-muted">Recompensa</p>
              <p className="text-rpg-purple">+{c.reward.xp} XP</p>
              <p className="text-rpg-gold-light">+{c.reward.coins} 🪙</p>
            </div>
          </div>
          <ul className="space-y-0.5 text-[11px] text-rpg-text/90">
            <li className="flex items-center gap-1">
              <CalendarClock size={11} className="text-rpg-muted" aria-hidden /> {c.dueDate ? `Prazo: ${fmtDate(c.dueDate)}` : "Sem prazo"}
            </li>
            <li className="flex items-center gap-1">
              <Flame size={11} className="text-rpg-orange" aria-hidden /> Sequência: {c.streak} dia(s)
            </li>
            <li className="flex items-center gap-1">
              <Stamp size={11} className="text-rpg-pink" aria-hidden /> Selo: {c.seals.length ? `${c.seals.length} conquistado(s)` : c.phase === "pronto_selar" ? "pronto para selar" : c.phase === "cumprido" ? "selado" : "em progresso"}
            </li>
            {c.risk && (
              <li className={clsx("flex items-center gap-1", c.risk.level === "alto" ? "text-rpg-red" : c.risk.level === "moderado" ? "text-rpg-orange" : "text-rpg-muted")}>
                <Shield size={11} aria-hidden /> Risco: {RISK_LABEL[c.risk.level]}
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-1.5">
        {c.phase === "pronto_selar" && (
          <RPGButton variant="gold" className="min-h-[34px] px-2 text-xs" onClick={onOpen}>
            <Stamp size={12} aria-hidden /> Selar
          </RPGButton>
        )}
        {c.phase === "rascunho" && (
          <RPGButton variant="gold" className="min-h-[34px] px-2 text-xs" onClick={() => run(a.activate.mutateAsync(c.id), "Rascunho ativado.")}>
            <Play size={12} aria-hidden /> Ativar
          </RPGButton>
        )}
        {c.phase === "pausado" && (
          <RPGButton variant="primary" className="min-h-[34px] px-2 text-xs" onClick={() => run(a.pause.mutateAsync({ id: c.id, pause: false }), "Pacto retomado.")}>
            <Play size={12} aria-hidden /> Retomar
          </RPGButton>
        )}
        {live && (
          <RPGButton variant="primary" className="min-h-[34px] px-2 text-xs" onClick={onOpen}>
            <Play size={12} aria-hidden /> Continuar
          </RPGButton>
        )}
        <RPGButton variant="secondary" className="min-h-[34px] px-2 text-xs" onClick={onOpen}>
          Ver detalhes
        </RPGButton>
        {(live || c.phase === "pausado") && (
          <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" onClick={onReplan}>
            <CalendarClock size={12} aria-hidden /> Replanejar
          </RPGButton>
        )}
        <div className="relative">
          <RPGButton variant="ghost" className="min-h-[34px] px-2 text-xs" aria-haspopup="menu" aria-expanded={menu} aria-label="Mais ações" onClick={() => setMenu((v) => !v)}>
            <MoreHorizontal size={14} />
          </RPGButton>
          {menu && (
            <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-44 border-2 border-rpg-border bg-rpg-bg-2 p-1 shadow-lg" style={{ borderRadius: 3 }} onMouseLeave={() => setMenu(false)}>
              {(live || c.phase === "rascunho" || c.phase === "pausado") && (
                <button role="menuitem" className="block w-full px-2 py-1.5 text-left text-xs text-rpg-text hover:bg-rpg-panel" onClick={() => (setMenu(false), onEdit())}>
                  Editar cláusulas
                </button>
              )}
              {live && (
                <button role="menuitem" className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs text-rpg-text hover:bg-rpg-panel" onClick={() => (setMenu(false), run(a.pause.mutateAsync({ id: c.id, pause: true }), "Pacto pausado."))}>
                  <Pause size={11} aria-hidden /> Pausar
                </button>
              )}
              {(live || c.phase === "pausado") && (
                <button role="menuitem" className="block w-full px-2 py-1.5 text-left text-xs text-rpg-text hover:bg-rpg-panel" onClick={() => (setMenu(false), run(a.feature.mutateAsync({ id: c.id, featured: !c.featured }), c.featured ? "Destaque removido." : "Pacto em destaque."))}>
                  {c.featured ? "Tirar do destaque" : "Colocar em destaque"}
                </button>
              )}
              <button role="menuitem" className="block w-full px-2 py-1.5 text-left text-xs text-rpg-text hover:bg-rpg-panel" onClick={() => (setMenu(false), onOpen())}>
                Histórico e arquivo
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ═══════════════════════════ Painéis laterais ═══════════════════════════ */

function FeaturedPact({ hub, onOpen, onNew }: { hub: GuildHub; onOpen: (id: string) => void; onNew: () => void }) {
  const f = hub.featured ? hub.contracts.find((c) => c.id === hub.featured!.id) : null;
  return (
    <section className="relative overflow-hidden border-2 border-rpg-gold/70 bg-rpg-bg-2 p-3" style={R} aria-label="Pacto em destaque">
      <img src={`${ART}/featured-knight.webp`} alt="" aria-hidden className="pixelated absolute bottom-0 right-0 h-full w-auto opacity-40" />
      <div className="relative">
        <p className="flex items-center gap-1.5 font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">
          <Crown size={12} aria-hidden /> Pacto em destaque
        </p>
        {f ? (
          <>
            <p className="mt-1 font-rpg text-lg font-bold leading-tight text-rpg-text">{f.title}</p>
            <p className="text-[11px] text-rpg-gold-light">{hub.featured!.auto ? "Destaque automático: o pacto vivo mais avançado" : "Destacado por você"}</p>
            {f.objective && <p className="mt-1 line-clamp-2 text-xs text-rpg-text/90">{f.objective}</p>}
            <RPGProgressBar className="mt-2" label="Progresso" value={f.doneTasks} max={Math.max(1, f.totalTasks)} valueLabel={`${f.progressPct}%`} tone="purple" />
            <p className="mt-1 text-[11px] text-rpg-text">
              Recompensa oficial: <span className="text-rpg-purple">+{f.reward.xp} XP</span> · <span className="text-rpg-gold-light">+{f.reward.coins} 🪙</span>
            </p>
            <RPGButton variant="gold" className="mt-2 w-full" onClick={() => onOpen(f.id)}>
              Abrir pacto →
            </RPGButton>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-rpg-text/90">Nenhum pacto em andamento. Firme o primeiro e ele aparecerá aqui.</p>
            <RPGButton variant="gold" className="mt-2 w-full" onClick={onNew}>
              <Plus size={14} aria-hidden /> Firmar um pacto
            </RPGButton>
          </>
        )}
      </div>
    </section>
  );
}

function RewardsPanel({ hub }: { hub: GuildHub }) {
  return (
    <KitSection title="Recompensas do contrato" icon={<Coins size={16} />}>
      <p className="mb-2 text-[11px] text-rpg-muted">Valores oficiais do LifeOS (seus ajustes de dificuldade). O bônus é pago uma vez ao cumprir todas as obrigações; cada selo novo paga +{hub.rewards.seal.xp} XP e +{hub.rewards.seal.coins} 🪙.</p>
      <div className="mb-2 flex justify-between gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <img key={i} src={`${ART}/reward-${i}.webp`} alt="" aria-hidden className="pixelated h-10 w-10 border border-rpg-border" style={{ borderRadius: 3 }} />
        ))}
      </div>
      <ul className="space-y-1 text-xs">
        {hub.rewards.byDifficulty.map((r) => (
          <li key={r.difficulty} className="flex items-center justify-between gap-2 border-b border-rpg-border/40 pb-1">
            <span className="text-rpg-text">{difficultyLabel(r.difficulty)}</span>
            <span className="font-pixel text-[10px]">
              <span className="text-rpg-purple">+{r.xp} XP</span> <span className="text-rpg-gold-light">+{r.coins} 🪙</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-rpg-muted">Contratos com menos de {hub.rewards.minTasks} obrigações não rendem bônus.</p>
    </KitSection>
  );
}

function RiskPanel({ hub, onOpen }: { hub: GuildHub; onOpen: (id: string) => void }) {
  const [help, setHelp] = useState(false);
  return (
    <KitSection
      title="Risco de quebra"
      icon={<AlertTriangle size={16} />}
      action={
        <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} aria-label="Como o risco é calculado" className="text-rpg-muted hover:text-rpg-gold-light">
          <HelpCircle size={15} />
        </button>
      }
    >
      {help && (
        <p className="mb-2 border border-rpg-border bg-rpg-bg/60 p-2 text-[11px] text-rpg-text/90" style={{ borderRadius: 3 }}>
          Regra fixa, sem probabilidade: <b>alto</b> = prazo vencido, 2+ obrigações atrasadas, ritmo necessário 2× maior que o atual na reta final ou 14+ dias parado; <b>moderado</b> = 1 atrasada, ritmo necessário acima do atual, 7+ dias parado ou reta final apertada; <b>sem dados</b> = sem prazo, sem obrigações ou menos de 3 dias de histórico.
        </p>
      )}
      {hub.risk ? (
        <>
          <RiskMeter level={hub.risk.level} reasons={hub.risk.reasons} />
          <button type="button" onClick={() => onOpen(hub.risk!.contractId)} className="mt-1 text-[11px] text-rpg-blue hover:underline">
            Pior caso: {hub.risk.title} →
          </button>
        </>
      ) : (
        <RiskMeter level={"sem_dados" as RiskLevel} reasons={["Nenhum pacto em andamento para medir."]} />
      )}
    </KitSection>
  );
}

function SealsPanel({ hub }: { hub: GuildHub }) {
  return (
    <KitSection title="Selos da Guilda" icon={<Stamp size={16} />}>
      <ul className="grid grid-cols-5 gap-1.5">
        {hub.sealCatalog.map((s) => (
          <li key={s.code} className="flex flex-col items-center text-center" title={`${s.name}: ${s.criterion}`}>
            <SealIcon code={s.code} size={40} locked={s.earned === 0} />
            <span className="mt-0.5 text-[9px] leading-tight text-rpg-muted">{s.name.replace("Selo da ", "").replace("Selo do ", "")}</span>
            {s.earned > 0 && <span className="font-pixel text-[9px] text-rpg-gold">×{s.earned}</span>}
          </li>
        ))}
      </ul>
      {hub.sealHistory.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[11px]">
          {hub.sealHistory.slice(0, 4).map((s) => (
            <li key={`${s.contractId}-${s.code}`} className="truncate text-rpg-text/90">
              {hub.sealCatalog.find((x) => x.code === s.code)?.name} — {s.contractTitle}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11px] text-rpg-muted">Selos são conquistados ao selar um contrato cumprido, conferindo critérios reais. Passe o mouse para ver cada critério.</p>
      )}
    </KitSection>
  );
}

function SuggestionPanel({ hub, onCreate }: { hub: GuildHub; onCreate: (title: string, goalId: string) => void }) {
  const s = hub.suggestions[0];
  return (
    <KitSection title="Contrato sugerido" icon={<Sparkles size={16} />}>
      {s ? (
        <>
          <p className="font-rpg font-semibold text-rpg-text">{s.title}</p>
          <p className="text-[11px] text-rpg-muted">Sugestão automática: esta Meta ativa ainda não tem um pacto{s.dueDate ? ` (prazo ${fmtDate(s.dueDate)})` : ""}.</p>
          <RPGButton variant="gold" className="mt-2 w-full" onClick={() => onCreate(s.title, s.goalId)}>
            <Sparkles size={14} aria-hidden /> Criar este contrato
          </RPGButton>
        </>
      ) : (
        <p className="text-[11px] text-rpg-muted">Todas as suas Metas ativas já têm um pacto — ou ainda não há Metas ativas. Use “Criar com IA” para o Escriba propor um novo.</p>
      )}
    </KitSection>
  );
}

function ReputationBar({ hub }: { hub: GuildHub }) {
  const r = hub.reputation;
  const [help, setHelp] = useState(false);
  return (
    <section className="grid items-center gap-3 border-2 border-rpg-gold/60 bg-rpg-bg-2 p-3 md:grid-cols-[auto_minmax(0,1fr)_auto]" style={R} aria-label="Reputação da Guilda">
      <div className="flex items-center gap-3">
        <img src={`${ART}/guild-banner.webp`} alt="" aria-hidden className="pixelated h-14 w-auto" />
        <div>
          <p className="font-pixel text-[10px] uppercase tracking-widest text-rpg-gold">Reputação da Guilda</p>
          <p className="rpg-title text-xl font-bold leading-tight">Guilda dos Pactos</p>
          <p className="text-[11px] text-rpg-muted">Nível {r.level} — {r.title}</p>
        </div>
      </div>
      <div className="min-w-0">
        <RPGProgressBar label={r.next ? `Próximo: ${r.next.title}` : "Rank máximo"} value={r.next ? r.points : 1} max={r.next ? r.next.min : 1} valueLabel={r.next ? `${r.points.toLocaleString("pt-BR")} / ${r.next.min.toLocaleString("pt-BR")}` : `${r.points.toLocaleString("pt-BR")} pts`} tone="purple" />
        <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help} className="mt-1 text-[11px] text-rpg-blue hover:underline">
          Como a reputação é calculada?
        </button>
        {help && <p className="text-[11px] text-rpg-muted">100 por contrato selado + 40 por selo + 10 por etapa concluída + 2 por obrigação cumprida. Seus números: {r.breakdown.sealed} selado(s), {r.breakdown.seals} selo(s), {r.breakdown.stagesDone} etapa(s), {r.breakdown.tasksDone} obrigação(ões). Não gera XP extra.</p>}
      </div>
      <div className="flex items-center gap-2 border border-rpg-border bg-rpg-bg/60 p-2" style={{ borderRadius: 3 }}>
        <img src={`${ART}/chest-guardian.webp`} alt="" aria-hidden className="pixelated h-10 w-auto" />
        <div className="text-[11px] leading-tight">
          <p className="text-rpg-muted">Próximo rank</p>
          <p className="font-semibold text-rpg-text">{r.next ? r.next.title : "Lendário alcançado"}</p>
          {r.next && <p className="text-rpg-gold-light">faltam {(r.next.min - r.points).toLocaleString("pt-BR")} pts</p>}
        </div>
      </div>
    </section>
  );
}

function RecentEvents({ hub }: { hub: GuildHub }) {
  if (!hub.recentEvents.length) return null;
  return (
    <KitSection title="Últimos registros da Guilda" icon={<ScrollText size={16} />}>
      <ul className="space-y-1 text-[12px]">
        {hub.recentEvents.slice(0, 8).map((e, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 text-rpg-muted">{new Date(e.at.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}</span>
            <span className="min-w-0 text-rpg-text/90">
              <b>{EVENT_LABEL[e.kind] ?? e.kind}</b> — {e.title}
              {e.detail ? ` (${e.detail})` : ""}
            </span>
          </li>
        ))}
      </ul>
    </KitSection>
  );
}

/* ═══════════════════════════ Tela ═══════════════════════════ */

const TABS = ["pactos", "guilda", "automacoes", "conselho"] as const;

/**
 * Contratos 3.0 — Guilda dos Pactos. Tudo que aparece aqui vem dos registros
 * reais (contratos, etapas, tarefas, selos e eventos). Nenhuma ação da IA ou
 * das automações cria, altera ou sela um pacto sem a confirmação do usuário.
 */
export function GuildScreen() {
  const { data: hub, isLoading, isError, refetch } = useGuildHub();
  const [tab, setTab] = useUrlTab(TABS, "pactos");
  const [filter, setFilter] = useState<Filter>("ativos");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [risk, setRisk] = useState("");
  const [form, setForm] = useState<null | { mode: "manual" | "ai"; editId?: string; prefill?: { title?: string; goalId?: string } }>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const notify = useCallback<Toast>((msg, tone = "success") => setToast({ msg, tone }), []);

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of Object.keys(FILTER_PHASES) as Filter[]) out[f] = (hub?.contracts ?? []).filter((c) => FILTER_PHASES[f].includes(c.phase)).length;
    return out;
  }, [hub]);
  const term = q.trim().toLowerCase();
  const list = (hub?.contracts ?? []).filter(
    (c) => FILTER_PHASES[filter].includes(c.phase) && (!term || `${c.title} ${c.objective ?? ""} ${c.description ?? ""}`.toLowerCase().includes(term)) && (!cat || c.category === cat) && (!risk || c.risk?.level === risk),
  );
  const editing = form?.editId ? hub?.contracts.find((c) => c.id === form.editId) ?? null : null;
  const [replanFor, setReplanFor] = useState<string | null>(null);

  return (
    <div className="space-y-3 px-3 py-4 sm:px-4 md:px-6 md:py-6">
      <GuildBanner onAi={() => setForm({ mode: "ai" })} onNew={() => setForm({ mode: "manual" })} onCouncil={() => setTab("conselho")} />

      {isLoading && (
        <div className="grid gap-3" aria-busy="true" aria-label="Carregando a Guilda">
          <div className="rpg-panel h-20 animate-pulse" />
          <div className="rpg-panel h-40 animate-pulse" />
        </div>
      )}
      {isError && (
        <div className="rpg-panel p-3" role="alert">
          <p className="text-sm text-rpg-text">Não foi possível abrir a Guilda.</p>
          <RPGButton variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Tentar de novo
          </RPGButton>
        </div>
      )}

      {hub && (
        <>
          <GuildIndicators hub={hub} />
          <div role="tablist" aria-label="Seções da Guilda" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {(
              [
                ["pactos", "Pactos", <ScrollText key="i" size={14} />],
                ["guilda", "Selos e reputação", <Stamp key="i" size={14} />],
                ["automacoes", "Automações", <Zap key="i" size={14} />],
                ["conselho", "Conselheiro da Guilda", <Bot key="i" size={14} />],
              ] as Array<[(typeof TABS)[number], string, JSX.Element]>
            ).map(([v, l, icon]) => (
              <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={clsx("flex min-h-[40px] shrink-0 items-center gap-1.5 border-2 px-3 text-sm font-semibold", tab === v ? "border-rpg-gold bg-rpg-gold/10 text-rpg-gold-light" : "border-rpg-border bg-rpg-panel text-rpg-muted hover:text-rpg-text")} style={R}>
                {icon} {l}
              </button>
            ))}
          </div>

          {tab === "pactos" && (
            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-col gap-2 border-2 border-rpg-border bg-rpg-panel p-2 lg:flex-row lg:items-center" style={R}>
                  <div role="tablist" aria-label="Situação" className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
                    {(Object.keys(FILTER_PHASES) as Filter[]).map((f) => (
                      <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={clsx("shrink-0 border px-2.5 py-1.5 text-xs font-semibold", filter === f ? "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light" : "border-transparent text-rpg-muted hover:text-rpg-text")} style={{ borderRadius: 3 }}>
                        {FILTER_LABEL[f]} ({counts[f]})
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-1 flex-wrap gap-1.5 lg:justify-end">
                    <label className="relative min-w-[160px] flex-1 lg:max-w-[220px]">
                      <span className="sr-only">Buscar contratos</span>
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar contratos…" className={`${rpgField} pl-8`} style={{ borderRadius: 3 }} />
                    </label>
                    <select value={cat} onChange={(e) => setCat(e.target.value)} className={`${rpgField} !w-auto`} style={{ borderRadius: 3 }} aria-label="Filtrar por categoria">
                      <option value="">Categoria</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <select value={risk} onChange={(e) => setRisk(e.target.value)} className={`${rpgField} !w-auto`} style={{ borderRadius: 3 }} aria-label="Filtrar por risco">
                      <option value="">Risco</option>
                      {(["alto", "moderado", "baixo", "sem_dados"] as RiskLevel[]).map((r) => (
                        <option key={r} value={r}>
                          {RISK_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {list.length === 0 ? (
                  <div className="rpg-panel-parchment border-2 border-rpg-gold/50 p-6 text-center" style={R}>
                    <ScrollText size={28} className="mx-auto text-rpg-gold" aria-hidden />
                    <p className="mt-2 font-rpg font-bold text-rpg-text">{term || cat || risk ? "Nenhum pacto com esses filtros." : `Nenhum contrato em “${FILTER_LABEL[filter]}”.`}</p>
                    {filter === "ativos" && !term && (
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <RPGButton variant="gold" onClick={() => setForm({ mode: "ai" })}>
                          <Wand2 size={14} aria-hidden /> Criar com IA
                        </RPGButton>
                        <RPGButton variant="secondary" onClick={() => setForm({ mode: "manual" })}>
                          Novo contrato
                        </RPGButton>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {list.map((c) => (
                      <PactCard3 key={c.id} c={c} onOpen={() => setOpenId(c.id)} onEdit={() => setForm({ mode: "manual", editId: c.id })} onReplan={() => (setOpenId(c.id), setReplanFor(c.id))} notify={notify} />
                    ))}
                  </div>
                )}
                <RecentEvents hub={hub} />
              </div>
              <aside className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1" aria-label="Painéis da Guilda">
                <FeaturedPact hub={hub} onOpen={setOpenId} onNew={() => setForm({ mode: "manual" })} />
                <RewardsPanel hub={hub} />
                <RiskPanel hub={hub} onOpen={setOpenId} />
                <SealsPanel hub={hub} />
                <SuggestionPanel hub={hub} onCreate={(title, goalId) => setForm({ mode: "manual", prefill: { title, goalId } })} />
              </aside>
            </div>
          )}
          {tab === "guilda" && (
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <SealsPanel hub={hub} />
              <RewardsPanel hub={hub} />
              <div className="lg:col-span-2">
                <RecentEvents hub={hub} />
              </div>
            </div>
          )}
          {tab === "automacoes" && <AutomationsPanel module="contracts" title="Automações da Guilda" intro="Lembretes e sugestões avisam; nada é criado, replanejado ou selado sem você." />}
          {tab === "conselho" && <AdvisorPanel module="contracts" title="Conselheiro da Guilda" avatar={`${ART}/featured-knight.webp`} />}
          <ReputationBar hub={hub} />
        </>
      )}

      {form && (
        <PactForm
          mode={form.mode}
          editing={editing}
          prefill={form.prefill ?? null}
          onClose={() => setForm(null)}
          onDone={(id, msg) => {
            setForm(null);
            notify(msg);
            if (!form.editId) setOpenId(id);
          }}
        />
      )}
      {openId && <PactDetailModal key={openId} id={openId} initialDialog={replanFor === openId ? "replan" : null} onClose={() => (setOpenId(null), setReplanFor(null))} onToast={notify} onEdit={() => (setForm({ mode: "manual", editId: openId }), setOpenId(null))} />}
      <RPGToast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />
    </div>
  );
}
