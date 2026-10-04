import { Plus, ScrollText } from "lucide-react";
import { RPGButton } from "@/components/rpg";

/** Hero dos Protocolos: biblioteca/grimório em pixel art. */
export function ProtocolHero({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold overflow-hidden">
      <div className="relative">
        <img src="/assets/rpg/protocols-hero.webp" alt="" aria-hidden decoding="async" className="pixelated absolute inset-x-0 top-0 h-32 w-full lg:inset-0 lg:h-full object-cover object-[60%_50%]" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div className="absolute inset-x-0 top-14 h-20 bg-gradient-to-b from-transparent to-rpg-panel lg:hidden" aria-hidden />
        <div className="absolute inset-x-0 top-32 bottom-0 bg-rpg-panel lg:hidden" aria-hidden />
        <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-rpg-bg from-30% via-rpg-bg/80 via-55% to-rpg-bg/10" aria-hidden />
        <div className="relative grid gap-4 px-4 sm:px-6 pt-28 pb-5 lg:py-7 lg:grid-cols-[1fr_auto] lg:items-end min-h-[170px] lg:min-h-[200px]">
          <div className="flex items-start gap-4 min-w-0">
            <span className="hidden sm:flex shrink-0 w-20 h-20 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-gold-light" style={{ borderRadius: 4 }} aria-hidden>
              <ScrollText size={40} />
            </span>
            <div className="min-w-0">
              <h1 className="rpg-title font-bold leading-tight text-3xl sm:text-4xl">Protocolos</h1>
              <p className="mt-2 font-semibold text-rpg-text">Planos prontos para os momentos que se repetem.</p>
              <p className="mt-1 text-sm text-rpg-text/85 max-w-xl">Quando a situação aparecer, você revisa as ações, escolhe o que executar e o LifeOS cuida do resto — nada acontece sem sua confirmação.</p>
            </div>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-3">
            <p className="hidden lg:block text-right italic text-sm text-rpg-gold-light font-rpg max-w-[260px] bg-rpg-bg/80 px-2 py-1">“Preparação hoje, liberdade amanhã.”</p>
            <RPGButton variant="gold" onClick={onCreate}>
              <Plus size={15} aria-hidden /> Novo protocolo
            </RPGButton>
          </div>
        </div>
      </div>
    </header>
  );
}
