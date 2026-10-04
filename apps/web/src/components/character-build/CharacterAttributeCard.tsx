import { RPGPanel, RPGProgressBar } from "@/components/rpg";
import { RPG_TONE_TEXT } from "@/components/rpg/rpgAssets";
import type { BuildOverview } from "@/services/buildService";
import { ATTR_UI } from "@/utils/codexDisplay";

/** Atributos atuais (0–100) — mesmos atributos e cores do Códex. */
export function CharacterAttributeCard({ attributes, detailed = false }: { attributes: BuildOverview["attributes"]; detailed?: boolean }) {
  return (
    <RPGPanel title="Atributos atuais" variant="gold" className="h-full">
      <ul className="space-y-3">
        {attributes.map((a) => {
          const ui = ATTR_UI[a.key];
          return (
            <li key={a.key} className="grid grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2.5">
              <ui.icon size={22} className={RPG_TONE_TEXT[ui.tone]} aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-rpg-text">{a.label}</p>
                <RPGProgressBar value={a.score} tone={ui.tone} label={a.label} showLabel={false} className="mt-1" />
                {detailed && (
                  <p className="mt-1 text-[11px] text-rpg-muted">
                    {a.xp.toLocaleString("pt-BR")} XP em 30 dias · referência {a.referenceXp.toLocaleString("pt-BR")} XP = 100. {a.description}
                  </p>
                )}
              </div>
              <span className="font-rpg text-xl font-bold text-rpg-text tabular-nums text-right" aria-label={`${a.label}: ${a.score} de 100`}>
                {a.score}
              </span>
            </li>
          );
        })}
      </ul>
    </RPGPanel>
  );
}
