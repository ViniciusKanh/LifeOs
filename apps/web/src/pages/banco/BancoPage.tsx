import { useState } from "react";
import { Clock, Coins, PiggyBank, Sparkles, TrendingUp, Vault } from "lucide-react";
import { RPGBadge, RPGButton, RPGPageHeader, RPGPanel, RPGProgressBar, RPGStatCard, RPGToast, RPGWallet } from "@/components/rpg";
import { useBank } from "@/hooks/useBank";
import type { BankDeposit, BankPlan } from "@/services/bankService";

/**
 * Banco: investir moedas ganhas em missões/contratos em planos de prazo
 * fixo (config/bank.ts no backend). Sem risco, sem sorte, sem dinheiro
 * real -- é a mesma moeda gastável no Tesouro, só que rendendo enquanto
 * espera. Saldo e investimentos vêm sempre do backend (useBank); a UI só
 * atualiza depois que o servidor confirma o débito/crédito.
 */

function formatCoins(n: number) {
  return n.toLocaleString("pt-BR");
}

function daysLeft(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function projectedPayout(amount: number, rateBps: number) {
  return amount + Math.floor((amount * rateBps) / 10_000);
}

function DepositForm({ plan, disabled, onInvest }: { plan: BankPlan; disabled: boolean; onInvest: (amount: number) => void }) {
  const [amount, setAmount] = useState(String(plan.minAmount));
  const parsed = Number(amount);
  const valid = Number.isInteger(parsed) && parsed >= plan.minAmount && parsed <= plan.maxAmount;
  const payout = valid ? projectedPayout(parsed, plan.rateBps) : null;

  return (
    <RPGPanel variant="gold" title={plan.label} icon={<Vault size={15} />} className="h-full">
      <p className="text-xs text-rpg-muted mb-3">{plan.flavor}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <RPGBadge tone="gold">+{(plan.rateBps / 100).toLocaleString("pt-BR")}%</RPGBadge>
        <RPGBadge tone="blue">{plan.termDays} dia{plan.termDays > 1 ? "s" : ""}</RPGBadge>
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
      <p className="mt-2 text-[11px] text-rpg-muted min-h-[1.2em]">
        {valid && payout != null ? (
          <>
            Em {plan.termDays} dia{plan.termDays > 1 ? "s" : ""}: <strong className="text-rpg-gold-light">{formatCoins(payout)}</strong> moedas (+{formatCoins(payout - parsed)})
          </>
        ) : (
          `Mínimo ${formatCoins(plan.minAmount)}, máximo ${formatCoins(plan.maxAmount)} moedas.`
        )}
      </p>
    </RPGPanel>
  );
}

function DepositRow({ deposit, onClaim, claiming }: { deposit: BankDeposit; onClaim?: () => void; claiming?: boolean }) {
  const totalMs = new Date(deposit.maturesAt).getTime() - new Date(deposit.createdAt).getTime();
  const elapsedMs = Date.now() - new Date(deposit.createdAt).getTime();
  const pct = totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 100;

  return (
    <div className="rpg-panel p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-rpg font-semibold text-sm text-rpg-text truncate">{deposit.planLabel}</p>
        <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
          {formatCoins(deposit.amount)} → {formatCoins(deposit.payout)}
        </span>
      </div>
      {onClaim ? (
        <RPGButton type="button" variant="success" className="w-full" disabled={claiming} onClick={onClaim}>
          {claiming ? "Resgatando…" : `Resgatar +${formatCoins(deposit.payout)} moedas`}
        </RPGButton>
      ) : (
        <RPGProgressBar tone="purple" label={`${daysLeft(deposit.maturesAt)} dia(s) restante(s)`} value={pct} valueLabel={`${Math.round(pct)}%`} />
      )}
    </div>
  );
}

export function BancoPage() {
  const { summary, isLoading, deposit, claim } = useBank();
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);

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
        setToast(`Resgatado: +${formatCoins(res.payout)} moedas do ${d.planLabel}.`);
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
        subtitle="Invista as moedas ganhas em missões e contratos em planos de prazo fixo — sem risco, sem sorte. Moeda do jogo, nunca dinheiro real."
        actions={<RPGWallet coins={summary?.balance} />}
        className="mb-5"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
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
          label="Ganho total"
          value={isLoading ? "…" : formatCoins(summary?.totals.earned ?? 0)}
          tone="blue"
          caption="moedas de bônus já resgatadas"
        />
      </div>

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

      <RPGPanel title="Investimentos em andamento" icon={<Clock size={16} />} className="mb-5">
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
            {summary.history.slice(0, 10).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-rpg-text">{d.planLabel}</span>
                <span className="font-pixel text-[11px] text-rpg-gold-light shrink-0">
                  {formatCoins(d.amount)} → {formatCoins(d.payout)}
                  {d.claimedAt ? ` · ${new Date(d.claimedAt).toLocaleDateString("pt-BR")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </RPGPanel>
      )}

      <RPGToast message={toast} tone={toastTone} onClose={() => setToast(null)} />
    </div>
  );
}
