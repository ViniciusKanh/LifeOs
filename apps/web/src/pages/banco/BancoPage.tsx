import { useState } from "react";
import {
  AlertTriangle,
  Calculator,
  Coins,
  CreditCard,
  HandCoins,
  Landmark,
  Percent,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Vault,
} from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGStatCard, RPGTabs, RPGToast, RPGWallet, type RpgTone } from "@/components/rpg";
import { useBank, useBankLedger } from "@/hooks/useBank";
import { formatWhen } from "@/utils/treasureDisplay";
import type { BankDeposit, BankLoan, BankPlan, CreditInfo, LedgerEntry } from "@/services/bankService";

/**
 * Banco: tela única e dedicada para administrar as moedas ganhas em
 * missões/contratos -- igual a um banco de verdade, mas gamificado:
 * investimentos de prazo fixo com imposto sobre o ganho, EMPRÉSTIMOS com
 * juros e multa por atraso (limite e taxa dependem do seu SCORE DE
 * CRÉDITO, que sobe investindo e pagando em dia), um simulador antes de
 * decidir, e um extrato com todo ganho e gasto de moedas. Nunca é dinheiro
 * real. Saldo, investimentos, crédito e extrato vêm sempre do backend; a
 * UI só atualiza depois que o servidor confirma.
 */

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

function DepositForm({ plan, disabled, onInvest }: { plan: BankPlan; disabled: boolean; onInvest: (amount: number) => void }) {
  const [amount, setAmount] = useState(String(plan.minAmount));
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= plan.minAmount && parsed <= plan.maxAmount;
  const gain = valid ? projectGain(parsed, plan.rateBps) : 0;
  const tax = valid ? projectTax(parsed, plan.rateBps, plan.taxBps) : 0;
  const net = valid ? projectNet(parsed, plan.rateBps, plan.taxBps) : null;

  return (
    <RPGPanel variant="gold" title={plan.label} icon={<Vault size={15} />} className="h-full">
      <p className="text-xs text-rpg-muted mb-3">{plan.flavor}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <RPGBadge tone="gold">+{formatPct(plan.rateBps)}% bruto</RPGBadge>
        <RPGBadge tone="blue">{plan.termDays} dia{plan.termDays > 1 ? "s" : ""}</RPGBadge>
        <RPGBadge tone="red">IR {formatPct(plan.taxBps)}%</RPGBadge>
        <RPGBadge tone="muted">{formatCoins(plan.minAmount)}–{formatCoins(plan.maxAmount)} moedas</RPGBadge>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onInvest(parsed);
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
    </RPGPanel>
  );
}

function DepositRow({ deposit, onClaim, claiming }: { deposit: BankDeposit; onClaim?: () => void; claiming?: boolean }) {
  const totalMs = new Date(deposit.maturesAt).getTime() - new Date(deposit.createdAt).getTime();
  const elapsedMs = Date.now() - new Date(deposit.createdAt).getTime();
  const pct = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 100;
  const tax = deposit.payout - deposit.netPayout;

  return (
    <div className="rpg-panel p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="font-rpg font-semibold text-sm text-rpg-text truncate">{deposit.planLabel}</p>
        <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
          {formatCoins(deposit.amount)} → {formatCoins(deposit.netPayout)}
        </span>
      </div>
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
        <RPGProgressBar tone="purple" label={`${daysLeft(deposit.maturesAt)} dia(s) restante(s)`} value={pct} valueLabel={`${Math.round(pct)}%`} />
      )}
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.amount > 0;
  return (
    <li className="flex items-center justify-between gap-3 py-2 border-b border-rpg-border/40 last:border-0">
      <div className="min-w-0 flex items-center gap-2">
        {positive ? (
          <TrendingUp size={14} className="text-rpg-green shrink-0" aria-hidden />
        ) : (
          <TrendingDown size={14} className="text-rpg-red shrink-0" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-sm text-rpg-text truncate">{entry.label ?? entry.eventType}</p>
          <p className="text-[10.5px] text-rpg-muted">{formatWhen(entry.createdAt)}</p>
        </div>
      </div>
      <span className={`font-pixel text-[12px] font-semibold shrink-0 ${positive ? "text-rpg-green" : "text-rpg-red"}`}>
        {positive ? "+" : ""}
        {formatCoins(entry.amount)}
      </span>
    </li>
  );
}

function ExtratoView() {
  const { entries, isLoading, hasMore, loadMore, isFetching } = useBankLedger();

  if (isLoading) return <p className="text-sm text-rpg-muted">Carregando extrato…</p>;
  if (entries.length === 0) {
    return <p className="text-sm text-rpg-muted">Nenhuma movimentação de moedas ainda. Complete missões e contratos para começar a ganhar.</p>;
  }
  return (
    <RPGPanel title="Extrato de moedas" icon={<Receipt size={16} />}>
      <p className="text-xs text-rpg-muted mb-2">Todo ganho e gasto de moedas do jogo — missões, loja, Tesouro e Banco juntos, mais recente primeiro.</p>
      <ul>
        {entries.map((e) => (
          <LedgerRow key={e.id} entry={e} />
        ))}
      </ul>
      {hasMore && (
        <div className="pt-3 flex justify-center">
          <RPGButton type="button" variant="ghost" disabled={isFetching} onClick={loadMore}>
            {isFetching ? "Carregando…" : "Carregar mais"}
          </RPGButton>
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
      <p className="text-xs text-rpg-muted mb-3">Compare os 3 planos para a mesma quantia antes de decidir onde investir — sem comprometer moeda nenhuma.</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {plans.map((plan) => {
            const inRange = parsed >= plan.minAmount && parsed <= plan.maxAmount;
            const net = projectNet(parsed, plan.rateBps, plan.taxBps);
            const tax = projectTax(parsed, plan.rateBps, plan.taxBps);
            return (
              <div key={plan.id} className="rpg-panel p-3">
                <p className="font-rpg font-semibold text-sm text-rpg-text mb-1 truncate">{plan.label}</p>
                {inRange ? (
                  <dl className="text-[11px] space-y-0.5">
                    <div className="flex justify-between"><dt className="text-rpg-muted">Prazo</dt><dd>{plan.termDays} dia{plan.termDays > 1 ? "s" : ""}</dd></div>
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

function CreditoView({
  credit,
  loan,
  onRequest,
  onRepay,
  requesting,
  repaying,
}: {
  credit: CreditInfo;
  loan: { active: BankLoan | null; history: BankLoan[] };
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

  return (
    <>
      <RPGPanel title="Score de crédito" icon={<ShieldCheck size={16} />} className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-pixel text-2xl font-bold text-rpg-text tabular-nums">{credit.score}</span>
            <RPGBadge tone={tierTone(credit.tier.label)}>{credit.tier.label}</RPGBadge>
          </div>
          <p className="text-[11px] text-rpg-muted text-right">
            Limite atual: <strong className="text-rpg-text">{formatCoins(credit.tier.maxAmount)} moedas</strong> · juros {formatPct(credit.tier.rateBps)}%
          </p>
        </div>
        <RPGProgressBar tone={tierTone(credit.tier.label)} label="Score" value={scorePct} valueLabel={`${credit.scoreMin}–${credit.scoreMax}`} />
        <p className="mt-2 text-[11px] text-rpg-muted">
          Sobe quando você conclui investimentos e paga empréstimos em dia. Cai quando paga atrasado ou deixa um empréstimo vencer sem quitar.
        </p>
      </RPGPanel>

      {loan.active ? (
        <RPGPanel variant={loan.active.overdue ? "danger" : "quest"} title="Empréstimo ativo" icon={<HandCoins size={16} />} className="mb-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm text-rpg-text">Pegou emprestado</span>
            <span className="font-pixel text-sm text-rpg-gold-light">{formatCoins(loan.active.amount)} moedas</span>
          </div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm text-rpg-text">Total a pagar</span>
            <span className="font-pixel text-sm text-rpg-text">
              {formatCoins(loan.active.overdue ? loan.active.totalDue + projectLateFee(loan.active.totalDue, loan.active.lateFeeBps) : loan.active.totalDue)}
              {loan.active.overdue && (
                <span className="text-rpg-red"> (com multa de {formatPct(loan.active.lateFeeBps)}%)</span>
              )}
            </span>
          </div>
          {loan.active.overdue ? (
            <p className="flex items-center gap-1.5 text-xs text-rpg-red mb-3">
              <AlertTriangle size={13} aria-hidden /> Atrasado há {daysOverdue(loan.active.dueAt)} dia(s) — pagar agora já evita mais queda no score.
            </p>
          ) : (
            <p className="text-xs text-rpg-muted mb-3">Vence em {daysLeft(loan.active.dueAt)} dia(s).</p>
          )}
          <RPGButton type="button" variant={loan.active.overdue ? "danger" : "success"} className="w-full" disabled={repaying} onClick={() => onRepay(loan.active!.id)}>
            {repaying ? "Quitando…" : "Quitar empréstimo"}
          </RPGButton>
        </RPGPanel>
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

export function BancoPage() {
  const { summary, isLoading, deposit, claim, requestLoan, repayLoan } = useBank();
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [view, setView] = useState<"investir" | "credito" | "extrato">("investir");

  const handleInvest = (plan: BankPlan, amount: number) => {
    deposit.mutate(
      { planId: plan.id, amount },
      {
        onSuccess: () => {
          setToastTone("success");
          setToast(`Investido ${formatCoins(amount)} moedas no ${plan.label}.`);
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
      },
      onError: (err) => {
        setToastTone("error");
        setToast(err instanceof Error ? err.message : "Não foi possível resgatar.");
      },
      onSettled: () => setPendingClaimId(null),
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
        actions={<RPGWallet coins={summary?.balance} />}
        className="mb-5"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <RPGStatCard icon={<Coins size={18} />} label="Saldo disponível" value={isLoading ? "…" : formatCoins(summary?.balance ?? 0)} tone="gold" />
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
          caption="moedas de bônus já resgatadas, após imposto"
        />
        <RPGStatCard
          icon={<Percent size={18} />}
          label="Imposto pago"
          value={isLoading ? "…" : formatCoins(summary?.totals.taxPaid ?? 0)}
          tone="red"
          caption="descontado do rendimento, nunca do principal"
        />
        <RPGStatCard
          icon={<ShieldCheck size={18} />}
          label="Score de crédito"
          value={isLoading ? "…" : String(summary?.credit.score ?? "—")}
          tone={summary ? tierTone(summary.credit.tier.label) : "muted"}
          caption={summary?.credit.tier.label}
        />
      </div>

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
                <DepositForm key={plan.id} plan={plan} disabled={deposit.isPending} onInvest={(amount) => handleInvest(plan, amount)} />
              ))}
            </div>
          </RPGPanel>

          <RPGPanel title="Investimentos em andamento" icon={<Coins size={16} />} className="mb-5">
            {!summary || summary.active.length === 0 ? (
              <p className="text-sm text-rpg-muted">Nenhum investimento em andamento. Escolha um plano acima para começar.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {summary.active.map((d) => (
                  <DepositRow key={d.id} deposit={d} />
                ))}
              </div>
            )}
          </RPGPanel>

          {summary && summary.history.length > 0 && (
            <RPGPanel title="Histórico de resgates" icon={<Coins size={16} />}>
              <ul className="space-y-1.5">
                {summary.history.slice(0, 10).map((d) => {
                  const tax = d.payout - d.netPayout;
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-rpg-text">{d.planLabel}</span>
                      <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
                        {formatCoins(d.amount)} → {formatCoins(d.netPayout)}
                        {tax > 0 ? ` (IR −${formatCoins(tax)})` : ""}
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
          onRequest={handleRequestLoan}
          onRepay={handleRepayLoan}
          requesting={requestLoan.isPending}
          repaying={repayLoan.isPending}
        />
      )}

      {view === "extrato" && <ExtratoView />}

      <RPGToast message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </div>
  );
}
