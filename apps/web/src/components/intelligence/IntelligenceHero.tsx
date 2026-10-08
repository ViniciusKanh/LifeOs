import { Brain, Plus } from "lucide-react";
import { RPGButton } from "@/components/rpg";
import { HERO_ART } from "@/utils/intelligenceDisplay";

/** Hero da Forja da Inteligência: forja arcana (pixel art) à esquerda, título ao centro e CTA. */
export function IntelligenceHero({ onNew }: { onNew: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative grid lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto] 2xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)_auto] items-stretch">
        <div className="relative h-28 sm:h-36 lg:h-auto lg:min-h-[150px] overflow-hidden" aria-hidden>
          <img src={HERO_ART} alt="" decoding="async" className="pixelated absolute inset-0 h-full w-full object-cover object-center" onError={(e) => (e.currentTarget.style.display = "none")} />
          <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-transparent from-60% to-rpg-panel" />
        </div>
        <div className="relative min-w-0 px-4 sm:px-6 py-4 lg:py-5 flex flex-col justify-center">
          <h1 className="rpg-title font-bold leading-tight text-2xl sm:text-3xl xl:text-4xl flex items-center gap-2.5">
            <Brain className="shrink-0 text-rpg-gold-light" size={30} aria-hidden /> Forja da Inteligência
          </h1>
          <p className="mt-2 font-semibold text-rpg-text">Transforme seus dados em previsões, modelos e estratégias para evoluir sua jornada.</p>
          <p className="mt-1 text-sm italic text-rpg-muted">Treine artefatos, acompanhe a precisão e descubra padrões escondidos na sua rotina.</p>
        </div>
        <div className="relative flex flex-row lg:flex-col items-center lg:items-end justify-between gap-3 px-4 sm:px-6 pb-4 lg:py-5">
          <p className="hidden 2xl:block text-right italic text-sm text-rpg-gold-light font-rpg max-w-[240px]">“Conhecimento guiado por dados forja decisões mais sábias.”</p>
          <RPGButton variant="primary" className="ml-auto lg:ml-0 !px-5" onClick={onNew}>
            <Plus size={16} aria-hidden /> Nova forja
          </RPGButton>
        </div>
      </div>
    </header>
  );
}
