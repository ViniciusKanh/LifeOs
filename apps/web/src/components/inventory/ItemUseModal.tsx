import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { ActiveEffect, InventoryItem } from "@/services/inventoryService";
import { ITEM_RARITY, itemArtUrl } from "@/utils/inventoryDisplay";
import { newRequestId } from "@/utils/requestId";

/**
 * Confirmação de uso: mostra efeito, duração, quantidade antes/depois e
 * efeito igual já ativo (que é estendido, nunca somado). O consumo real
 * acontece no servidor, com requestId para não repetir em clique duplo.
 */
export function ItemUseModal({ item, effects, onClose, onConfirm }: { item: InventoryItem | null; effects: ActiveEffect[]; onClose: () => void; onConfirm: (item: InventoryItem, requestId: string) => Promise<void> }) {
  const [requestId, setRequestId] = useState(newRequestId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (item) {
      setRequestId(newRequestId());
      setError(null);
      setPending(false);
    }
  }, [item]);
  if (!item) return <Modal open={false} onClose={onClose} title="Usar item">{null}</Modal>;
  const conflict = effects.find((e) => e.itemKey === item.key);
  const isVoucher = item.type === "reward";

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(item, requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível usar o item.");
      setPending(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={pending ? () => undefined : onClose}
      title={`Usar ${item.name}?`}
      footer={
        <>
          <RPGButton variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </RPGButton>
          <RPGButton variant="primary" onClick={confirm} disabled={pending}>
            {pending ? "Usando…" : "Usar item"}
          </RPGButton>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden className="pixelated w-24 h-[60px] object-cover border-2 border-rpg-bronze shrink-0" style={{ borderRadius: 3 }} />
          <div className="min-w-0">
            <RPGBadge tone={ITEM_RARITY[item.rarity].tone}>{ITEM_RARITY[item.rarity].label}</RPGBadge>
            <p className="mt-1 font-rpg font-bold text-rpg-text">{item.name}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-rpg-muted">{isVoucher ? "Recompensa" : "Ativará"}</dt>
          <dd className="text-rpg-green">{item.effectText ?? "—"}</dd>
          {item.durationText && (
            <>
              <dt className="text-rpg-muted">Duração</dt>
              <dd className="text-rpg-text">{item.durationText}</dd>
            </>
          )}
          <dt className="text-rpg-muted">Quantidade</dt>
          <dd className="font-pixel text-rpg-gold-light">
            {item.quantity} → {item.quantity - 1}
          </dd>
        </dl>
        {conflict && (
          <p className="text-xs text-rpg-orange border border-rpg-orange/50 bg-rpg-orange/10 px-2 py-1.5" style={{ borderRadius: 3 }}>
            Já existe um efeito igual ativo. Efeitos iguais não somam porcentagem: o servidor estende a duração (com limite) ou recusa o uso.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-rpg-red">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
