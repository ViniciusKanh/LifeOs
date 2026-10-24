import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bankService } from "@/services/bankService";
import { notifyGamification } from "@/services/gamificationService";

const KEY = ["bank"] as const;

/** Tela Banco: saldo, planos, investimentos ativos/prontos para resgate e histórico. */
export function useBank() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: bankService.summary, staleTime: 15_000 });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: KEY });
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

  return { ...query, summary: query.data ?? null, deposit, claim };
}
