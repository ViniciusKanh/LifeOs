import { useState } from "react";
import { Coins, Landmark, Percent, PiggyBank, Receipt, Sparkles, TrendingDown, TrendingUp, Vault } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGStatCard, RPGTabs, RPGToast, RPGWallet } from "@/components/rpg";
import { useBank, useBankLedger } from "@/hooks/useBank";
import { formatWhen } from "@/utils/treasureDisplay";
import type { BankDeposit, BankPlan, LedgerEntry } from "@/services/bankService";

/**
 * Banco: tela única e dedicada para administrar as moedas ganhas em
 * missões/contratos -- igual a um banco de verdade, mas gamificado: você
 * investe em planos de prazo fixo, o rendimento sofre imposto sobre o
 * ganho (tabela regressiva: quanto mais tempo deixa parado, menor a
 * alíquota) e o extrato mostra todo ganho e gasto de moedas, não só do
 * Banco. Nunca é dinheiro real -- é a mesma moeda gastável no Tesouro, só
 * que rendendo enquanto espera. Saldo, investimentos e extrato vêm sempre
 * do backend; a UI só atualiza depois que o servidor confirma.
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

// Mesma fórmula do backend (config/bank.ts): ganho e imposto arredondados sempre para baixo.
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

export function BancoPage() {
  const { summary, isLoading, deposit, claim } = useBank();
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [view, setView] = useState<"investir" | "extrato">("investir");

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

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 w-full">
      <RPGPageHeader
        banner="loja"
        size="md"
        eyebrow="Economia da Guilda"
        title="Banco"
        subtitle="Invista, acompanhe o rendimento com imposto sobre o ganho e veja o extrato completo de moedas — tudo numa tela só. Moeda do jogo, nunca dinheiro real."
        actions={<RPGWallet coins={summary?.balance} />}
        className="mb-5"
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
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
      </div>

      <div className="mb-5">
        <RPGTabs
          label="Seção do Banco"
          value={view}
          onChange={setView}
          tabs={[
            { value: "investir", label: "Investir", icon: <Landmark size={14} /> },
            { value: "extrato", label: "Extrato (gastos e ganhos)", icon: <Receipt size={14} /> },
          ]}
        />
      </div>

      {view === "investir" ? (
        <>
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
      ) : (
        <ExtratoView />
      )}

      <RPGToast message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </div>
  );
}
