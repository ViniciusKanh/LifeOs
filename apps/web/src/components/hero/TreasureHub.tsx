import { useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, CalendarCheck, Coins, Gem, Gift, Lock, Plus, Repeat, Sparkles, Target, Trash2, Unlock } from "lucide-react";
import { RPGBadge, RPGButton, RPGProgressBar } from "@/components/rpg";
import { IndicatorCard, KitSection } from "@/components/rpg-modules/ModuleKit";
import { useHeroActions } from "@/hooks/useHero";
import type { Reward } from "@/services/gamificationService";
import type { GoalKind, TreasureHub } from "@/services/heroService";
import { RARITY, limitText, requirementText } from "@/utils/treasureDisplay";
import { nf } from "./HeroShared";

const R = { borderRadius: 4 } as const;
const field = "min-h-[40px] px-3 py-2 text-sm bg-rpg-bg-2 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none";

export function TreasureIndicators({ hub }: { hub: TreasureHub }) {
  const i = hub.indicators;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <IndicatorCard icon={<Coins size={22} />} label="Saldo de moedas" value={nf(i.coins)} hint="carteira oficial" />
      <IndicatorCard icon={<Gem size={22} />} label="Gemas" value={nf(i.gems)} tone="pink" />
      <IndicatorCard icon={<Sparkles size={22} />} label="XP global" value={nf(i.totalXp)} tone="purple" />
      <IndicatorCard icon={<Unlock size={22} />} label="Disponíveis" value={i.available} hint="recompensas" tone="green" />
      <IndicatorCard icon={<Gift size={22} />} label="Resgates" value={i.redemptions} hint="desde o início" tone="blue" />
      <IndicatorCard icon={<Repeat size={22} />} label="Sequência" value={`${i.redeemStreakWeeks} sem.`} hint="semanas com resgate" tone="orange" />
    </div>
  );
}

const KIND_LABEL: Record<GoalKind, string> = { reward: "Recompensa", title: "Título", relic: "Relíquia", set: "Conjunto" };

/** Metas de recompensa: o progresso usa o saldo/coleção real — não existe "cofre" paralelo. */
export function RewardGoalsPanel({ hub, onToast }: { hub: TreasureHub; onToast: (m: string, tone?: "success" | "error") => void }) {
  const { addGoal, removeGoal } = useHeroActions();
  const [kind, setKind] = useState<GoalKind>("reward");
  const [target, setTarget] = useState("");
  const options = kind === "reward" ? hub.goalOptions.rewards.map((r) => ({ id: r.id, name: `${r.name} (${r.cost} ${r.currency === "gem" ? "gemas" : "moedas"})` })) : kind === "title" ? hub.goalOptions.titles : kind === "relic" ? hub.goalOptions.relics : hub.goalOptions.sets;
  const add = () => {
    if (!target) return;
    addGoal.mutate(
      { kind, targetId: target },
      { onSuccess: () => (setTarget(""), onToast("Meta criada.")), onError: (e) => onToast(e instanceof Error ? e.message : "Não foi possível criar a meta.", "error") },
    );
  };
  return (
    <KitSection title="Metas de recompensa" icon={<Target size={16} />} tone="gold">
      <div className="mb-3 grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
        <select aria-label="Tipo de meta" className={field} style={R} value={kind} onChange={(e) => (setKind(e.target.value as GoalKind), setTarget(""))}>
          {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <select aria-label="Alvo da meta" className={field} style={R} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{options.length ? "Escolha o alvo…" : "Nada disponível deste tipo"}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <RPGButton variant="gold" onClick={add} disabled={!target || addGoal.isPending}>
          <Plus size={14} aria-hidden /> Criar meta
        </RPGButton>
      </div>
      {hub.goals.length === 0 ? (
        <p className="text-sm text-rpg-muted">Escolha algo para guardar moedas ou completar. O progresso é calculado com o seu saldo e a sua coleção reais.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {hub.goals.map((g) => (
            <li key={g.id} className={clsx("border-2 bg-rpg-bg-2/60 p-2.5", g.reached ? "border-rpg-green/70" : "border-rpg-border")} style={R}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-rpg-text">{g.title}</p>
                  <p className="text-[11px] text-rpg-muted">{KIND_LABEL[g.kind]}</p>
                </div>
                {g.reached && <RPGBadge tone="green">Atingida</RPGBadge>}
                <button type="button" aria-label={`Remover meta ${g.title}`} className="flex h-9 w-9 items-center justify-center text-rpg-muted hover:text-rpg-red" onClick={() => removeGoal.mutate(g.id, { onSuccess: () => onToast("Meta removida."), onError: () => onToast("Não foi possível remover.", "error") })}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
              <RPGProgressBar className="mt-1.5" label={g.title} value={g.current} max={Math.max(1, g.target)} valueLabel={`${nf(g.current)} / ${nf(g.target)} ${g.unit}`} tone={g.reached ? "green" : "gold"} />
              <p className="mt-1 text-[11px] text-rpg-muted">
                {g.missingText}
                {g.eta ? ` · ~${g.eta} dia(s) no ritmo dos últimos 30 dias` : ""}
              </p>
              <Link to={g.link} className="mt-0.5 inline-flex min-h-[32px] items-center text-[11px] text-rpg-blue hover:underline">
                Abrir →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </KitSection>
  );
}

/**
 * Baú Especial: vitrine TRANSPARENTE das recompensas raras configuradas pelo
 * usuário. Sem sorteio, sem compra com dinheiro real — cada item mostra preço,
 * requisito e limite; o resgate usa o fluxo normal com confirmação.
 */
export function SpecialChest({ rewards, balance, gems, onRedeem }: { rewards: Reward[]; balance: number; gems: number; onRedeem: (r: Reward) => void }) {
  const rare = rewards.filter((r) => r.isActive && ["raro", "epico", "lendario"].includes(r.rarity)).sort((a, b) => b.cost - a.cost);
  return (
    <KitSection title="Baú Especial — coleção de recompensas raras" icon={<Gift size={16} />} tone="legendary">
      <p className="mb-2 text-[11px] text-rpg-muted">Sem sorteios e sem compras com dinheiro real: tudo aqui foi configurado por você, com preço e requisito visíveis.</p>
      {rare.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nenhuma recompensa Rara, Épica ou Lendária ainda. Crie uma (ou peça sugestões à IA) na Visão Geral.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rare.map((r) => {
            const have = r.currency === "gem" ? gems : balance;
            const ok = r.availability.available;
            return (
              <li key={r.id} className="flex flex-col gap-1.5 border-2 border-rpg-border bg-rpg-bg-2/60 p-2.5" style={R}>
                <div className="flex items-center gap-2">
                  {ok ? <Unlock size={15} className="text-rpg-green" aria-hidden /> : <Lock size={15} className="text-rpg-muted" aria-hidden />}
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-rpg-text">{r.name}</p>
                  <RPGBadge tone={RARITY[r.rarity].tone}>{RARITY[r.rarity].label}</RPGBadge>
                </div>
                <RPGProgressBar label="Saldo" value={Math.min(have, r.cost)} max={Math.max(1, r.cost)} valueLabel={`${nf(Math.min(have, r.cost))}/${nf(r.cost)} ${r.currency === "gem" ? "gemas" : "moedas"}`} tone={ok ? "green" : "gold"} />
                <p className="text-[11px] text-rpg-muted">
                  {requirementText(r)} · {limitText(r)}
                </p>
                <RPGButton variant={ok ? "gold" : "secondary"} disabled={!ok} onClick={() => onRedeem(r)}>
                  {ok ? "Resgatar (com confirmação)" : (r.availability.reason ?? "Indisponível")}
                </RPGButton>
              </li>
            );
          })}
        </ul>
      )}
    </KitSection>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  task: "Missões",
  habit_entry: "Hábitos",
  habit_streak: "Sequências",
  achievement: "Conquistas",
  reward: "Resgates",
  quest: "Quests",
  bank_deposit: "Banco",
  bank_loan: "Banco",
  bank: "Banco",
  campaign: "Campanhas",
  contract: "Contratos",
  codex_knowledge: "Códex",
  journal: "Diário",
  review: "Revisões",
  focus: "Foco",
  day: "Bônus do dia",
};

/** Histórico econômico: 8 semanas do ledger oficial (ganhos x gastos) e origens dos últimos 30 dias. */
export function EconomyHistory({ hub }: { hub: TreasureHub }) {
  const max = Math.max(1, ...hub.economy.map((e) => Math.max(e.earned, e.spent)));
  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <KitSection title="Ganhos e gastos por semana" icon={<BarChart3 size={16} />}>
        <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Moedas ganhas e gastas nas últimas 8 semanas">
          {hub.economy.map((e) => (
            <div key={e.week} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full items-end justify-center gap-0.5">
                <span className="w-1/2 bg-rpg-green/80" style={{ height: `${(e.earned / max) * 100}%` }} title={`+${e.earned} moedas`} />
                <span className="w-1/2 bg-rpg-red/70" style={{ height: `${(e.spent / max) * 100}%` }} title={`−${e.spent} moedas`} />
              </div>
              <span className="text-[9px] text-rpg-muted tabular-nums">{e.week.slice(8, 10)}/{e.week.slice(5, 7)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 flex gap-3 text-[11px] text-rpg-muted">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-rpg-green/80" aria-hidden /> ganhos</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-rpg-red/70" aria-hidden /> gastos</span>
          <span>· +{nf(hub.indicators.earned30)} / −{nf(hub.indicators.spent30)} em 30 dias</span>
        </p>
      </KitSection>
      <KitSection title="Origem das moedas (30 dias)" icon={<CalendarCheck size={16} />}>
        {hub.sources.length === 0 ? (
          <p className="text-sm text-rpg-muted">Sem movimentos nos últimos 30 dias.</p>
        ) : (
          <ul className="space-y-1.5">
            {hub.sources.map((s) => (
              <li key={s.source} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-rpg-text">{SOURCE_LABEL[s.source] ?? s.source}</span>
                <span className="shrink-0 font-pixel text-[11px] tabular-nums">
                  {s.earned > 0 && <span className="text-rpg-green">+{nf(s.earned)}</span>} {s.spent > 0 && <span className="text-rpg-red">−{nf(s.spent)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </KitSection>
    </div>
  );
}

const TIP_TONE = { dado: "blue", inferencia: "purple", sugestao: "green" } as const;
const TIP_LABEL = { dado: "Dado real", inferencia: "Inferência", sugestao: "Sugestão" } as const;

export function TreasureTips({ hub }: { hub: TreasureHub }) {
  return (
    <KitSection title="Recomendações do Tesouro" icon={<Sparkles size={16} />}>
      {hub.tips.length === 0 ? (
        <p className="text-sm text-rpg-muted">Nada a recomendar agora.</p>
      ) : (
        <ul className="space-y-1.5">
          {hub.tips.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-rpg-text">
              <RPGBadge tone={TIP_TONE[t.kind]} className="mt-0.5 shrink-0">
                {TIP_LABEL[t.kind]}
              </RPGBadge>
              {t.text}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-rpg-muted">Sugestões nunca resgatam nada sozinhas.</p>
    </KitSection>
  );
}
