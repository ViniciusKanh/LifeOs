import { Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { RPG_AVATARS } from "./rpgAssets";
import { RPGAvatar } from "./RPGAvatar";

/** "Escolha seu personagem" — grade de retratos; a escolha é só visual. */
export function RPGAvatarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { avatarId, setAvatar } = useRpgAvatar();
  return (
    <Modal open={open} onClose={onClose} title="Escolha seu personagem" size="md">
      <p className="text-xs text-slate mb-3">O personagem é só a sua aparência no tema RPG — não muda nenhuma regra ou dado.</p>
      <div role="radiogroup" aria-label="Personagens" className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {RPG_AVATARS.map((a) => {
          const selected = a.id === avatarId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setAvatar(a.id);
                onClose();
              }}
              className={`relative flex flex-col items-center gap-2 p-2.5 border-2 transition-colors ${selected ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border hover:border-rpg-gold/60 bg-rpg-bg/40"}`}
              style={{ borderRadius: 4 }}
            >
              <RPGAvatar avatarId={a.id} size="lg" frame={selected ? "gold" : "bronze"} />
              <span className="font-pixel text-xs font-semibold text-rpg-text">{a.label}</span>
              {selected && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center bg-rpg-gold text-rpg-ink" style={{ borderRadius: 2 }} aria-hidden>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
