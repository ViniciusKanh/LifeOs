import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Backpack, X } from "lucide-react";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { InventoryRecent } from "@/services/inventoryService";
import { ITEM_RARITY, itemArtUrl } from "@/utils/inventoryDisplay";

/** Aviso curto de "NOVO ITEM" (só aparece para aquisições ainda não vistas neste navegador). */
export function NewItemOverlay({ item, onView, onClose }: { item: InventoryRecent | null; onView: (key: string) => void; onClose: () => void }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-24 right-4 left-4 sm:left-auto sm:w-80 z-40 rpg-panel rpg-panel-gold p-3 shadow-2xl"
        >
          <button type="button" onClick={onClose} aria-label="Fechar aviso" className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center text-rpg-muted hover:text-rpg-text">
            <X size={14} />
          </button>
          <p className="flex items-center gap-1.5 font-pixel text-[11px] uppercase tracking-[0.18em] text-rpg-gold">
            <Backpack size={13} aria-hidden /> Novo item
          </p>
          <div className="mt-2 flex items-center gap-3">
            <img src={itemArtUrl(item.art, item.artSet)} alt="" aria-hidden className="pixelated w-16 h-16 object-cover border-2 border-rpg-gold shrink-0" style={{ borderRadius: 3 }} />
            <div className="min-w-0">
              <p className="font-rpg font-bold text-rpg-text leading-tight">{item.name}</p>
              <RPGBadge tone={ITEM_RARITY[item.rarity].tone}>{ITEM_RARITY[item.rarity].label}</RPGBadge>
              {item.label && <p className="mt-1 text-[11px] text-rpg-muted line-clamp-2">Origem: {item.label}</p>}
            </div>
          </div>
          <RPGButton variant="primary" className="mt-3 w-full justify-center" onClick={() => onView(item.key)}>
            Ver item
          </RPGButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
