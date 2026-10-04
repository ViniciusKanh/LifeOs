import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryService, type InventoryHistoryType } from "@/services/inventoryService";

const KEY = ["inventory"] as const;

/** Coleção / Inventário: leitura + ações. A UI só muda depois que o servidor confirma. */
export function useInventory() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: inventoryService.get, staleTime: 15_000 });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    // Usar cupom mexe no Tesouro; equipar mexe no Perfil; efeitos mexem no XP futuro.
    void qc.invalidateQueries({ queryKey: ["gamification"] });
  };
  const use = useMutation({ mutationFn: ({ key, requestId }: { key: string; requestId: string }) => inventoryService.use(key, requestId), onSuccess: refresh });
  const equip = useMutation({
    mutationFn: ({ key, equip }: { key: string; equip: boolean }) => inventoryService.equip(key, equip),
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
  const flags = useMutation({ mutationFn: ({ key, ...f }: { key: string; favorite?: boolean; archived?: boolean }) => inventoryService.flags(key, f), onSuccess: refresh });
  return { ...query, use, equip, flags };
}

export function useInventoryHistory(type: InventoryHistoryType | undefined, enabled: boolean) {
  return useQuery({ queryKey: [...KEY, "history", type ?? "all"], queryFn: () => inventoryService.history(type), enabled });
}
