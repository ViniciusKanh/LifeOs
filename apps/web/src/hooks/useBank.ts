import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bankService } from "@/services/bankService";
import { notifyGamification } from "@/services/gamificationService";

const KEY = ["bank"] as const;
const LEDGER_PAGE = 40;

/** Tela Banco: saldo, planos, investimentos, crédito/empréstimo e histórico. */
export function useBank() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: bankService.summary, staleTime: 15_000 });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: [...KEY, "ledger"] });
    notifyGamification(); // saldo de moedas mudou -- atualiza o HUD em qualquer tela.
  };

  const deposit = useMutation({
    mutationFn: ({ planId, amount }: { planId: string; amount: number }) => bankService.deposit(planId, amount),
    onSuccess: invalidate,
  });
  const claim = useMutation({
    mutationFn: (depositId: string) => bankService.claim(depositId),
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

  return { ...query, summary: query.data ?? null, deposit, claim, requestLoan, repayLoan };
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
