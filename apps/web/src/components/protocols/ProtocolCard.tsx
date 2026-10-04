import { Clock, ListChecks, Play, Star, Zap } from "lucide-react";
import clsx from "clsx";
import { RPGBadge, RPGButton } from "@/components/rpg";
import type { Protocol } from "@/services/protocolsService";
import { CATEGORY_TONE, ago, protocolArtUrl } from "@/utils/protocolDisplay";

/** Card do grid: arte, situação, gatilho, nº de ações, usos e última execução. */
export function ProtocolCard({
  protocol: p,
  categoryLabel,
  selected,
  onSelect,
  onFavorite,
  onExecute,
}: {
  protocol: Protocol;
  categoryLabel: string;
  selected: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onExecute: () => void;
}) {
  return (
    <article className={clsx("rpg-panel flex flex-col overflow-hidden transition-colors", selected ? "border-rpg-gold ring-1 ring-rpg-gold" : "hover:border-rpg-gold/60")}>
      <div className="relative">
        <button type="button" onClick={onSelect} className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold" aria-label={`Ver detalhes de ${p.name}`}>
          <img src={protocolArtUrl(p.art)} alt="" loading="lazy" decoding="async" className="pixelated w-full aspect-[2/1] sm:aspect-[16/9] object-cover bg-rpg-bg-2" />
        </button>
        <span className="absolute left-2 top-2">
          <RPGBadge tone={CATEGORY_TONE[p.category] ?? "muted"} className="bg-rpg-bg/85">
            {categoryLabel}
          </RPGBadge>
        </span>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={p.favorite}
          aria-label={p.favorite ? `Remover ${p.name} dos favoritos` : `Favoritar ${p.name}`}
          className="absolute right-2 top-2 w-8 h-8 flex items-center justify-center border border-rpg-border bg-rpg-bg/85 text-rpg-gold-light hover:border-rpg-gold"
          style={{ borderRadius: 3 }}
        >
          <Star size={15} fill={p.favorite ? "currentColor" : "none"} aria-hidden />
        </button>
        {p.triggered && (
          <span className="absolute left-2 bottom-2">
            <RPGBadge tone="orange" icon={<Zap size={10} aria-hidden />} className="bg-rpg-bg/85">
              Gatilho ativo
            </RPGBadge>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="font-rpg text-lg font-bold leading-tight text-rpg-text">
          <button type="button" onClick={onSelect} className="text-left hover:text-rpg-gold-light">
            {p.name}
          </button>
        </h3>
        <p className="text-xs text-rpg-text/80 line-clamp-2">
          <span className="text-rpg-muted">Quando: </span>
          {p.triggerDescription || "Executado manualmente"}
        </p>
        <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-rpg-muted">
          <div className="flex items-center gap-1">
            <ListChecks size={12} aria-hidden />
            <dt className="sr-only">Ações</dt>
            <dd>
              {p.steps.length} {p.steps.length === 1 ? "ação" : "ações"}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <Play size={12} aria-hidden />
            <dt className="sr-only">Usos</dt>
            <dd>
              {p.uses} {p.uses === 1 ? "uso" : "usos"}
            </dd>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={12} aria-hidden />
            <dt className="sr-only">Última execução</dt>
            <dd>{ago(p.lastRunAt)}</dd>
          </div>
          <div>
            <dt className="sr-only">Origem</dt>
            <dd>{p.kind === "template" ? "Template" : p.sourceTemplate ? "Baseado em template" : "Criado por você"}</dd>
          </div>
        </dl>
        <RPGButton variant="primary" className="w-full justify-center" onClick={onExecute}>
          <Play size={14} aria-hidden /> Executar
        </RPGButton>
      </div>
    </article>
  );
}
