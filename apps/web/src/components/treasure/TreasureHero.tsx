import type { ReactNode } from "react";

/**
 * Hero do Tesouro: arte pixel art (baú, estandarte, castelo e lua) com o
 * texto sobre uma faixa escurecida para garantir contraste. No celular o
 * baú fica à mostra no topo e a citação some.
 */
export function TreasureHero({ actions }: { actions: ReactNode }) {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative">
        <img
          src="/assets/rpg/treasure-hero.webp"
          alt=""
          aria-hidden
          decoding="async"
          className="pixelated absolute inset-x-0 top-0 h-36 w-full lg:inset-0 lg:h-full object-cover object-[8%_70%] lg:object-[50%_70%]"
          onError={(e) => {
            // Fallback: sem a arte, fica o gradiente do painel.
            e.currentTarget.style.display = "none";
          }}
        />
        {/* Celular: arte em faixa no topo, texto sobre fundo sólido. Desktop: texto sobre a arte com véu escuro. */}
        <div className="absolute inset-x-0 top-16 h-20 bg-gradient-to-b from-transparent to-rpg-panel lg:hidden" aria-hidden />
        <div className="absolute inset-x-0 top-36 bottom-0 bg-rpg-panel lg:hidden" aria-hidden />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-rpg-bg/30 via-rpg-bg/75 to-rpg-bg/20" aria-hidden />
        <div className="hidden lg:block absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-rpg-bg/70 to-transparent" aria-hidden />
        <div className="relative grid gap-4 px-4 sm:px-6 pt-32 pb-5 lg:py-6 lg:pl-[24%] lg:grid-cols-[1fr_auto] lg:items-end min-h-[180px] lg:min-h-[200px]">
          <div className="min-w-0">
            <h1 className="rpg-title font-bold leading-tight text-3xl sm:text-4xl">Tesouro &amp; Recompensas</h1>
            <p className="mt-2 font-semibold text-rpg-text">Suas conquistas se transformam em liberdade.</p>
            <p className="mt-1 text-sm text-rpg-text/85 max-w-xl">Troque moedas conquistadas na sua jornada por recompensas que tornam sua rotina mais leve e divertida.</p>
            <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
          </div>
          <p className="hidden lg:block text-right italic text-sm text-rpg-gold-light/90 pb-1 font-rpg">
            “Disciplina hoje,
            <br />
            recompensas amanhã.”
          </p>
        </div>
      </div>
    </header>
  );
}
