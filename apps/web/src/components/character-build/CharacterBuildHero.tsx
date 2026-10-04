import { Compass } from "lucide-react";

/** Hero do Build: personagem de costas diante do castelo à noite (pixel art). */
export function CharacterBuildHero() {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative">
        <img src="/assets/rpg/build-hero.webp" alt="" aria-hidden decoding="async" className="pixelated absolute inset-x-0 top-0 h-32 w-full lg:inset-0 lg:h-full object-cover object-[55%_60%]" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="absolute inset-x-0 top-14 h-20 bg-gradient-to-b from-transparent to-rpg-panel lg:hidden" aria-hidden />
        <div className="absolute inset-x-0 top-32 bottom-0 bg-rpg-panel lg:hidden" aria-hidden />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-rpg-bg/95 via-rpg-bg/55 to-rpg-bg/10" aria-hidden />
        <div className="relative grid gap-4 px-4 sm:px-6 pt-28 pb-5 lg:py-7 lg:grid-cols-[1fr_auto] lg:items-end min-h-[170px] lg:min-h-[210px]">
          <div className="flex items-start gap-4 min-w-0">
            <span className="hidden sm:flex shrink-0 w-20 h-20 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 4 }} aria-hidden>
              <Compass size={40} />
            </span>
            <div className="min-w-0">
              <h1 className="rpg-title font-bold leading-tight text-3xl sm:text-4xl">Build do Personagem</h1>
              <p className="mt-2 font-semibold text-rpg-text">Descubra que tipo de herói sua rotina está formando.</p>
              <p className="mt-1 text-sm text-rpg-text/85 max-w-xl">Seus dados reais revelam seu estilo de jogo, seus pontos fortes e o caminho para uma versão mais equilibrada de si mesmo.</p>
            </div>
          </div>
          <p className="hidden lg:block text-right italic text-sm text-rpg-gold-light/90 font-rpg max-w-[260px]">“Todo herói é a soma das suas escolhas diárias.”</p>
        </div>
      </div>
    </header>
  );
}
