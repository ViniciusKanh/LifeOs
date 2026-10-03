import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contractsService, type ContractInput, type ContractTaskInput } from "@/services/contractsService";
import { notifyGamification } from "@/services/gamificationService";

const KEY = ["contracts"] as const;

/**
 * Contratos e suas tarefas. Qualquer mudança invalida também as tarefas e
 * a gamificação (concluir pelo contrato rende XP real no backend).
 */
export function useContracts(enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: contractsService.list, enabled });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const create = useMutation({ mutationFn: (input: ContractInput) => contractsService.create(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof contractsService.update>[1] }) => contractsService.update(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, deleteOpenTasks }: { id: string; deleteOpenTasks: boolean }) => contractsService.remove(id, deleteOpenTasks),
    onSuccess: invalidate,
  });
  const addTasks = useMutation({
    mutationFn: ({ id, tasks }: { id: string; tasks: ContractTaskInput[] }) => contractsService.addTasks(id, tasks),
    onSuccess: invalidate,
  });

  return { ...query, contracts: query.data ?? [], create, update, remove, addTasks };
}

export function useContractDetail(id: string | null) {
  return useQuery({ queryKey: [...KEY, "detail", id], queryFn: () => contractsService.get(id!), enabled: !!id });
}

export function useContractAI() {
  const propose = useMutation({ mutationFn: contractsService.propose });
  const proposeTasks = useMutation({ mutationFn: ({ id, hint }: { id: string; hint?: string }) => contractsService.proposeTasks(id, hint) });
  return { propose, proposeTasks };
}

/** Após concluir uma tarefa pelo contrato: recarrega contrato e dispara o feedback de XP. */
export function useContractRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    notifyGamification();
  };
}
