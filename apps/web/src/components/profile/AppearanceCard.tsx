import { Check, Monitor, Moon, Palette, Sun, Swords } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { THEME_LABEL, useTheme, type ThemeMode } from "@/hooks/useTheme";
import { useRpgAvatar } from "@/hooks/useRpgAvatar";
import { RPG_AVATARS } from "@/components/rpg/rpgAssets";
import { RPGAvatar } from "@/components/rpg/RPGAvatar";

const THEME_OPTIONS: Array<{ mode: ThemeMode; icon: JSX.Element; hint: string }> = [
  { mode: "light", icon: <Sun size={16} />, hint: "Visual clássico, fundo claro" },
  { mode: "dark", icon: <Moon size={16} />, hint: "Visual clássico, fundo escuro" },
  { mode: "system", icon: <Monitor size={16} />, hint: "Segue o tema do aparelho" },
  { mode: "rpg", icon: <Swords size={16} />, hint: "Pixel art, painéis e personagem" },
];

/**
 * Aparência no Perfil: escolha do tema (Claro/Escuro/Automático/RPG) e do
 * personagem do tema RPG. São preferências de interface — não mudam nenhum
 * dado nem regra do app. No tema RPG, o personagem é escolhido no estúdio da
 * Ficha do personagem (hideAvatar).
 */
export function AppearanceCard({ hideAvatar = false }: { hideAvatar?: boolean } = {}) {
  const { mode, setMode } = useTheme();
  const { avatarId, setAvatar } = useRpgAvatar();

  return (
    <Card className="p-5 md:p-6" id="aparencia">
      <div className="flex items-center gap-2.5 mb-4">
        <IconBadge tone="purple" size={32} icon={<Palette size={15} />} />
        <div>
          <p className="text-sm font-semibold">Aparência</p>
          <p className="text-xs text-slate">Escolha o tema do LifeOS e o seu personagem.</p>
        </div>
      </div>

      <p className="text-xs font-semibold text-slate mb-2">Tema</p>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
        {THEME_OPTIONS.map((o) => {
          const selected = mode === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setMode(o.mode)}
              className={`relative flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                selected
                  ? "border-brand-500 bg-brand-500/10 rpg:border-rpg-gold rpg:bg-rpg-gold/10"
                  : "border-paper-border dark:border-ink-border hover:border-brand-500/50 rpg:hover:border-rpg-gold/50"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {o.icon} {THEME_LABEL[o.mode]}
              </span>
              <span className="text-[11px] text-slate leading-snug">{o.hint}</span>
              {selected && <Check size={14} className="absolute top-2 right-2 text-brand-600 rpg:text-rpg-gold-light" aria-hidden />}
            </button>
          );
        })}
      </div>

      {!hideAvatar && (<>
      <p className="text-xs font-semibold text-slate mb-1">Personagem</p>
      <p className="text-[11px] text-slate mb-2">Aparece no tema RPG (cabeçalho, Dashboard, Hoje). É só visual.</p>
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
