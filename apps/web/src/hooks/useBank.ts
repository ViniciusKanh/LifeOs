import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bankService, type AutoInvestRule } from "@/services/bankService";
import { triggerAchievementsCheck } from "@/services/achievementsService";

const KEY = ["bank"] as const;
const LEDGER_PAGE = 40;

/** Tela Banco: saldo, planos, investimentos, crédito/empréstimo e histórico. */
export function useBank() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: bankService.summary, staleTime: 15_000 });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: [...KEY, "ledger"] });
    // Saldo de moedas mudou (atualiza o HUD) e resgate/quitação podem destravar uma conquista do Banco.
    triggerAchievementsCheck();
  };

  const deposit = useMutation({
    mutationFn: ({ planId, amount }: { planId: string; amount: number }) => bankService.deposit(planId, amount),
    onSuccess: invalidate,
  });
  const claim = useMutation({
    mutationFn: (depositId: string) => bankService.claim(depositId),
    onSuccess: invalidate,
  });
  const claimEarly = useMutation({
    mutationFn: (depositId: string) => bankService.claimEarly(depositId),
    onSuccess: invalidate,
  });
  const requestLoan = useMutation({
    mutationFn: (amount: number) => bankService.requestLoan(amount),
    onSuccess: invalidate,
  });
  const repayLoan = useMutation({
    mutationFn: (loanId: string) => bankService.repayLoan(loanId),
    onSuccess: invalidate,
  });
  const updateAutoInvest = useMutation({
    mutationFn: (input: AutoInvestRule) => bankService.updateAutoInvest(input),
    onSuccess: invalidate,
  });

  return { ...query, summary: query.data ?? null, deposit, claim, claimEarly, requestLoan, repayLoan, updateAutoInvest };
}

/**
 * Contador de pendências do Banco, usado no badge do menu (Sidebar/Drawer).
 * Conta investimentos prontos para resgate + 1 se houver empréstimo em atraso.
 * Compartilha a mesma queryKey do resumo (cache único, sem requisição extra).
 */
export function useBankPendingCount(): number {
  const query = useQuery({ queryKey: KEY, queryFn: bankService.summary, staleTime: 30_000 });
  const summary = query.data;
  if (!summary) return 0;
  return summary.claimable.length + (summary.loan.active?.overdue ? 1 : 0);
}

/** Evolução do Banco (saldo + score de crédito) para o card de histórico. */
export function useBankHistory(days = 60) {
  const query = useQuery({
    queryKey: [...KEY, "history", days],
    queryFn: () => bankService.history(days),
    staleTime: 60_000,
  });
  return { ...query, points: query.data?.points ?? [] };
}

/** Extrato de rendimentos: ganho, imposto e juros/multa agregados por mês. */
export function useBankStatement(months = 12) {
  const query = useQuery({
    queryKey: [...KEY, "statement", months],
    queryFn: () => bankService.statement(months),
    staleTime: 60_000,
  });
  return { ...query, months: query.data?.months ?? [] };
}

/** Extrato do Banco: todo movimento real de moedas (ganhos e gastos), com "carregar mais". */
export function useBankLedger() {
  const [limit, setLimit] = useState(LEDGER_PAGE);
  const query = useQuery({
    queryKey: [...KEY, "ledger", limit],
    queryFn: () => bankService.ledger(limit),
    staleTime: 15_000,
  });
  const entries = query.data?.entries ?? [];
  const hasMore = entries.length >= limit;
  return { ...query, entries, hasMore, loadMore: () => setLimit((v) => v + LEDGER_PAGE) };
}
