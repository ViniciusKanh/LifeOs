import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import type { BuildOverview } from "@/services/buildService";

/**
 * Arquétipo atual: leitura do padrão de atributos (não é personalidade).
 * A linguagem é sempre "seu padrão atual se aproxima de…".
 */
export function CharacterArchetypeCard({ archetype }: { archetype: NonNullable<BuildOverview["archetype"]> }) {
  return (
    <RPGPanel title="Arquétipo atual" variant="gold" className="h-full">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
        <img src={`/assets/rpg/avatars/${archetype.avatar}.webp`} alt={`Retrato do arquétipo ${archetype.name}`} className="pixelated w-full aspect-[3/4] object-cover border-2 border-rpg-gold bg-rpg-bg-2" style={{ borderRadius: 3 }} />
        <div className="min-w-0 space-y-2">
          <h2 className="font-rpg text-2xl font-bold text-rpg-text leading-tight">{archetype.name}</h2>
          <RPGBadge tone="purple">Primário</RPGBadge>
          <RPGProgressBar value={archetype.affinity} tone="purple" label="Afinidade" valueLabel={`${archetype.affinity}%`} />
          <p className="text-xs text-rpg-text/85">{archetype.description.replace(/^Seu padrão atual/, "Seu padrão atual")}</p>
          {archetype.secondary && (
            <p className="text-[11px] text-rpg-muted">
              Também se aproxima de <strong className="text-rpg-text">{archetype.secondary.name}</strong> ({archetype.secondary.affinity}%).
            </p>
          )}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Características relacionadas">
        {archetype.tags.map((t) => (
          <li key={t} className="px-2.5 py-1 text-xs text-rpg-blue border border-rpg-blue/60 bg-rpg-blue/10" style={{ borderRadius: 3 }}>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-rpg-muted">Leitura dos últimos 30 dias de XP — não é um teste de personalidade.</p>
    </RPGPanel>
  );
}
