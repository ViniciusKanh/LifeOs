import { Check, Palette } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { RPG_AVATARS } from "@/components/rpg/rpgAssets";
import { RPGAvatar } from "@/components/rpg/RPGAvatar";


/**
 * Aparência no Perfil: escolha do personagem (o RPG é o tema único do app).
 * É preferência de interface — não muda nenhum dado nem regra. Na Ficha do
 * personagem a escolha fica no estúdio (hideAvatar).
 */
export function AppearanceCard({ hideAvatar = false }: { hideAvatar?: boolean } = {}) {
  const { avatarId, setAvatar } = useRpgAvatar();

  return (
    <Card className="p-5 md:p-6" id="aparencia">
      <div className="flex items-center gap-2.5 mb-4">
        <IconBadge tone="purple" size={32} icon={<Palette size={15} />} />
        <div>
          <p className="text-sm font-semibold">Aparência</p>
          <p className="text-xs text-slate">Escolha o seu personagem.</p>
        </div>
      </div>

      {!hideAvatar && (<>
      <p className="text-xs font-semibold text-slate mb-1">Personagem</p>
      <p className="text-[11px] text-slate mb-2">Aparece no cabeçalho, no Painel do Herói e no Hoje. É só visual.</p>
      <div role="radiogroup" aria-label="Personagem" className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {RPG_AVATARS.map((a) => {
          const selected = a.id === avatarId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setAvatar(a.id)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-500/10 rpg:border-rpg-gold rpg:bg-rpg-gold/10"
                  : "border-paper-border dark:border-ink-border hover:border-brand-500/50 rpg:hover:border-rpg-gold/50"
              }`}
            >
              <RPGAvatar avatarId={a.id} size="md" frame={selected ? "gold" : "bronze"} alt="" />
              <span className="text-[11px] font-semibold truncate max-w-full">{a.label}</span>
              {selected && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-600 rpg:bg-rpg-gold text-white rpg:text-rpg-ink flex items-center justify-center" aria-hidden>
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      </>)}
    </Card>
  );
}
