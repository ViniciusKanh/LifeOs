import type { ReactNode } from "react";
import clsx from "clsx";
import { CalendarClock, Coins, Crown, Flame, Gem, Landmark, Lock, PiggyBank, Receipt, ScrollText, ShieldCheck, Target, TrendingUp, Trophy, Zap } from "lucide-react";
import type { BankDeposit, BankPlan } from "@/services/bankService";
import type { BankHub, VaultRarity } from "@/services/moduleHubService";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { IndicatorCard, KitSection, MedalStrip, MissionList, MODULE_ART, RankPanel } from "@/components/rpg-modules/ModuleKit";

/**
 * Economia da Guilda — peças RPG do Banco. Tudo lê o /api/hub/bank, que
 * DERIVA os números dos registros reais (nenhuma moeda é criada aqui).
 * As moedas são virtuais do LifeOS: não são dinheiro real.
 */

const ART = `${MODULE_ART}/bank`;
const R = { borderRadius: 4 } as const;
export const coins = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const dateBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export const RARITY_UI: Record<VaultRarity, { label: string; cls: string; art: string }> = {
  comum: { label: "Comum", cls: "border-rpg-border text-rpg-muted", art: `${ART}/vault-comum.webp` },
  raro: { label: "Raro", cls: "border-rpg-blue/70 bg-rpg-blue/10 text-rpg-blue", art: `${ART}/vault-raro.webp` },
  epico: { label: "Épico", cls: "border-rpg-purple/70 bg-rpg-purple/15 text-rpg-purple", art: `${ART}/vault-epico.webp` },
  lendario: { label: "Lendário", cls: "border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light", art: `${ART}/vault-epico.webp` },
};

export function BankRankPanel({ hub }: { hub: BankHub }) {
  return (
    <RankPanel
      title="Guardião do Tesouro"
      subtitle="Rank da economia da guilda"
      rank={hub.rank}
      valueLabel={hub.rank.xp}
      unit="XP"
      icon={<ShieldCheck size={26} />}
      rules={
        <>
          XP financeiro = 1 por moeda de rendimento líquido recebida + 25 por cofre resgatado + 50 por empréstimo quitado em dia. É derivado do seu histórico real do Banco — nada é
          concedido à parte e o XP de personagem não é duplicado.
        </>
      }
    />
  );
}

export function BankIndicators({ hub }: { hub: BankHub }) {
  const i = hub.indicators;
  const nextRank = hub.rank.next;
  return (
    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
      <IndicatorCard tone="gold" icon={<img src={`${ART}/coins.webp`} alt="" className="pixelated h-10 w-10 object-contain" />} label="Saldo disponível" value={coins(i.balance)} hint={`${coins(i.activeInvested)} investidas`} />
      <IndicatorCard tone="blue" icon={<ShieldCheck size={26} />} label="Score de crédito" value={i.creditScore} hint={hub.summary.credit.tier.label} />
      <IndicatorCard tone="green" icon={<TrendingUp size={26} />} label="Rendimento diário" value={`+${i.dailyYieldEstimate.toLocaleString("pt-BR")}`} hint="estimado pelos planos ativos" title="Bônus líquido contratado de cada cofre ativo ÷ prazo do plano." />
      <IndicatorCard tone="orange" icon={<Flame size={26} />} label="Streak de investimento" value={`${i.investStreakDays} dia${i.investStreakDays === 1 ? "" : "s"}`} hint="dias seguidos com aporte" />
      <IndicatorCard tone="purple" icon={<Crown size={26} />} label="Próximo rank" value={nextRank ? nextRank.title : "Máximo"} hint={nextRank ? `${hub.rank.xp}/${nextRank.min} XP` : "você chegou ao topo"} />
      <IndicatorCard tone="gold" icon={<PiggyBank size={26} />} label="Investimentos ativos" value={i.activeInvestments} hint={`${hub.summary.claimable.length} pronto(s) para resgate`} />
      <IndicatorCard tone="red" icon={<Receipt size={26} />} label="Impostos pagos" value={coins(i.taxesPaid)} hint="sobre rendimentos resgatados" />
      <IndicatorCard tone="blue" icon={<ScrollText size={26} />} label="Transações" value={coins(i.transactions)} hint="no extrato de moedas" />
    </div>
  );
}

/** Ganho acumulado: Cofre Livre é proporcional ao tempo; prazo fixo só existe no vencimento. */
function accumulated(d: BankDeposit, plan: BankPlan | undefined, now: number) {
  const full = Math.max(0, d.netPayout - d.amount);
  const start = Date.parse(d.createdAt.includes("T") ? d.createdAt : `${d.createdAt.replace(" ", "T")}Z`);
  const end = Date.parse(d.maturesAt);
  const matured = now >= end;
  if (matured) return { value: full, note: "garantido" };
  if (plan && !plan.earlyWithdrawalPenalty) {
    const frac = Math.max(0, Math.min(1, (now - start) / Math.max(1, end - start)));
    return { value: Math.floor(full * frac), note: "proporcional" };
  }
  return { value: 0, note: "liberado no vencimento" };
}

export function VaultCard({
  deposit: d,
  plan,
  rarity,
  onClaim,
  busy,
}: {
  deposit: BankDeposit;
  plan: BankPlan | undefined;
  rarity: VaultRarity;
  onClaim?: (d: BankDeposit) => void;
  busy?: boolean;
}) {
  const r = RARITY_UI[rarity];
  const now = Date.now();
  const end = Date.parse(d.maturesAt);
  const ready = now >= end;
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86_400_000));
  const acc = accumulated(d, plan, now);
  return (
    <article className={clsx("flex h-full flex-col border-2 bg-rpg-panel p-3", ready ? "border-rpg-green/70" : rarity === "lendario" ? "border-rpg-gold/70" : rarity === "epico" ? "border-rpg-purple/60" : "border-rpg-border")} style={R}>
      <div className="flex gap-2.5">
        <img src={r.art} alt="" aria-hidden className={clsx("pixelated h-14 w-14 shrink-0 object-contain", rarity === "lendario" && "drop-shadow-[0_0_10px_rgb(var(--rpg-gold)/0.7)]")} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-rpg font-bold text-rpg-gold-light">{d.label ?? d.planLabel}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className={clsx("border px-1 font-pixel text-[9px] uppercase", r.cls)} style={{ borderRadius: 2 }} title="Raridade de jogo do plano (prazo e risco)">
              {r.label}
            </span>
            <span className={clsx("font-pixel text-[9px] uppercase", ready ? "text-rpg-green" : "text-rpg-muted")}>{ready ? "Pronto para resgate" : "Rendendo"}</span>
          </div>
          {d.goalTitle && (
            <p className="mt-0.5 truncate text-[11px] text-rpg-green">
              <Target size={10} className="mr-0.5 inline" aria-hidden /> {d.goalTitle}
            </p>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11.5px]">
        <dt className="text-rpg-muted">Investido</dt>
        <dd className="text-right font-pixel text-rpg-text tabular-nums">{coins(d.amount)}</dd>
        <dt className="text-rpg-muted">Rendimento</dt>
        <dd className="text-right font-pixel text-rpg-green tabular-nums">
          {pct(d.rateBps)} · +{coins(d.netPayout - d.amount)}
        </dd>
        <dt className="text-rpg-muted">Prazo</dt>
        <dd className="text-right text-rpg-text">{d.termDays} dias</dd>
        <dt className="text-rpg-muted">Acumulado</dt>
        <dd className="text-right font-pixel text-rpg-text tabular-nums" title={acc.note}>
          +{coins(acc.value)} <span className="text-[9px] text-rpg-muted">({acc.note})</span>
        </dd>
        <dt className="text-rpg-muted">Resgate</dt>
        <dd className="text-right text-rpg-text">
          <CalendarClock size={10} className="mr-0.5 inline" aria-hidden />
          {ready ? "liberado" : `${dateBr(d.maturesAt)} (${daysLeft}d)`}
        </dd>
      </dl>
      {onClaim && ready && (
        <button type="button" className="rpg-btn rpg-btn-success mt-auto inline-flex w-full items-center justify-center gap-1 pt-2 text-sm" disabled={busy} onClick={() => onClaim(d)}>
          <Coins size={14} aria-hidden /> Resgatar {coins(d.netPayout)}
        </button>
      )}
    </article>
  );
}

export function VaultGrid({ hub, onClaim, busy, limit }: { hub: BankHub; onClaim?: (d: BankDeposit) => void; busy?: boolean; limit?: number }) {
  const planById = new Map(hub.summary.plans.map((p) => [p.id, p]));
  // Prontos primeiro, depois os que vencem antes.
  const list = [...hub.summary.claimable, ...hub.summary.active.filter((a) => !hub.summary.claimable.some((c) => c.id === a.id))]
    .sort((a, b) => Number(Date.parse(b.maturesAt) <= Date.now()) - Number(Date.parse(a.maturesAt) <= Date.now()) || a.maturesAt.localeCompare(b.maturesAt))
    .slice(0, limit);
  if (list.length === 0)
    return (
      <div className="flex items-center gap-3 border border-dashed border-rpg-border p-3 text-sm text-rpg-muted" style={R}>
        <Lock size={18} aria-hidden /> Nenhum cofre ativo. Faça um investimento na aba Investir para abrir o primeiro.
      </div>
    );
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((d) => (
        <li key={d.id}>
          <VaultCard deposit={d} plan={planById.get(d.planId)} rarity={hub.rarity[d.planId] ?? "comum"} onClaim={onClaim} busy={busy} />
        </li>
      ))}
    </ul>
  );
}

/** Catálogo dos planos como cofres da guilda (taxas reais de config/bank.ts). */
export function PlanCatalog({ hub, onInvest }: { hub: BankHub; onInvest: (planId: string) => void }) {
  return (
    <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {hub.summary.plans.map((p) => {
        const rarity = hub.rarity[p.id] ?? "comum";
        const r = RARITY_UI[rarity];
        const active = hub.summary.active.filter((d) => d.planId === p.id).length;
        return (
          <li key={p.id} className="flex flex-col items-center border-2 border-rpg-border bg-rpg-bg-2/70 p-3 text-center" style={R}>
            <img src={r.art} alt="" aria-hidden className="pixelated h-14 w-14 object-contain" />
            <p className="mt-1 font-rpg font-bold text-rpg-text">{p.label}</p>
            <span className={clsx("mt-0.5 border px-1 font-pixel text-[9px] uppercase", r.cls)} style={{ borderRadius: 2 }}>
              {r.label}
            </span>
            <p className="mt-1 font-pixel text-sm text-rpg-green">+{pct(p.rateBps)}</p>
            <p className="text-[11px] text-rpg-muted">
              {p.termDays} dias · imposto {pct(p.taxBps)}
              <br />
              {p.earlyWithdrawalPenalty ? "resgate antecipado perde o bônus" : "resgate livre (bônus proporcional)"}
            </p>
            <p className="mt-1 text-[11px] text-rpg-muted">
              {active}/{p.maxActive} ativos · {coins(p.minAmount)}–{coins(p.maxAmount)}
            </p>
            <button type="button" className="rpg-btn rpg-btn-secondary mt-2 w-full text-xs" onClick={() => onInvest(p.id)} disabled={active >= p.maxActive}>
              {active >= p.maxActive ? "Limite atingido" : "Investir neste cofre"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function FinancialJourney({ hub }: { hub: BankHub }) {
  return (
    <KitSection title="Jornada Financeira" icon={<Trophy size={16} />}>
      <MissionList missions={hub.missions} />
      <p className="mt-2 text-[10.5px] text-rpg-muted">Missões calculadas pelo seu histórico real. As que valem medalha aparecem em Recompensas.</p>
    </KitSection>
  );
}

const BANK_MEDALS = [
  { code: "bank_first_deposit", img: `${ART}/medal-1.webp`, fallbackTitle: "Primeiro Cofre" },
  { code: "bank_claimed_10", img: `${ART}/medal-2.webp`, fallbackTitle: "Mercador Paciente" },
  { code: "bank_score_800", img: `${ART}/medal-5.webp`, fallbackTitle: "Guardião do Tesouro" },
  { code: "bank_loans_3", img: `${ART}/medal-4.webp`, fallbackTitle: "Bom Pagador" },
  { code: "bank_deposits_3", img: `${ART}/medal-3.webp`, fallbackTitle: "Primeiro Investidor" },
];

export function RewardsView({ hub }: { hub: BankHub }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <KitSection title="Recompensas e medalhas financeiras" icon={<Gem size={16} />} tone="gold">
        <MedalStrip medals={BANK_MEDALS} />
        <p className="mt-2 text-[10.5px] text-rpg-muted">Medalhas do catálogo de Conquistas: desbloqueiam sozinhas quando a métrica real alcança a meta. Nenhuma moeda extra é criada.</p>
      </KitSection>
      <FinancialJourney hub={hub} />
    </div>
  );
}

export function GuildStats({ hub }: { hub: BankHub }) {
  const t = hub.summary.totals;
  const rows: Array<[string, ReactNode]> = [
    ["Investimentos ativos", t.activeCount],
    ["Total investido (ativo)", coins(hub.indicators.activeInvested)],
    ["Rendimento líquido já recebido", <span className="text-rpg-green">+{coins(t.earned)}</span>],
    ["Impostos pagos", coins(t.taxPaid)],
    ["Patrimônio estimado", coins(hub.indicators.balance + hub.indicators.activeInvested)],
  ];
  return (
    <KitSection title="Estatísticas da economia" icon={<Landmark size={16} />}>
      <dl className="divide-y divide-rpg-border/60 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2 py-1.5">
            <dt className="text-rpg-muted">{k}</dt>
            <dd className="font-pixel text-rpg-text tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[10px] text-rpg-muted">Patrimônio = saldo + principal dos cofres ativos (sem contar rendimento futuro).</p>
    </KitSection>
  );
}

/** Aba Automático: a Reserva (A) é a regra de investimento automático existente; B–E são automações reais. */
export function AutomaticView({ reserveCard }: { reserveCard: ReactNode }) {
  return (
    <div className="space-y-3">
      <KitSection title="A · Reserva automática" icon={<Zap size={16} />} tone="gold">
        <p className="mb-2 text-xs text-rpg-muted">Guarda uma porcentagem de cada moeda ganha em um cofre. Com a Divisão entre cofres (B) ligada, a reserva é repartida pelos percentuais abaixo.</p>
        {reserveCard}
      </KitSection>
      <AutomationsPanel
        module="bank"
        title="Automações da guilda"
        intro="Cada automação tem configuração, histórico e execução manual. Pagamento automático de empréstimo só acontece com o seu consentimento explícito."
      />
    </div>
  );
}
