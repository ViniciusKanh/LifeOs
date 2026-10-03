import { Hammer, Plus } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { CAMPAIGN_FORGE_BANNER } from "@/utils/campaignDisplay";

/**
 * Banner da Forja: forja e ferreiro à esquerda (arte pixel), título ao
 * centro e castelo ao luar à direita. No celular a arte encolhe e a frase
 * lateral some — o título e a ação continuam.
 */
export function CampaignForgeHero({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden min-h-[148px] md:min-h-[176px]">
      <img
        src={CAMPAIGN_FORGE_BANNER}
        alt=""
        aria-hidden
        decoding="async"
        className="pixelated absolute inset-0 w-full h-full object-cover object-left md:object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg/30 via-rpg-bg/75 to-rpg-bg/35 md:from-transparent md:via-rpg-bg/70 md:to-rpg-bg/20" aria-hidden />
      <div className="relative grid gap-4 p-4 sm:p-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_auto] md:items-center">
        <div className="hidden md:block" aria-hidden />
        <div className="min-w-0">
          <h1 className="rpg-title flex items-center gap-2 text-2xl sm:text-4xl font-bold leading-tight">
            <Hammer className="shrink-0 text-rpg-gold-light" size={30} aria-hidden /> Forja de Campanhas
          </h1>
          <p className="mt-1 text-sm sm:text-base text-rpg-text">Transforme grandes objetivos em campanhas épicas.</p>
          <p className="hidden sm:block mt-0.5 text-xs sm:text-sm italic text-rpg-text/75">Una projetos, missões e hábitos em jornadas com propósito.</p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-3">
          <p className="hidden lg:block max-w-[220px] text-right text-sm italic text-rpg-text/80">&ldquo;Grandes conquistas nascem de muitas pequenas vitórias.&rdquo;</p>
          <RPGButton variant="primary" className="!px-5 !py-2.5 text-base" onClick={onCreate}>
            <Plus size={16} aria-hidden /> Nova campanha
          </RPGButton>
        </div>
      </div>
    </header>
  );
}
