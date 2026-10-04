import { BookOpen, ChevronRight, Compass, Crown, Gem, Lightbulb, ScrollText } from "lucide-react";
import clsx from "clsx";
import { RPGPanel } from "@/components/rpg";
import { RPG_TONE_SOFT } from "@/components/rpg/rpgAssets";
import type { Codex, CodexDiscovery, CodexKnowledge, CodexRelic, CodexTitle } from "@/services/codexService";
import { RARITY, relicSrc, timeAgo } from "@/utils/codexDisplay";

export type CodexSelection =
  | { kind: "discovery"; item: CodexDiscovery }
  | { kind: "relic"; item: CodexRelic }
  | { kind: "title"; item: CodexTitle }
  | { kind: "knowledge"; item: CodexKnowledge };

const VER = "text-xs text-rpg-gold-light hover:underline";

/** Coluna lateral: descobertas, relíquias, títulos e próximo conhecimento (dados reais). */
export function CodexSidebar({ codex, onSelect, onSeeAll }: { codex: Codex; onSelect: (s: CodexSelection) => void; onSeeAll: (tab: "relics" | "overview" | "classes") => void }) {
  const relics = codex.relics.filter((r) => r.unlocked).slice(0, 5);
  const titles = [...codex.titles].filter((t) => t.unlocked).sort((a, b) => order(b.rarity) - order(a.rarity)).slice(0, 3);
  const next = codex.knowledge.find((k) => !k.unlocked && k.unlock.type === "coins") ?? [...codex.knowledge].filter((k) => !k.unlocked).sort((a, b) => b.progress - a.progress)[0] ?? null;
  return (
    <aside className="space-y-3 min-w-0" aria-label="Descobertas, relíquias, títulos e conhecimento">
      <RPGPanel title="Descobertas recentes" icon={<Lightbulb size={16} />} actions={<button type="button" className={VER} onClick={() => onSeeAll("overview")}>Ver todas →</button>}>
        {codex.discoveries.length === 0 && <p className="text-xs text-rpg-muted">Nenhum padrão com evidência suficiente ainda. Registre foco, sono e tarefas por algumas semanas.</p>}
        <ul className="space-y-1">
          {codex.discoveries.slice(0, 3).map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => onSelect({ kind: "discovery", item: d })} className="flex w-full items-center gap-2.5 border border-rpg-border/60 bg-rpg-bg-2/60 p-2 text-left hover:border-rpg-gold/60" style={{ borderRadius: 3 }}>
                <span className="shrink-0 w-9 h-9 flex items-center justify-center border border-rpg-gold/50 bg-rpg-parchment/15 text-rpg-parchment" style={{ borderRadius: 3 }} aria-hidden>
                  <ScrollText size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-rpg-text">{d.title}</span>
                  <span className="block text-[11px] text-rpg-muted">Descoberta · {d.category}</span>
                </span>
                <span className="shrink-0 text-[10px] text-rpg-muted">{timeAgo(d.discoveredAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </RPGPanel>

      <RPGPanel title="Relíquias desbloqueadas" icon={<Gem size={16} />} actions={<button type="button" className={VER} onClick={() => onSeeAll("relics")}>Ver todas →</button>}>
        {relics.length === 0 && <p className="text-xs text-rpg-muted">Nenhuma relíquia ainda — veja na aba Relíquias como obter cada uma.</p>}
        <ul className="grid grid-cols-5 gap-1.5">
          {relics.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect({ kind: "relic", item: r })}
                className={clsx("aspect-square w-full flex items-center justify-center border-2 bg-rpg-bg p-1 hover:brightness-110", r.rarity === "legendary" || r.rarity === "epic" ? "border-rpg-purple/80" : "border-rpg-gold/60")}
                style={{ borderRadius: 3 }}
                title={`${r.name} · ${RARITY[r.rarity].label}`}
                aria-label={`${r.name}, ${RARITY[r.rarity].label}`}
              >
                <img src={relicSrc(r.id)} alt="" loading="lazy" className="pixelated w-full h-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      </RPGPanel>

      <RPGPanel title="Títulos do jogador" icon={<Crown size={16} />} actions={<button type="button" className={VER} onClick={() => onSeeAll("classes")}>Ver todos →</button>}>
        <ul className="space-y-1.5">
          {titles.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onSelect({ kind: "title", item: t })} className={clsx("flex w-full items-center gap-2 border px-2 py-1.5 text-left", RPG_TONE_SOFT[RARITY[t.rarity].tone])} style={{ borderRadius: 3 }}>
                <Crown size={16} className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rpg-text">{t.name}{t.equipped && <span className="ml-1 text-[10px] text-rpg-green">(equipado)</span>}</span>
                  <span className="block truncate text-[11px] text-rpg-text/70">{t.description}</span>
                </span>
                <span className="shrink-0 border border-current px-1.5 py-0.5 font-pixel text-[9px] uppercase" style={{ borderRadius: 2 }}>{RARITY[t.rarity].label}</span>
              </button>
            </li>
          ))}
          {titles.length === 0 && <li className="text-xs text-rpg-muted">Nenhum título desbloqueado.</li>}
        </ul>
      </RPGPanel>

      <RPGPanel title="Próximo conhecimento" icon={<Compass size={16} />}>
        {!next && <p className="text-xs text-rpg-muted">Você já desbloqueou todo o conhecimento disponível.</p>}
        {next && (
          <button type="button" onClick={() => onSelect({ kind: "knowledge", item: next })} className="flex w-full items-start gap-2.5 text-left">
            <span className="shrink-0 w-11 h-11 flex items-center justify-center border border-rpg-gold/50 bg-rpg-parchment/15 text-rpg-parchment" style={{ borderRadius: 3 }} aria-hidden>
              <BookOpen size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-rpg-text">{next.title}</span>
              <span className="block text-[10px] text-rpg-muted">{next.category}</span>
              <span className="block mt-0.5 text-[11px] text-rpg-text/75 line-clamp-2">{next.summary}</span>
            </span>
            <span className="shrink-0 border border-rpg-purple bg-rpg-purple/25 px-2 py-1 text-center text-[11px] text-rpg-text" style={{ borderRadius: 3 }}>
              {next.unlock.type === "coins" ? <>Desbloquear<span className="block font-pixel">🪙 {next.unlock.cost}</span></> : <>Requer<span className="block font-pixel">{next.unlock.min} XP</span></>}
            </span>
            <ChevronRight size={14} className="sr-only" />
          </button>
        )}
      </RPGPanel>
    </aside>
  );
}

const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const;
function order(r: keyof typeof RANK) {
  return RANK[r];
}
