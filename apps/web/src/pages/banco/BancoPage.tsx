import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useReducedMotion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Calculator,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  HandCoins,
  Landmark,
  LineChart as LineChartIcon,
  Percent,
  PiggyBank,
  Receipt,
  Repeat,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Vault,
  X,
} from "lucide-react";
import {
  RPGBadge,
  RPGButton,
  RPGPageHeader,
  RPGPanel,
  RPGProgressBar,
  RPGProgressRing,
  RPGStatCard,
  RPGSwitch,
  RPGTabs,
  RPGToast,
  RPG_TONE_SOFT,
  type RpgTone,
} from "@/components/rpg";
import { RPGHowItWorks } from "@/components/rpg/RPGHowItWorks";
import { Modal } from "@/components/ui/Modal";
import { achievementIcon } from "@/components/achievements/achievementIcons";
import { TIER_RPG_TONE } from "@/components/achievements/tierDisplay";
import { useBank, useBankHistory, useBankLedger, useBankStatement, useLedgerEntryDetail, type LedgerUiFilter } from "@/hooks/useBank";
import { useAuth } from "@/hooks/useAuth";
import { useGamificationProfile } from "@/hooks/useGamification";
import { useAchievements } from "@/hooks/useAchievements";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { useCountUp } from "@/hooks/useCountUp";
import { formatWhen } from "@/utils/treasureDisplay";
import { LEDGER_CATEGORIES, ledgerCategoryByKey, ledgerCategoryOf } from "@/utils/ledgerCategory";
import { playSfx } from "@/utils/sfx";
import { recentActionPoint, spawnBurst } from "@/utils/xpBurst";
import { goalsService } from "@/services/goalsService";
import type { AutoInvestRule, BankDeposit, BankLoan, BankPlan, BankStatementMonth, CreditInfo, LedgerEntry, LoanTier } from "@/services/bankService";
import type { Goal } from "@/types";

/**
 * Banco: tela única e dedicada para administrar as moedas ganhas em
 * missões/contratos -- igual a um banco de verdade, mas gamificado:
 * saldo em destaque com ações rápidas, investimentos de prazo fixo com
 * imposto sobre o ganho, EMPRÉSTIMOS com juros e multa por atraso (limite
 * e taxa dependem do seu SCORE DE CRÉDITO), cofrinhos com nome/meta,
 * extrato filtrável com comprovante por movimentação, e um simulador
 * antes de decidir. Nunca é dinheiro real. Saldo, investimentos, crédito
 * e extrato vêm sempre do backend; a UI só atualiza depois que o
 * servidor confirma.
 */

const HIDE_BALANCE_KEY = "lifeos-banco-saldo-oculto";

function formatCoins(n: number) {
  return n.toLocaleString("pt-BR");
}

function formatPct(bps: number) {
  return (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function daysOverdue(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function fullDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Mesmas fórmulas do backend (config/bank.ts): investimento arredonda pra baixo, dívida pra cima.
function projectGross(amount: number, rateBps: number) {
  return amount + Math.floor((amount * rateBps) / 10_000);
}
function projectGain(amount: number, rateBps: number) {
  return Math.floor((amount * rateBps) / 10_000);
}
function projectTax(amount: number, rateBps: number, taxBps: number) {
  return Math.floor((projectGain(amount, rateBps) * taxBps) / 10_000);
}
function projectNet(amount: number, rateBps: number, taxBps: number) {
  return projectGross(amount, rateBps) - projectTax(amount, rateBps, taxBps);
}
function projectLoanTotal(amount: number, rateBps: number) {
  return amount + Math.ceil((amount * rateBps) / 10_000);
}
function projectLateFee(totalDue: number, lateFeeBps: number) {
  return Math.ceil((totalDue * lateFeeBps) / 10_000);
}

function tierTone(label: string): RpgTone {
  if (label === "Lenda da Guilda") return "gold";
  if (label === "Cavaleiro de Confiança") return "purple";
  if (label === "Escudeiro do Crédito") return "blue";
  return "muted";
}

/** Variação percentual real entre dois meses do extrato de rendimentos -- nunca inventa comparação sem os dois valores. */
function monthOverMonth(cur: number, prev: number): string | null {
  if (prev === 0) return cur > 0 ? "novo este mês" : null;
  const change = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (change === 0) return null;
  return `${change > 0 ? "+" : ""}${change}% este mês`;
}

/** Emojis sugeridos pra batizar um cofrinho -- atalho, mas o campo aceita qualquer emoji digitado. */
const QUICK_ICONS = ["✈️", "🏠", "🎮", "📚", "🎓", "🚗", "💻", "🎁"];

function QuickAmountChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-rpg-border px-2 py-1 text-[11px] font-pixel text-rpg-muted hover:border-rpg-gold hover:text-rpg-gold-light transition-colors"
      style={{ borderRadius: 2 }}
    >
      {label}
    </button>
  );
}

/** Metas ativas do usuário, só pra popular o seletor opcional "vincular a uma meta" do cofrinho -- consulta leve e dedicada. */
function useActiveGoalsForBank() {
  return useQuery({ queryKey: ["goals", "bank-picker"], queryFn: () => goalsService.list({ status: "active" }), staleTime: 60_000 });
}

function DepositForm({
  plan,
  disabled,
  balance,
  goals,
  onInvest,
}: {
  plan: BankPlan;
  disabled: boolean;
  balance: number;
  goals: Goal[];
  onInvest: (amount: number, opts: { label: string | null; icon: string | null; goalId: string | null }) => void;
}) {
  const [amount, setAmount] = useState(String(plan.minAmount));
  const [customize, setCustomize] = useState(false);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [goalId, setGoalId] = useState("");
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= plan.minAmount && parsed <= plan.maxAmount;
  const gain = valid ? projectGain(parsed, plan.rateBps) : 0;
  const tax = valid ? projectTax(parsed, plan.rateBps, plan.taxBps) : 0;
  const net = valid ? projectNet(parsed, plan.rateBps, plan.taxBps) : null;
  const maxInvestable = Math.min(plan.maxAmount, balance);
  const quickAmounts = [50, 100, 500].filter((v) => v >= plan.minAmount && v <= plan.maxAmount);

  return (
    <RPGPanel variant="gold" title={plan.label} icon={<Vault size={15} />} className="h-full">
      <p className="text-xs text-rpg-muted mb-3">{plan.flavor}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <RPGBadge tone="gold">+{formatPct(plan.rateBps)}% bruto</RPGBadge>
        <RPGBadge tone="blue">{plan.earlyWithdrawalPenalty === false ? "Saque quando quiser" : `${plan.termDays} dia${plan.termDays > 1 ? "s" : ""}`}</RPGBadge>
        <RPGBadge tone="red">IR {formatPct(plan.taxBps)}%</RPGBadge>
        <RPGBadge tone="muted">{formatCoins(plan.minAmount)}–{formatCoins(plan.maxAmount)} moedas</RPGBadge>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onInvest(parsed, { label: label.trim() || null, icon: icon.trim() || null, goalId: goalId || null });
        }}
      >
        <label className="sr-only" htmlFor={`amount-${plan.id}`}>Quantia para investir em {plan.label}</label>
        <input
          id={`amount-${plan.id}`}
          type="number"
          inputMode="numeric"
          min={plan.minAmount}
          max={plan.maxAmount}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border-2 border-rpg-border bg-rpg-bg px-2.5 py-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
          style={{ borderRadius: 2 }}
        />
        <RPGButton type="submit" variant="gold" disabled={disabled || !valid}>
          Investir
        </RPGButton>
      </form>
      {(quickAmounts.length > 0 || maxInvestable >= plan.minAmount) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {quickAmounts.map((v) => (
            <QuickAmountChip key={v} label={formatCoins(v)} onClick={() => setAmount(String(v))} />
          ))}
          {maxInvestable >= plan.minAmount && <QuickAmountChip label="Tudo" onClick={() => setAmount(String(maxInvestable))} />}
        </div>
      )}
      {valid && net != null ? (
        <dl className="mt-3 space-y-1 text-[11px] border-t border-rpg-border/60 pt-2">
          <div className="flex items-center justify-between">
            <dt className="text-rpg-muted">Bruto em {plan.termDays} dia{plan.termDays > 1 ? "s" : ""}</dt>
            <dd className="font-pixel text-rpg-text">{formatCoins(parsed + gain)} <span className="text-rpg-muted">(+{formatCoins(gain)})</span></dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-rpg-muted">Imposto de renda ({formatPct(plan.taxBps)}% do ganho)</dt>
            <dd className="font-pixel text-rpg-red">−{formatCoins(tax)}</dd>
          </div>
          <div className="flex items-center justify-between text-xs">
            <dt className="font-semibold text-rpg-gold-light">Você recebe (líquido)</dt>
            <dd className="font-pixel font-semibold text-rpg-gold-light">{formatCoins(net)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-[11px] text-rpg-muted min-h-[1.2em]">
          Mínimo {formatCoins(plan.minAmount)}, máximo {formatCoins(plan.maxAmount)} moedas.
        </p>
      )}
      <button type="button" onClick={() => setCustomize((v) => !v)} className="mt-3 text-[11px] text-rpg-gold-light hover:underline underline-offset-2">
        {customize ? "Ocultar personalização" : "+ Dar um nome a este cofrinho"}
      </button>
      {customize && (
        <div className="mt-2 space-y-2 border-t border-rpg-border/60 pt-2.5">
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`icon-${plan.id}`}>Emoji do cofrinho</label>
            <input
              id={`icon-${plan.id}`}
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={8}
              placeholder="🎯"
              className="w-12 border-2 border-rpg-border bg-rpg-bg px-1.5 py-1.5 text-center text-sm outline-none focus:border-rpg-gold"
              style={{ borderRadius: 2 }}
            />
            <label className="sr-only" htmlFor={`label-${plan.id}`}>Apelido do cofrinho</label>
            <input
              id={`label-${plan.id}`}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              placeholder="Ex.: Viagem de fim de ano"
              className="flex-1 min-w-0 border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold"
              style={{ borderRadius: 2 }}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {QUICK_ICONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                aria-label={`Usar emoji ${e}`}
                className="h-7 w-7 border border-rpg-border/60 hover:border-rpg-gold text-sm"
                style={{ borderRadius: 2 }}
              >
                {e}
              </button>
            ))}
          </div>
          {goals.length > 0 && (
            <div>
              <label className="text-[10.5px] text-rpg-muted" htmlFor={`goal-${plan.id}`}>Vincular a uma meta (opcional)</label>
              <select
                id={`goal-${plan.id}`}
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="mt-1 w-full border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold"
                style={{ borderRadius: 2 }}
              >
                <option value="">Nenhuma</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </RPGPanel>
  );
}

function DepositRow({
  deposit,
  onClaim,
  claiming,
  onClaimEarly,
  claimingEarly,
  noPenalty,
}: {
  deposit: BankDeposit;
  onClaim?: () => void;
  claiming?: boolean;
  /** Só passado para investimentos ainda não vencidos (resgate antecipado quebra o prazo, exceto no Cofre Livre). */
  onClaimEarly?: () => void;
  claimingEarly?: boolean;
  /** true só no Cofre Livre (plan.earlyWithdrawalPenalty === false): resgate antecipado paga bônus proporcional ao tempo, nunca zero. */
  noPenalty?: boolean;
}) {
  const totalMs = new Date(deposit.maturesAt).getTime() - new Date(deposit.createdAt).getTime();
  const elapsedMs = Date.now() - new Date(deposit.createdAt).getTime();
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 1;
  const pct = fraction * 100;
  const tax = deposit.payout - deposit.netPayout;
  // Estimativa do resgate antecipado no Cofre Livre -- mesma fórmula do backend
  // (bankService.claimDepositEarly): só pra mostrar um número antes de confirmar,
  // o valor real sempre vem do servidor no momento do resgate.
  const proratedGain = Math.floor(projectGain(deposit.amount, deposit.rateBps) * fraction);
  const proratedTax = Math.floor((proratedGain * deposit.taxBps) / 10_000);
  const proratedEstimate = deposit.amount + proratedGain - proratedTax;

  return (
    <div className="rpg-panel p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-rpg font-semibold text-sm text-rpg-text truncate flex items-center gap-1.5">
          {deposit.icon && <span aria-hidden>{deposit.icon}</span>}
          {deposit.label || deposit.planLabel}
        </p>
        <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
          {formatCoins(deposit.amount)} → {formatCoins(deposit.netPayout)}
        </span>
      </div>
      {deposit.label && <p className="text-[10.5px] text-rpg-muted mb-1">{deposit.planLabel}</p>}
      {deposit.goalTitle && (
        <p className="flex items-center gap-1 text-[10.5px] text-rpg-blue mb-1.5">
          <Target size={11} aria-hidden /> Meta: {deposit.goalTitle}
        </p>
      )}
      {tax > 0 && (
        <p className="text-[10.5px] text-rpg-muted mb-2">
          Bruto {formatCoins(deposit.payout)} − IR {formatPct(deposit.taxBps)}% (−{formatCoins(tax)})
        </p>
      )}
      {onClaim ? (
        <RPGButton type="button" variant="success" className="w-full mt-1" disabled={claiming} onClick={onClaim}>
          {claiming ? "Resgatando…" : `Resgatar +${formatCoins(deposit.netPayout)} moedas`}
        </RPGButton>
      ) : (
        <>
          <RPGProgressBar
            tone="purple"
            label={noPenalty ? `${daysLeft(deposit.maturesAt)} dia(s) até o prazo de referência` : `${daysLeft(deposit.maturesAt)} dia(s) restante(s)`}
            value={pct}
            valueLabel={`${Math.round(pct)}%`}
          />
          {onClaimEarly && (
            noPenalty ? (
              <RPGButton type="button" variant="ghost" className="w-full mt-2 text-rpg-gold-light" disabled={claimingEarly} onClick={onClaimEarly}>
                {claimingEarly ? "Resgatando…" : `Resgatar agora (~${formatCoins(proratedEstimate)}, proporcional)`}
              </RPGButton>
            ) : (
              <RPGButton type="button" variant="ghost" className="w-full mt-2 text-rpg-red" disabled={claimingEarly} onClick={onClaimEarly}>
                {claimingEarly ? "Resgatando…" : `Resgatar antecipado (só ${formatCoins(deposit.amount)}, sem bônus)`}
              </RPGButton>
            )
          )}
        </>
      )}
    </div>
  );
}

function LedgerRow({ entry, onSelect }: { entry: LedgerEntry; onSelect: (id: string) => void }) {
  const positive = entry.amount > 0;
  const category = ledgerCategoryOf(entry.sourceType);
  const Icon = category.icon;
  return (
    <li className="border-b border-rpg-border/40 last:border-0">
      <button
        type="button"
        onClick={() => onSelect(entry.id)}
        aria-label={`Ver comprovante de ${entry.label ?? entry.eventType}`}
        className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-rpg-panel-hover/60 transition-colors"
        style={{ borderRadius: 3 }}
      >
        <div className="min-w-0 flex items-center gap-2.5">
          <span className={clsx("inline-flex h-7 w-7 shrink-0 items-center justify-center border", RPG_TONE_SOFT[category.tone])} style={{ borderRadius: 3 }} aria-hidden>
            <Icon size={13} />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-rpg-text truncate">{entry.label ?? entry.eventType}</p>
            <p className="text-[10.5px] text-rpg-muted truncate">{category.label} · {formatWhen(entry.createdAt)}</p>
          </div>
        </div>
        <span className={`font-pixel text-[12px] font-semibold shrink-0 ${positive ? "text-rpg-green" : "text-rpg-red"}`}>
          {positive ? "+" : ""}
          {formatCoins(entry.amount)}
        </span>
      </button>
    </li>
  );
}

function LedgerDetailModal({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const { detail, isLoading } = useLedgerEntryDetail(entryId);
  if (!entryId) return null;
  const category = detail ? ledgerCategoryOf(detail.sourceType) : null;
  const CategoryIcon = category?.icon;
  return (
    <Modal open onClose={onClose} title="Comprovante" size="sm">
      {isLoading || !detail ? (
        <p className="text-sm text-rpg-muted">Carregando…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2.5">
            {category && CategoryIcon && (
              <span className={clsx("inline-flex h-9 w-9 shrink-0 items-center justify-center border", RPG_TONE_SOFT[category.tone])} style={{ borderRadius: 3 }} aria-hidden>
                <CategoryIcon size={16} />
              </span>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-rpg-text truncate">{detail.label ?? detail.eventType}</p>
              <p className="text-xs text-rpg-muted">{category?.label ?? "Outros"}</p>
            </div>
          </div>
          <dl className="space-y-1.5 border-t border-rpg-border/60 pt-3 text-[13px]">
            <div className="flex items-center justify-between">
              <dt className="text-rpg-muted">Data completa</dt>
              <dd className="text-rpg-text">{fullDateTime(detail.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-rpg-muted">Saldo antes</dt>
              <dd className="font-pixel text-rpg-text">{formatCoins(detail.balanceBefore)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-rpg-muted">Movimentação</dt>
              <dd className={`font-pixel font-semibold ${detail.amount >= 0 ? "text-rpg-green" : "text-rpg-red"}`}>
                {detail.amount >= 0 ? "+" : ""}
                {formatCoins(detail.amount)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="font-semibold text-rpg-gold-light">Saldo depois</dt>
              <dd className="font-pixel font-semibold text-rpg-gold-light">{formatCoins(detail.balanceAfter)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}

function ExtratoFilters({
  selectedKeys,
  onToggleCategory,
  from,
  to,
  onFromChange,
  onToChange,
  q,
  onQChange,
  onClear,
  hasFilter,
}: {
  selectedKeys: string[];
  onToggleCategory: (key: string) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  q: string;
  onQChange: (v: string) => void;
  onClear: () => void;
  hasFilter: boolean;
}) {
  return (
    <div className="mb-3 space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {LEDGER_CATEGORIES.map((cat) => {
          const active = selectedKeys.includes(cat.key);
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onToggleCategory(cat.key)}
              aria-pressed={active}
              className={clsx(
                "inline-flex items-center gap-1 border px-2 py-1 text-[10.5px] font-pixel uppercase tracking-wide transition-colors",
                active ? RPG_TONE_SOFT[cat.tone] : "border-rpg-border text-rpg-muted hover:text-rpg-text",
              )}
              style={{ borderRadius: 3 }}
            >
              <Icon size={11} aria-hidden /> {cat.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted pointer-events-none" aria-hidden />
          <label className="sr-only" htmlFor="ledger-search">Buscar no extrato</label>
          <input
            id="ledger-search"
            type="search"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Buscar por descrição…"
            className="w-full border-2 border-rpg-border bg-rpg-bg pl-7 pr-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold"
            style={{ borderRadius: 2 }}
          />
        </div>
        <label className="sr-only" htmlFor="ledger-from">De</label>
        <input
          id="ledger-from"
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold"
          style={{ borderRadius: 2 }}
        />
        <span className="text-xs text-rpg-muted">até</span>
        <label className="sr-only" htmlFor="ledger-to">Até</label>
        <input
          id="ledger-to"
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-xs text-rpg-text outline-none focus:border-rpg-gold"
          style={{ borderRadius: 2 }}
        />
        {hasFilter && (
          <RPGButton type="button" variant="ghost" className="text-xs" onClick={onClear}>
            <X size={12} /> Limpar filtros
          </RPGButton>
        )}
      </div>
    </div>
  );
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function StatementRow({ row }: { row: BankStatementMonth }) {
  const total = row.earned - row.taxPaid - row.interestPaid - row.lateFeePaid;
  return (
    <li className="rpg-panel p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="font-rpg font-semibold text-sm text-rpg-text capitalize">{monthLabel(row.month)}</p>
        <span className={`font-pixel text-sm font-semibold ${total >= 0 ? "text-rpg-green" : "text-rpg-red"}`}>
          {total >= 0 ? "+" : ""}
          {formatCoins(total)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between"><dt className="text-rpg-muted">Rendimento (investimentos)</dt><dd className="text-rpg-green">+{formatCoins(row.earned)}</dd></div>
        <div className="flex justify-between"><dt className="text-rpg-muted">Imposto sobre ganho</dt><dd className="text-rpg-red">−{formatCoins(row.taxPaid)}</dd></div>
        <div className="flex justify-between"><dt className="text-rpg-muted">Juros pagos (empréstimos)</dt><dd className="text-rpg-red">−{formatCoins(row.interestPaid)}</dd></div>
        <div className="flex justify-between"><dt className="text-rpg-muted">Multa por atraso</dt><dd className="text-rpg-red">−{formatCoins(row.lateFeePaid)}</dd></div>
      </dl>
    </li>
  );
}

function StatementSection({ months, isLoading }: { months: BankStatementMonth[]; isLoading: boolean }) {
  if (isLoading) return null;
  if (months.length === 0) {
    return (
      <RPGPanel title="Extrato de rendimentos" icon={<Receipt size={16} />} className="mb-5">
        <p className="text-sm text-rpg-muted">Nenhum rendimento ou juro registrado ainda neste período. Resgate um investimento no prazo ou quite um empréstimo para começar.</p>
      </RPGPanel>
    );
  }
  return (
    <RPGPanel title="Extrato de rendimentos (mensal)" icon={<Receipt size={16} />} className="mb-5">
      <p className="text-xs text-rpg-muted mb-3">Quanto o Banco rendeu e custou por mês — resgate antecipado nunca conta ganho nem imposto aqui.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
        {[...months].reverse().map((row) => (
          <StatementRow key={row.month} row={row} />
        ))}
      </ul>
    </RPGPanel>
  );
}

function ExtratoView() {
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  // Busca por texto: pequeno atraso antes de disparar a requisição, pra não bater uma a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(qInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const sourceTypes = useMemo(() => categoryKeys.flatMap((k) => ledgerCategoryByKey(k)?.sourceTypes ?? []), [categoryKeys]);
  const filter: LedgerUiFilter = useMemo(
    () => ({ categories: sourceTypes, from: from || undefined, to: to || undefined, q: q || undefined }),
    [sourceTypes, from, to, q],
  );
  const { entries, isLoading, hasMore, loadMore, isFetching, resetPaging } = useBankLedger(filter);

  const filterSignature = `${categoryKeys.join(",")}|${from}|${to}|${q}`;
  useEffect(() => {
    resetPaging();
    // Só quando o filtro muda de fato -- resetPaging é estável entre renders do mesmo filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  const hasFilter = categoryKeys.length > 0 || !!from || !!to || !!q;
  const toggleCategory = (key: string) => setCategoryKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  const clearFilters = () => {
    setCategoryKeys([]);
    setFrom("");
    setTo("");
    setQInput("");
  };

  return (
    <RPGPanel title="Extrato de moedas" icon={<Receipt size={16} />}>
      <p className="text-xs text-rpg-muted mb-2">Todo ganho e gasto de moedas do jogo — missões, loja, Tesouro e Banco juntos. Toque numa linha para ver o comprovante.</p>
      <ExtratoFilters
        selectedKeys={categoryKeys}
        onToggleCategory={toggleCategory}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        q={qInput}
        onQChange={setQInput}
        onClear={clearFilters}
        hasFilter={hasFilter}
      />
      {isLoading ? (
        <p className="text-sm text-rpg-muted">Carregando extrato…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-rpg-muted">{hasFilter ? "Nenhuma movimentação encontrada com esse filtro." : "Nenhuma movimentação de moedas ainda. Complete missões e contratos para começar a ganhar."}</p>
      ) : (
        <>
          <ul>
            {entries.map((e) => (
              <LedgerRow key={e.id} entry={e} onSelect={setSelectedEntryId} />
            ))}
          </ul>
          {hasMore && (
            <div className="pt-3 flex justify-center">
              <RPGButton type="button" variant="ghost" disabled={isFetching} onClick={loadMore}>
                {isFetching ? "Carregando…" : "Carregar mais"}
              </RPGButton>
            </div>
          )}
        </>
      )}
      <LedgerDetailModal entryId={selectedEntryId} onClose={() => setSelectedEntryId(null)} />
    </RPGPanel>
  );
}

function EvolucaoCard() {
  const { points, isLoading } = useBankHistory(60);
  const hasScore = points.some((p) => p.score != null);
  const chartData = points.map((p) => ({ date: p.date.slice(5), saldo: p.balance, score: p.score }));

  return (
    <RPGPanel title="Evolução do Banco" icon={<LineChartIcon size={16} />} className="mb-5">
      <p className="text-xs text-rpg-muted mb-3">
        Saldo de moedas nos últimos 60 dias{hasScore ? " e score de crédito (só nos dias em que você abriu o Banco)" : ""} — sempre dado real, nunca projetado.
      </p>
      {isLoading ? (
        <div className="h-48 rounded animate-pulse bg-rpg-bg-2" />
      ) : points.length === 0 ? (
        <p className="text-sm text-rpg-muted">Sem histórico ainda. Invista ou abra o Banco para começar a registrar.</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: hasScore ? 10 : 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis yAxisId="saldo" tick={{ fontSize: 10 }} width={40} />
              {hasScore && <YAxis yAxisId="score" orientation="right" domain={[300, 850]} tick={{ fontSize: 10 }} width={34} />}
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(value: number, name: string) => [formatCoins(value), name]} />
              <Line yAxisId="saldo" type="monotone" dataKey="saldo" name="Saldo" stroke="rgb(var(--rpg-gold-light))" strokeWidth={2} dot={false} connectNulls />
              {hasScore && (
                <Line yAxisId="score" type="monotone" dataKey="score" name="Score de crédito" stroke="rgb(var(--rpg-purple))" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </RPGPanel>
  );
}

function SimuladorView({ plans }: { plans: BankPlan[] }) {
  const [amount, setAmount] = useState("200");
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed > 0;

  return (
    <RPGPanel title="Simulador de investimento" icon={<Calculator size={16} />} className="mb-5">
      <p className="text-xs text-rpg-muted mb-3">Compare os planos para a mesma quantia antes de decidir onde investir — sem comprometer moeda nenhuma.</p>
      <div className="flex items-center gap-2 mb-3 max-w-xs">
        <label className="sr-only" htmlFor="sim-amount">Quantia para simular</label>
        <input
          id="sim-amount"
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border-2 border-rpg-border bg-rpg-bg px-2.5 py-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
          style={{ borderRadius: 2 }}
        />
        <span className="text-xs text-rpg-muted shrink-0">moedas</span>
      </div>
      {valid ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {plans.map((plan) => {
            const inRange = parsed >= plan.minAmount && parsed <= plan.maxAmount;
            const net = projectNet(parsed, plan.rateBps, plan.taxBps);
            const tax = projectTax(parsed, plan.rateBps, plan.taxBps);
            return (
              <div key={plan.id} className="rpg-panel p-3">
                <p className="font-rpg font-semibold text-sm text-rpg-text mb-1 truncate">{plan.label}</p>
                {inRange ? (
                  <dl className="text-[11px] space-y-0.5">
                    <div className="flex justify-between"><dt className="text-rpg-muted">Prazo</dt><dd>{plan.earlyWithdrawalPenalty === false ? "livre" : `${plan.termDays} dia${plan.termDays > 1 ? "s" : ""}`}</dd></div>
                    <div className="flex justify-between"><dt className="text-rpg-muted">Imposto</dt><dd className="text-rpg-red">−{formatCoins(tax)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt className="text-rpg-gold-light">Líquido</dt><dd className="text-rpg-gold-light">{formatCoins(net)}</dd></div>
                  </dl>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Fora da faixa ({formatCoins(plan.minAmount)}–{formatCoins(plan.maxAmount)}).</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-rpg-muted">Informe uma quantia maior que zero para simular.</p>
      )}
    </RPGPanel>
  );
}

function LoanSimuladorView({ credit }: { credit: CreditInfo }) {
  const [amount, setAmount] = useState("200");
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed > 0;
  // Ignora o nível "Sem crédito liberado" (score 0): não é um nível de crédito de verdade pra simular.
  const tiers: LoanTier[] = credit.tiers.filter((t) => t.maxAmount > 0);

  return (
    <RPGPanel variant="gold" title="Simulador de empréstimo" icon={<Calculator size={16} />} className="mb-5">
      <p className="text-xs text-rpg-muted mb-3">
        Veja quanto você pagaria em cada nível de crédito pela mesma quantia — útil pra planejar até onde vale subir o score antes de pedir.
      </p>
      <div className="flex items-center gap-2 mb-3 max-w-xs">
        <label className="sr-only" htmlFor="loan-sim-amount">Quantia para simular o empréstimo</label>
        <input
          id="loan-sim-amount"
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border-2 border-rpg-border bg-rpg-bg px-2.5 py-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
          style={{ borderRadius: 2 }}
        />
        <span className="text-xs text-rpg-muted shrink-0">moedas</span>
      </div>
      {valid ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {tiers.map((tier) => {
            const current = tier.label === credit.tier.label;
            const inRange = parsed <= tier.maxAmount;
            const total = projectLoanTotal(parsed, tier.rateBps);
            return (
              <div key={tier.label} className="rpg-panel p-3">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <p className="font-rpg font-semibold text-sm text-rpg-text truncate">{tier.label}</p>
                  {current && <RPGBadge tone="gold">Seu nível</RPGBadge>}
                </div>
                {inRange ? (
                  <dl className="text-[11px] space-y-0.5">
                    <div className="flex justify-between"><dt className="text-rpg-muted">Juros ({formatPct(tier.rateBps)}%)</dt><dd className="text-rpg-red">+{formatCoins(total - parsed)}</dd></div>
                    <div className="flex justify-between font-semibold"><dt className="text-rpg-gold-light">Total a pagar</dt><dd className="text-rpg-gold-light">{formatCoins(total)}</dd></div>
                  </dl>
                ) : (
                  <p className="text-[11px] text-rpg-muted">Acima do limite deste nível ({formatCoins(tier.maxAmount)} moedas).</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-rpg-muted">Informe uma quantia maior que zero para simular.</p>
      )}
    </RPGPanel>
  );
}

/** "Fatura" visual do empréstimo ativo -- nome e nível reais do jogador, nunca uma "classe" inventada sem dado por trás. */
function LoanFaturaCard({
  loan,
  credit,
  playerName,
  playerLevel,
  onRepay,
  repaying,
}: {
  loan: BankLoan;
  credit: CreditInfo;
  playerName: string | null;
  playerLevel: number | null;
  onRepay: () => void;
  repaying: boolean;
}) {
  const totalWithFee = loan.overdue ? loan.totalDue + projectLateFee(loan.totalDue, loan.lateFeeBps) : loan.totalDue;
  return (
    <RPGPanel variant={loan.overdue ? "danger" : "gold"} className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center border-2 border-rpg-gold/70 bg-rpg-bg text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
            <CreditCard size={16} />
          </span>
          <div className="min-w-0">
            <p className="font-pixel text-[10px] uppercase tracking-wide text-rpg-muted">Fatura do empréstimo</p>
            <p className="text-sm font-semibold text-rpg-text truncate">{playerName ?? "Aventureiro"}{playerLevel != null ? ` · Nv. ${playerLevel}` : ""}</p>
          </div>
        </div>
        {loan.overdue ? <RPGBadge tone="red">Atrasado</RPGBadge> : <RPGBadge tone={tierTone(credit.tier.label)}>{credit.tier.label}</RPGBadge>}
      </div>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-[11px] text-rpg-muted">Valor tomado</p>
          <p className="font-pixel text-2xl font-bold text-rpg-text tabular-nums">{formatCoins(loan.amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-rpg-muted">Total a pagar</p>
          <p className="font-pixel text-2xl font-bold text-rpg-gold-light tabular-nums">{formatCoins(totalWithFee)}</p>
        </div>
      </div>
      {loan.overdue ? (
        <p className="flex items-center gap-1.5 text-xs text-rpg-red mb-4">
          <AlertTriangle size={13} aria-hidden /> Atrasado há {daysOverdue(loan.dueAt)} dia(s) (multa de {formatPct(loan.lateFeeBps)}% já incluída) — pagar agora evita mais queda no score.
        </p>
      ) : (
        <p className="text-xs text-rpg-muted mb-4">Vence em {daysLeft(loan.dueAt)} dia(s).</p>
      )}
      <RPGButton type="button" variant={loan.overdue ? "danger" : "success"} className="w-full" disabled={repaying} onClick={onRepay}>
        {repaying ? "Quitando…" : "Quitar empréstimo"}
      </RPGButton>
    </RPGPanel>
  );
}

function CreditoView({
  credit,
  loan,
  playerName,
  playerLevel,
  onRequest,
  onRepay,
  requesting,
  repaying,
}: {
  credit: CreditInfo;
  loan: { active: BankLoan | null; history: BankLoan[] };
  playerName: string | null;
  playerLevel: number | null;
  onRequest: (amount: number) => void;
  onRepay: (loanId: string) => void;
  repaying: boolean;
  requesting: boolean;
}) {
  const [amount, setAmount] = useState(String(Math.min(100, credit.tier.maxAmount || 100)));
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= credit.tier.maxAmount;
  const total = valid ? projectLoanTotal(parsed, credit.tier.rateBps) : null;
  const scorePct = ((credit.score - credit.scoreMin) / (credit.scoreMax - credit.scoreMin)) * 100;
  const loanQuickAmounts = [50, 100, 500].filter((v) => v <= credit.tier.maxAmount);

  return (
    <>
      <RPGPanel title="Score de crédito" icon={<ShieldCheck size={16} />} className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <RPGProgressRing
            value={scorePct}
            size={108}
            tone={tierTone(credit.tier.label)}
            label="Score de crédito"
            displayValue={String(credit.score)}
            valueClassName="text-xl text-rpg-text"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <RPGBadge tone={tierTone(credit.tier.label)}>{credit.tier.label}</RPGBadge>
              <span className="text-[11px] text-rpg-muted">{credit.scoreMin}–{credit.scoreMax}</span>
            </div>
            <p className="text-[11px] text-rpg-muted mb-1">
              Limite atual: <strong className="text-rpg-text">{formatCoins(credit.tier.maxAmount)} moedas</strong> · juros {formatPct(credit.tier.rateBps)}%
            </p>
            <p className="text-[11px] text-rpg-muted">
              Sobe quando você conclui investimentos e paga empréstimos em dia. Cai quando paga atrasado ou deixa um empréstimo vencer sem quitar.
            </p>
          </div>
        </div>
      </RPGPanel>

      <LoanSimuladorView credit={credit} />

      {loan.active ? (
        <LoanFaturaCard loan={loan.active} credit={credit} playerName={playerName} playerLevel={playerLevel} onRepay={() => onRepay(loan.active!.id)} repaying={repaying} />
      ) : (
        <RPGPanel variant="gold" title="Pedir empréstimo" icon={<CreditCard size={16} />} className="mb-5">
          {credit.tier.maxAmount <= 0 ? (
            <p className="text-sm text-rpg-muted">Seu score ainda não libera crédito. Conclua um investimento no Banco para começar a construir histórico.</p>
          ) : (
            <>
              <form
                className="flex items-center gap-2 mb-3 max-w-xs"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (valid) onRequest(parsed);
                }}
              >
                <label className="sr-only" htmlFor="loan-amount">Quantia para pedir emprestado</label>
                <input
                  id="loan-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={credit.tier.maxAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border-2 border-rpg-border bg-rpg-bg px-2.5 py-2 text-sm text-rpg-text outline-none focus:border-rpg-gold"
                  style={{ borderRadius: 2 }}
                />
                <RPGButton type="submit" variant="gold" disabled={requesting || !valid}>
                  Pedir
                </RPGButton>
              </form>
              {(loanQuickAmounts.length > 0 || credit.tier.maxAmount > 0) && (
                <div className="flex flex-wrap gap-1.5 mb-3 max-w-xs">
                  {loanQuickAmounts.map((v) => (
                    <QuickAmountChip key={v} label={formatCoins(v)} onClick={() => setAmount(String(v))} />
                  ))}
                  <QuickAmountChip label="Tudo" onClick={() => setAmount(String(credit.tier.maxAmount))} />
                </div>
              )}
              {valid && total != null && (
                <dl className="text-[11px] space-y-1 border-t border-rpg-border/60 pt-2 max-w-xs">
                  <div className="flex items-center justify-between">
                    <dt className="text-rpg-muted">Juros ({formatPct(credit.tier.rateBps)}%)</dt>
                    <dd className="font-pixel text-rpg-red">+{formatCoins(total - parsed)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <dt className="font-semibold text-rpg-gold-light">Total a pagar em {credit.termDays} dias</dt>
                    <dd className="font-pixel font-semibold text-rpg-gold-light">{formatCoins(total)}</dd>
                  </div>
                </dl>
              )}
              <p className="mt-2 text-[11px] text-rpg-muted">Limite de {formatCoins(credit.tier.maxAmount)} moedas. Pagar atrasado soma multa de {formatPct(credit.lateFeeBps)}% e derruba o score.</p>
            </>
          )}
        </RPGPanel>
      )}

      {loan.history.length > 0 && (
        <RPGPanel title="Histórico de empréstimos" icon={<Coins size={16} />}>
          <ul className="space-y-1.5">
            {loan.history.slice(0, 10).map((l) => {
              const late = !!l.repaidAt && l.repaidAt > l.dueAt;
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5 text-rpg-text">
                    {formatCoins(l.amount)} → {formatCoins(l.repaidAmount ?? l.totalDue)}
                    <RPGBadge tone={late ? "red" : "green"}>{late ? "Atrasado" : "Em dia"}</RPGBadge>
                  </span>
                  <span className="font-pixel text-[11px] text-rpg-muted shrink-0">{l.repaidAt ? new Date(l.repaidAt).toLocaleDateString("pt-BR") : ""}</span>
                </li>
              );
            })}
          </ul>
        </RPGPanel>
      )}
    </>
  );
}

function AutoInvestCard({
  autoInvest,
  plans,
  onSave,
  saving,
}: {
  autoInvest: AutoInvestRule;
  plans: BankPlan[];
  onSave: (input: AutoInvestRule) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(autoInvest.enabled);
  const [pct, setPct] = useState(String(autoInvest.pctBps / 100));
  const [planId, setPlanId] = useState(autoInvest.planId);

  const parsedPct = Number(pct);
  const validPct = Number.isFinite(parsedPct) && parsedPct >= 1 && parsedPct <= 50;
  const selectedPlan = plans.find((p) => p.id === planId) ?? plans[0];
  const dirty = enabled !== autoInvest.enabled || Math.round(parsedPct * 100) !== autoInvest.pctBps || planId !== autoInvest.planId;

  return (
    <RPGPanel id="auto-invest-anchor" variant="quest" title="Investimento automático" icon={<Repeat size={16} />} className="mb-5">
      <p className="text-xs text-rpg-muted mb-3">
        Reserve uma fatia de toda moeda ganha em missões e contratos direto num plano, sem precisar investir manualmente. O Banco nunca reinveste moedas que vêm dele mesmo (resgate, empréstimo) — só o que você ganha jogando.
      </p>
      <div className="flex flex-wrap items-end gap-4 mb-2">
        <div className="flex items-center gap-2">
          <RPGSwitch checked={enabled} onChange={() => setEnabled((v) => !v)} label={enabled ? "Desativar investimento automático" : "Ativar investimento automático"} />
          <span className="text-sm text-rpg-text">{enabled ? "Ativado" : "Desativado"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-rpg-muted" htmlFor="auto-invest-pct">Percentual investido</label>
          <div className="flex items-center gap-1.5">
            <input
              id="auto-invest-pct"
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-20 border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold"
              style={{ borderRadius: 2 }}
            />
            <span className="text-xs text-rpg-muted">%</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-rpg-muted" htmlFor="auto-invest-plan">Plano de destino</label>
          <select
            id="auto-invest-plan"
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="border-2 border-rpg-border bg-rpg-bg px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold"
            style={{ borderRadius: 2 }}
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <RPGButton
          type="button"
          variant="gold"
          disabled={!validPct || !dirty || saving}
          onClick={() => onSave({ enabled, pctBps: Math.round(parsedPct * 100), planId: selectedPlan?.id ?? planId })}
        >
          {saving ? "Salvando…" : "Salvar"}
        </RPGButton>
      </div>
      {!validPct && <p className="text-[11px] text-rpg-red">Informe um percentual entre 1% e 50%.</p>}
      {enabled && selectedPlan && (
        <p className="text-[11px] text-rpg-muted">
          Cada moeda ganha investe {pct || 0}% automaticamente no {selectedPlan.label} (mínimo {formatCoins(selectedPlan.minAmount)} moedas por depósito — ganhos menores que isso ficam só no saldo).
        </p>
      )}
    </RPGPanel>
  );
}

/** "Próxima conquista do Banco" -- visível na própria tela, não só em Conquistas (análise de mercado, item E.16). */
function NextBankAchievementCard() {
  const { locked, isLoading } = useAchievements(false);
  if (isLoading) return null;
  const bankLocked = [...locked].filter((a) => a.category === "banco").sort((a, b) => b.progress - a.progress);
  const next = bankLocked[0];
  if (!next) return null;
  const Icon = achievementIcon(next.icon);
  const remaining = next.threshold != null && next.currentValue != null ? Math.max(0, next.threshold - next.currentValue) : null;
  return (
    <RPGPanel variant="quest" className="mb-5">
      <div className="flex items-center gap-3">
        <span className={clsx("inline-flex h-10 w-10 shrink-0 items-center justify-center border-2", RPG_TONE_SOFT[TIER_RPG_TONE[next.tier]])} style={{ borderRadius: 3 }} aria-hidden>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-pixel text-[10px] uppercase tracking-wide text-rpg-muted">Próxima conquista do Banco</p>
          <p className="text-sm font-semibold text-rpg-text truncate">{next.title}</p>
          <RPGProgressBar tone="gold" label={next.title} value={next.progress} showLabel={false} className="mt-1.5" />
        </div>
        {remaining != null && remaining > 0 && (
          <RPGBadge tone="gold" className="shrink-0">faltam {remaining}</RPGBadge>
        )}
      </div>
    </RPGPanel>
  );
}

/** Saldo como elemento único e central da tela, com ações rápidas logo abaixo (análise de mercado, item A). */
function BalanceHero({
  balance,
  isLoading,
  todayDelta,
  hidden,
  onToggleHidden,
  onQuickAction,
}: {
  balance: number | undefined;
  isLoading: boolean;
  todayDelta: number | null;
  hidden: boolean;
  onToggleHidden: () => void;
  onQuickAction: (action: "investir" | "credito" | "automatico" | "extrato") => void;
}) {
  const displayBalance = useCountUp(balance ?? 0);
  return (
    <RPGPanel variant="gold" className="mb-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <p className="font-pixel text-[11px] uppercase tracking-wide text-rpg-muted mb-1.5">Saldo disponível</p>
          <div className="flex items-center gap-2.5">
            <span className="font-pixel text-4xl sm:text-5xl font-bold text-rpg-gold-light tabular-nums leading-none">
              {isLoading ? "…" : hidden ? "••••••" : formatCoins(displayBalance)}
            </span>
            <button
              type="button"
              onClick={onToggleHidden}
              aria-label={hidden ? "Mostrar saldo" : "Ocultar saldo"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg text-rpg-muted hover:text-rpg-gold-light hover:border-rpg-gold transition-colors"
              style={{ borderRadius: 3 }}
            >
              {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {!hidden && !isLoading && todayDelta != null && todayDelta !== 0 && (
            <p className={clsx("mt-1.5 text-xs font-medium", todayDelta > 0 ? "text-rpg-green" : "text-rpg-red")}>
              {todayDelta > 0 ? `Rendeu +${formatCoins(todayDelta)} hoje` : `${formatCoins(todayDelta)} hoje`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          <RPGButton type="button" variant="gold" onClick={() => onQuickAction("investir")}>
            <Vault size={14} /> Investir
          </RPGButton>
          <RPGButton type="button" variant="secondary" onClick={() => onQuickAction("credito")}>
            <CreditCard size={14} /> Empréstimo
          </RPGButton>
          <RPGButton type="button" variant="ghost" onClick={() => onQuickAction("automatico")}>
            <Repeat size={14} /> Automático
          </RPGButton>
          <RPGButton type="button" variant="ghost" onClick={() => onQuickAction("extrato")}>
            <Receipt size={14} /> Extrato
          </RPGButton>
        </div>
      </div>
    </RPGPanel>
  );
}

export function BancoPage() {
  const { summary, isLoading, deposit, claim, claimEarly, requestLoan, repayLoan, updateAutoInvest } = useBank();
  const { user } = useAuth();
  const { data: profile } = useGamificationProfile();
  const { data: activeGoals } = useActiveGoalsForBank();
  const { prefs } = useRpgPreferences();
  const reduceMotion = useReducedMotion() || prefs.animations !== "full";
  const { points: historyPoints } = useBankHistory(60);
  const { months: statementMonths, isLoading: statementLoading } = useBankStatement(12);

  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [pendingEarlyId, setPendingEarlyId] = useState<string | null>(null);
  const [view, setView] = useState<"investir" | "credito" | "extrato">("investir");
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const [hiddenBalance, setHiddenBalance] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(HIDE_BALANCE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!pendingScroll) return;
    const t = window.setTimeout(() => {
      document.getElementById(pendingScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(null);
    }, 60);
    return () => window.clearTimeout(t);
  }, [pendingScroll, view]);

  const toggleHiddenBalance = () => {
    setHiddenBalance((v) => {
      try {
        window.localStorage.setItem(HIDE_BALANCE_KEY, v ? "0" : "1");
      } catch {
        /* armazenamento indisponível: só não lembra a preferência */
      }
      return !v;
    });
  };

  const handleQuickAction = (action: "investir" | "credito" | "automatico" | "extrato") => {
    if (action === "credito" || action === "extrato") {
      setView(action);
      return;
    }
    setView("investir");
    if (action === "automatico") setPendingScroll("auto-invest-anchor");
  };

  const todayDelta = historyPoints.length >= 2 ? (historyPoints[historyPoints.length - 1].balance ?? 0) - (historyPoints[historyPoints.length - 2].balance ?? 0) : null;
  const earnedTrend = !statementLoading && statementMonths.length >= 2 ? monthOverMonth(statementMonths[statementMonths.length - 1].earned, statementMonths[statementMonths.length - 2].earned) : null;
  const taxTrend = !statementLoading && statementMonths.length >= 2 ? monthOverMonth(statementMonths[statementMonths.length - 1].taxPaid, statementMonths[statementMonths.length - 2].taxPaid) : null;

  /** Dispara o burst "+moedas" no último ponto de clique e o chime de feedback -- mesma linguagem visual do XP (utils/xpBurst e utils/sfx), nunca um efeito novo. */
  const celebrate = (text: string) => {
    const point = recentActionPoint();
    if (point) spawnBurst(text, point, { tone: "coins", reduced: reduceMotion });
    playSfx("xp", prefs.sound);
  };

  const handleInvest = (plan: BankPlan, amount: number, opts: { label: string | null; icon: string | null; goalId: string | null }) => {
    deposit.mutate(
      { planId: plan.id, amount, label: opts.label, icon: opts.icon, goalId: opts.goalId },
      {
        onSuccess: () => {
          setToastTone("success");
          setToast(`Investido ${formatCoins(amount)} moedas no ${opts.label || plan.label}.`);
        },
        onError: (err) => {
          setToastTone("error");
          setToast(err instanceof Error ? err.message : "Não foi possível investir.");
        },
      },
    );
  };

  const handleClaim = (d: BankDeposit) => {
    setPendingClaimId(d.id);
    claim.mutate(d.id, {
      onSuccess: (res) => {
        setToastTone("success");
        setToast(`Resgatado: +${formatCoins(res.payout)} moedas líquidas do ${d.planLabel}.`);
        celebrate(`+${formatCoins(res.payout)}`);
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível resgatar.");
      },
      onSettled: () => setPendingClaimId(null),
    });
  };

  const planById = (planId: string): BankPlan | undefined => summary?.plans.find((p) => p.id === planId);

  const handleClaimEarly = (d: BankDeposit) => {
    const noPenalty = planById(d.planId)?.earlyWithdrawalPenalty === false;
    const confirmMessage = noPenalty
      ? `Resgatar "${d.planLabel}" agora? Você recebe o principal + o bônus já proporcional ao tempo decorrido (o valor exato é calculado pelo servidor no momento do resgate). Essa ação não pode ser desfeita.`
      : `Resgatar "${d.planLabel}" agora, antes do prazo? Você recebe só o principal (${formatCoins(d.amount)} moedas) e perde todo o bônus (${formatCoins(d.netPayout - d.amount)} moedas que renderia esperando). Essa ação não pode ser desfeita.`;
    if (!confirm(confirmMessage)) {
      return;
    }
    setPendingEarlyId(d.id);
    claimEarly.mutate(d.id, {
      onSuccess: (res) => {
        setToastTone("success");
        setToast(
          noPenalty
            ? `Resgate antecipado: +${formatCoins(res.payout)} moedas (proporcional ao tempo) do ${d.planLabel}.`
            : `Resgate antecipado: +${formatCoins(res.payout)} moedas (sem bônus) do ${d.planLabel}.`,
        );
        if (res.payout > d.amount) celebrate(`+${formatCoins(res.payout)}`);
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível resgatar antecipadamente.");
      },
      onSettled: () => setPendingEarlyId(null),
    });
  };

  const handleSaveAutoInvest = (input: AutoInvestRule) => {
    updateAutoInvest.mutate(input, {
      onSuccess: () => {
        setToastTone("success");
        setToast(input.enabled ? "Investimento automático configurado." : "Investimento automático desativado.");
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível salvar a configuração.");
      },
    });
  };

  const handleRequestLoan = (amount: number) => {
    requestLoan.mutate(amount, {
      onSuccess: () => {
        setToastTone("success");
        setToast(`Empréstimo liberado: +${formatCoins(amount)} moedas na sua conta.`);
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível pedir o empréstimo.");
      },
    });
  };

  const handleRepayLoan = (loanId: string) => {
    repayLoan.mutate(loanId, {
      onSuccess: (res) => {
        setToastTone("success");
        setToast(`Empréstimo quitado: −${formatCoins(res.paid)} moedas.`);
        if (res.paid === res.loan.totalDue) celebrate("Quitado em dia!");
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível quitar o empréstimo.");
      },
    });
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full">
      <RPGPageHeader
        banner="loja"
        size="md"
        eyebrow="Economia da Guilda"
        title="Banco"
        subtitle="Invista com imposto sobre o ganho, peça crédito conforme seu score e veja o extrato completo — tudo numa tela só. Moeda do jogo, nunca dinheiro real."
        className="mb-5"
      />

      <RPGHowItWorks
        storageKey="lifeos-banco-como-funciona"
        steps={[
          { icon: Vault, title: "Invista com prazo", text: "Escolha um plano (ou o Cofre Livre, sem prazo fixo) e deixe suas moedas renderem — com imposto só sobre o ganho.", tone: "gold" },
          { icon: ShieldCheck, title: "Construa seu crédito", text: "Resgatar no prazo e pagar empréstimos em dia sobe seu score — ele define quanto você pode pedir emprestado e a juros de quanto.", tone: "blue" },
          { icon: Repeat, title: "Deixe no automático", text: "Ligue o investimento automático pra reservar uma fatia de toda moeda ganha em missões, sem precisar lembrar.", tone: "purple" },
        ]}
      />

      <div className="mt-5">
        <BalanceHero
          balance={summary?.balance}
          isLoading={isLoading}
          todayDelta={todayDelta}
          hidden={hiddenBalance}
          onToggleHidden={toggleHiddenBalance}
          onQuickAction={handleQuickAction}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <RPGStatCard
          icon={<PiggyBank size={18} />}
          label="Investimentos ativos"
          value={isLoading ? "…" : String(summary?.totals.activeCount ?? 0)}
          tone="purple"
        />
        <RPGStatCard
          icon={<Sparkles size={18} />}
          label="Prontos para resgatar"
          value={isLoading ? "…" : String(summary?.claimable.length ?? 0)}
          tone={summary && summary.claimable.length > 0 ? "green" : "muted"}
        />
        <RPGStatCard
          icon={<TrendingUp size={18} />}
          label="Ganho líquido"
          value={isLoading ? "…" : formatCoins(summary?.totals.earned ?? 0)}
          tone="blue"
          caption={`moedas de bônus já resgatadas, após imposto${earnedTrend ? ` · ${earnedTrend}` : ""}`}
        />
        <RPGStatCard
          icon={<Percent size={18} />}
          label="Imposto pago"
          value={isLoading ? "…" : formatCoins(summary?.totals.taxPaid ?? 0)}
          tone="red"
          caption={`descontado do rendimento, nunca do principal${taxTrend ? ` · ${taxTrend}` : ""}`}
        />
        <RPGStatCard
          icon={<ShieldCheck size={18} />}
          label="Score de crédito"
          value={isLoading ? "…" : String(summary?.credit.score ?? "—")}
          tone={summary ? tierTone(summary.credit.tier.label) : "muted"}
          caption={summary?.credit.tier.label}
        />
      </div>

      <EvolucaoCard />

      <NextBankAchievementCard />

      <div className="mb-5">
        <RPGTabs
          label="Seção do Banco"
          value={view}
          onChange={setView}
          tabs={[
            { value: "investir", label: "Investir", icon: <Landmark size={14} /> },
            { value: "credito", label: "Crédito", icon: <CreditCard size={14} /> },
            { value: "extrato", label: "Extrato (gastos e ganhos)", icon: <Receipt size={14} /> },
          ]}
        />
      </div>

      {view === "investir" && (
        <>
          <SimuladorView plans={summary?.plans ?? []} />

          {summary && (
            <AutoInvestCard autoInvest={summary.autoInvest} plans={summary.plans} onSave={handleSaveAutoInvest} saving={updateAutoInvest.isPending} />
          )}

          {summary && summary.claimable.length > 0 && (
            <RPGPanel variant="success" title="Prontos para resgatar" icon={<Sparkles size={16} />} className="mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {summary.claimable.map((d) => (
                  <DepositRow key={d.id} deposit={d} onClaim={() => handleClaim(d)} claiming={pendingClaimId === d.id} />
                ))}
              </div>
            </RPGPanel>
          )}

          <RPGPanel variant="gold" title="Planos de investimento" icon={<Vault size={16} />} className="mb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {(summary?.plans ?? []).map((plan) => (
                <DepositForm
                  key={plan.id}
                  plan={plan}
                  disabled={deposit.isPending}
                  balance={summary?.balance ?? 0}
                  goals={activeGoals ?? []}
                  onInvest={(amount, opts) => handleInvest(plan, amount, opts)}
                />
              ))}
            </div>
          </RPGPanel>

          <RPGPanel title="Investimentos em andamento" icon={<Coins size={16} />} className="mb-5">
            {!summary || summary.active.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhum investimento em andamento. Escolha um plano acima para começar.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {summary.active.map((d) => (
                  <DepositRow
                    key={d.id}
                    deposit={d}
                    onClaimEarly={() => handleClaimEarly(d)}
                    claimingEarly={pendingEarlyId === d.id}
                    noPenalty={planById(d.planId)?.earlyWithdrawalPenalty === false}
                  />
                ))}
              </div>
            )}
          </RPGPanel>

          {summary && summary.history.length > 0 && (
            <RPGPanel title="Histórico de resgates" icon={<Coins size={16} />}>
              <ul className="space-y-1.5">
                {summary.history.slice(0, 10).map((d) => {
                  const tax = d.payout - d.netPayout;
                  const received = d.actualPayout ?? d.netPayout;
                  // Resgate antecipado no Cofre Livre ainda pode ter rendido algo (proporcional ao tempo) --
                  // só os planos de prazo fixo sempre devolvem exatamente o principal (sem bônus nenhum).
                  const earlyWithGain = d.earlyWithdrawn && received > d.amount;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5 truncate text-rpg-text">
                        {d.icon && <span aria-hidden>{d.icon}</span>}
                        {d.label || d.planLabel}
                        {d.earlyWithdrawn && <RPGBadge tone={earlyWithGain ? "gold" : "red"}>{earlyWithGain ? "Antecipado (proporcional)" : "Antecipado"}</RPGBadge>}
                      </span>
                      <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
                        {formatCoins(d.amount)} → {formatCoins(received)}
                        {d.earlyWithdrawn
                          ? earlyWithGain
                            ? d.actualTax ? ` (IR −${formatCoins(d.actualTax)})` : ""
                            : " (sem bônus)"
                          : tax > 0 ? ` (IR −${formatCoins(tax)})` : ""}
                        {d.claimedAt ? ` · ${new Date(d.claimedAt).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </RPGPanel>
          )}
        </>
      )}

      {view === "credito" && summary && (
        <CreditoView
          credit={summary.credit}
          loan={summary.loan}
          playerName={user?.name ?? null}
          playerLevel={profile?.level ?? null}
          onRequest={handleRequestLoan}
          onRepay={handleRepayLoan}
          requesting={requestLoan.isPending}
          repaying={repayLoan.isPending}
        />
      )}

      {view === "extrato" && (
        <>
          <StatementSection months={statementMonths} isLoading={statementLoading} />
          <ExtratoView />
        </>
      )}

      <RPGToast message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </div>
  );
}
