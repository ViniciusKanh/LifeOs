import { Boxes } from "lucide-react";
import { HERO_ART } from "@/utils/bottleneckDisplay";

/** Hero do Detector: viajante diante da passagem bloqueada (pixel art). */
export function BottleneckHero() {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative">
        <img src={HERO_ART} alt="" aria-hidden decoding="async" className="pixelated absolute inset-x-0 top-0 h-32 w-full lg:inset-0 lg:h-full object-cover object-[62%_70%]" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="absolute inset-x-0 top-14 h-20 bg-gradient-to-b from-transparent to-rpg-panel lg:hidden" aria-hidden />
        <div className="absolute inset-x-0 top-32 bottom-0 bg-rpg-panel lg:hidden" aria-hidden />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-rpg-bg from-25% via-rpg-bg/75 via-50% to-transparent" aria-hidden />
        <div className="relative grid gap-4 px-4 sm:px-6 pt-28 pb-5 lg:py-6 lg:grid-cols-[1fr_auto] lg:items-center min-h-[160px] lg:min-h-[190px]">
          <div className="flex items-start gap-4 min-w-0">
            <span className="hidden sm:flex shrink-0 w-20 h-20 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 4 }} aria-hidden>
              <Boxes size={40} />
            </span>
            <div className="min-w-0">
              <h1 className="rpg-title font-bold leading-tight text-3xl sm:text-4xl">Detector de Gargalos</h1>
              <p className="mt-2 font-semibold text-rpg-text">Descubra o que realmente está impedindo sua evolução.</p>
              <p className="mt-1 text-sm text-rpg-text/85 max-w-xl">
                O LifeOS analisa sua rotina, projetos, missões, hábitos, agenda e capacidade para identificar os principais gargalos e sugerir próximos movimentos com base nos seus dados reais.
              </p>
            </div>
          </div>
          <p className="hidden xl:block text-right italic text-sm text-rpg-gold-light font-rpg max-w-[230px] bg-rpg-bg/70 px-2 py-1 justify-self-end">
            “Todo progresso começa quando identificamos o que nos impede de avançar.”
          </p>
        </div>
      </div>
    </header>
  );
}
