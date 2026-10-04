import { Backpack, LayoutList } from "lucide-react";
import { RPGButton } from "@/components/rpg";

/**
 * Hero da Coleção: arte pixel art (biblioteca, baús, armadura e lua) com
 * o texto sobre véu escuro. No celular/tablet a arte vira faixa no topo.
 */
export function InventoryHero({ organizing, onOrganize }: { organizing: boolean; onOrganize: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative">
        <img
          src="/assets/rpg/inventory-hero.webp"
          alt=""
          aria-hidden
          decoding="async"
          className="pixelated absolute inset-x-0 top-0 h-32 w-full lg:inset-0 lg:h-full object-cover object-[60%_70%] lg:object-[50%_70%]"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div className="absolute inset-x-0 top-14 h-20 bg-gradient-to-b from-transparent to-rpg-panel lg:hidden" aria-hidden />
        <div className="absolute inset-x-0 top-32 bottom-0 bg-rpg-panel lg:hidden" aria-hidden />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-rpg-bg/95 via-rpg-bg/70 to-rpg-bg/10" aria-hidden />
        <div className="relative grid gap-4 px-4 sm:px-6 pt-28 pb-5 lg:py-6 lg:grid-cols-[1fr_auto] lg:items-center min-h-[170px] lg:min-h-[200px]">
          <div className="flex items-start gap-4 min-w-0">
            <span className="hidden sm:flex shrink-0 w-16 h-16 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 4 }} aria-hidden>
              <Backpack size={30} />
            </span>
            <div className="min-w-0">
              <h1 className="rpg-title font-bold leading-tight text-3xl sm:text-4xl">Coleção / Inventário</h1>
              <p className="mt-2 text-sm text-rpg-text/90 max-w-xl">
                Guarde, organize e utilize os itens que você coletou em sua jornada. Relíquias, consumíveis, equipamentos e tesouros que representam sua evolução.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <p className="hidden lg:block text-right italic text-sm text-rpg-gold-light/90 font-rpg max-w-[260px]">“Cada item carrega uma história e um propósito na sua jornada.”</p>
            <RPGButton variant="primary" onClick={onOrganize} aria-pressed={organizing}>
              <LayoutList size={15} aria-hidden /> {organizing ? "Concluir organização" : "Organizar inventário"}
            </RPGButton>
          </div>
        </div>
      </div>
    </header>
  );
}
