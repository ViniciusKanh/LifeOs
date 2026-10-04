import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { InventoryItem } from "@/services/inventoryService";
import { ITEM_RARITY, itemArtUrl } from "@/utils/inventoryDisplay";

const SLOT: Record<string, string> = { title: "Título", frame: "Moldura", emblem: "Emblema" };

/** Equipar/remover cosmético: cada espaço do Perfil aceita um item; o atual é substituído. */
export function ItemEquipModal({
  item,
  equip,
  currentName,
  onClose,
  onConfirm,
}: {
  item: InventoryItem | null;
  equip: boolean;
  currentName: string | null;
  onClose: () => void;
  onConfirm: (item: InventoryItem, equip: boolean) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!item) return <Modal open={false} onClose={onClose} title="Equipar">{null}</Modal>;
  const slot = SLOT[item.key.split(":")[0] ?? ""] ?? "Cosmético";
  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(item, equip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar o perfil.");
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={equip ? `Equipar ${item.name}?` : `Remover ${item.name}?`}
      footer={
        <>
          <RPGButton variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </RPGButton>
          <RPGButton variant="primary" onClick={confirm} disabled={pending}>
            {pending ? "Salvando…" : equip ? "Equipar" : "Remover"}
          </RPGButton>
        </>
      }
    >
      <div className="flex items-start gap-3 text-sm">
        <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden className="pixelated w-24 h-[60px] object-cover border-2 border-rpg-bronze shrink-0" style={{ borderRadius: 3 }} />
        <div className="min-w-0 space-y-1">
          <RPGBadge tone={ITEM_RARITY[item.rarity].tone}>{ITEM_RARITY[item.rarity].label}</RPGBadge>
          <p className="text-rpg-text">
            Espaço do perfil: <strong>{slot}</strong>
          </p>
          {equip && currentName && currentName !== item.name && <p className="text-xs text-rpg-muted">Substitui: {currentName}</p>}
          <p className="text-xs text-rpg-muted">Cosméticos mudam só a aparência — sem bônus de jogo.</p>
          {error && (
            <p role="alert" className="text-xs text-rpg-red">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
