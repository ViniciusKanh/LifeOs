import { ScrollText, Search } from "lucide-react";
import { CODEX_HERO } from "@/utils/codexDisplay";

/** Banner do Códex: pergaminho, título, biblioteca/castelo em pixel art e busca do Códex. */
export function CodexHero({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  return (
    <header className="rpg-panel rpg-panel-gold relative overflow-hidden min-h-[140px] md:min-h-[150px]">
      <img src={CODEX_HERO} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 w-full h-full object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/80 to-transparent" aria-hidden />
      <div className="relative flex flex-col md:flex-row md:items-center gap-4 p-4 sm:p-5">
        <span className="hidden sm:flex shrink-0 w-16 h-16 md:w-20 md:h-20 items-center justify-center border-2 border-rpg-gold bg-rpg-bg/80 text-rpg-parchment shadow-rpg" style={{ borderRadius: 4 }} aria-hidden>
          <ScrollText size={38} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="rpg-title text-3xl sm:text-4xl font-bold leading-tight">Códex da Jornada</h1>
          <p className="mt-1 max-w-xl text-sm text-rpg-text/90">Documente sua jornada, descubra seus pontos fortes e registre todo o conhecimento que constrói a sua melhor versão.</p>
          <label className="relative mt-3 block max-w-md">
            <span className="sr-only">Buscar no códex</span>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rpg-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Buscar no códex, descobertas ou títulos…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-rpg-bg-2/90 text-rpg-text border border-rpg-border focus:border-rpg-gold outline-none placeholder:text-rpg-muted/80"
              style={{ borderRadius: 3 }}
            />
          </label>
        </div>
        <p className="hidden xl:block max-w-[200px] self-start text-sm italic text-rpg-text/85">&ldquo;Toda grande história começa com um registro.&rdquo;</p>
      </div>
    </header>
  );
}
