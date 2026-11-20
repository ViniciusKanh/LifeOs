import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, CreditCard, Loader2 } from "lucide-react";
import { bankService } from "@/services/bankService";
import { Button } from "@/components/ui/primitives";

const INPUT = "flex-1 min-w-[140px] rounded-lg px-3 py-2.5 text-sm bg-transparent outline-none border border-paper-border dark:border-ink-border";

/**
 * Banco nas Configurações: saldo de moedas e limite de crédito próprio.
 * - Saldo: o backend grava um lançamento de ajuste com a diferença (o extrato continua batendo).
 * - Crédito: limite fixo definido pelo usuário; vazio = volta ao limite pelo score.
 *   O crédito nunca usa o saldo — é um empréstimo dentro desse limite.
 */
export function BankSettingsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bank", "settings"], queryFn: bankService.settings });
  const [balance, setBalance] = useState("");
  const [limit, setLimit] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setBalance(String(q.data.balance));
    setLimit(q.data.creditLimit == null ? "" : String(q.data.creditLimit));
  }, [q.data]);

  const save = useMutation({
    mutationFn: bankService.updateSettings,
    onSuccess: (data) => {
      qc.setQueryData(["bank", "settings"], data);
      void qc.invalidateQueries({ queryKey: ["bank"] });
      void qc.invalidateQueries({ queryKey: ["gamification"] });
      setMsg({ text: "Banco atualizado." });
    },
    onError: (e: unknown) => setMsg({ text: e instanceof Error ? e.message : "Não foi possível salvar.", err: true }),
  });

  const parseInt0 = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

  const saveBalance = () => {
    const n = parseInt0(balance);
    if (Number.isNaN(n)) return setMsg({ text: "Informe o saldo como um número inteiro de moedas.", err: true });
    if (q.data && n === q.data.balance) return;
    if (!confirm(`Alterar o saldo de ${q.data?.balance ?? 0} para ${n} moedas? Um lançamento de ajuste será registrado no extrato.`)) return;
    save.mutate({ balance: n });
  };

  const saveLimit = () => {
    if (limit.trim() === "") return save.mutate({ creditLimit: null });
    const n = parseInt0(limit);
    if (Number.isNaN(n)) return setMsg({ text: "Informe o limite como um número inteiro de moedas.", err: true });
    save.mutate({ creditLimit: n });
  };

  if (q.isLoading) return <div className="h-24 animate-pulse rounded-lg bg-black/5 dark:bg-white/5" aria-busy="true" />;
  if (q.isError) return <p className="text-sm text-red-500">Não foi possível carregar o Banco.</p>;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="bank-balance" className="flex items-center gap-1.5 text-xs text-slate">
          <Coins size={13} aria-hidden /> Saldo de moedas
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input id="bank-balance" inputMode="numeric" value={balance} onChange={(e) => setBalance(e.target.value)} className={INPUT} />
          <Button variant="secondary" className="shrink-0" onClick={saveBalance} disabled={save.isPending}>
            Atualizar saldo
          </Button>
        </div>
      </div>
      <div>
        <label htmlFor="bank-limit" className="flex items-center gap-1.5 text-xs text-slate">
          <CreditCard size={13} aria-hidden /> Limite de crédito
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input id="bank-limit" inputMode="numeric" placeholder="Vazio = limite pelo score" value={limit} onChange={(e) => setLimit(e.target.value)} className={INPUT} />
          <Button variant="secondary" className="shrink-0" onClick={saveLimit} disabled={save.isPending}>
            Salvar limite
          </Button>
        </div>
        <p className="mt-1 text-[11px] text-slate">O crédito é um empréstimo dentro deste limite — não usa o seu saldo.</p>
      </div>
      {save.isPending && <Loader2 size={14} className="animate-spin text-slate" aria-label="Salvando" />}
      {msg && (
        <p role="status" className={`text-xs ${msg.err ? "text-red-500" : "text-emerald-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
