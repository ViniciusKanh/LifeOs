import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, Coins, Link2, MoreVertical, Star } from "lucide-react";
import { RPGBadge, RPGProgressBar } from "@/components/rpg";
import type { Campaign, CampaignStatus } from "@/services/campaignsService";
import { CAMPAIGN_STATUS, ICON_EMOJI, TERM_LABEL, campaignArtSrc, fmtMonthYear, lifeAreaLabel } from "@/utils/campaignDisplay";

const BAR_TONE = { planned: "blue", active: "purple", paused: "orange", completed: "green", archived: "muted" } as const;

/**
 * Card da campanha (lista da Forja): capa pixel art, estado, área, prazo,
 * progresso real e recompensa prevista (ganho + potencial). Clicar
 * seleciona a campanha para o painel lateral; o título abre o detalhe.
 */
export function CampaignCard({
  campaign: c,
  selected,
  onSelect,
  onStatus,
}: {
  campaign: Campaign;
  selected: boolean;
  onSelect: () => void;
  onStatus: (status: Exclude<CampaignStatus, "completed">) => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const st = CAMPAIGN_STATUS[c.status];
  const area = lifeAreaLabel(c.lifeArea);
  const totalXp = c.earned.xp + c.potential.xp;
  const totalCoins = c.earned.coins + c.potential.coins;
  const actions: Array<{ label: string; status: Exclude<CampaignStatus, "completed"> }> = [
    ...(c.status === "planned" ? [{ label: "Iniciar campanha", status: "active" as const }] : []),
    ...(c.status === "active" ? [{ label: "Pausar", status: "paused" as const }] : []),
    ...(c.status === "paused" ? [{ label: "Retomar", status: "active" as const }] : []),
    ...(c.status !== "archived" ? [{ label: "Arquivar", status: "archived" as const }] : [{ label: "Desarquivar", status: "planned" as const }]),
  ];

  return (
    <article
      className={`rpg-panel relative flex gap-3 p-3 transition-colors cursor-pointer ${selected ? "rpg-panel-gold ring-1 ring-rpg-gold/70" : "hover:border-rpg-gold/60"}`}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onSelect())}
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Selecionar campanha ${c.title}, ${st.label}, ${c.progress.pct}%`}
    >
      <img
        src={campaignArtSrc(c.banner)}
        alt=""
        loading="lazy"
        decoding="async"
        width={112}
        height={150}
        className="pixelated hidden sm:block w-24 lg:w-28 self-stretch min-h-[132px] object-cover border-2 border-rpg-border"
        style={{ borderRadius: 3 }}
      />
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <RPGBadge tone={st.tone} icon={<Clock3 size={9} aria-hidden />}>{st.label}</RPGBadge>
          <div ref={menuRef} className="relative -mt-1 -mr-1" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="p-1.5 text-rpg-muted hover:text-rpg-gold-light" aria-haspopup="menu" aria-expanded={menu} aria-label={`Ações da campanha ${c.title}`} onClick={() => setMenu((v) => !v)}>
              <MoreVertical size={16} />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-20 mt-1 w-44 border-2 border-rpg-gold/60 bg-rpg-panel shadow-rpg py-1" style={{ borderRadius: 3 }}>
                <Link role="menuitem" to={`/forja-campanhas/${c.id}`} className="block px-3 py-1.5 text-sm text-rpg-text hover:bg-rpg-panel-hover">Abrir detalhes</Link>
                {actions.map((a) => (
                  <button key={a.label} role="menuitem" type="button" className="block w-full text-left px-3 py-1.5 text-sm text-rpg-text hover:bg-rpg-panel-hover" onClick={() => (setMenu(false), onStatus(a.status))}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <h3 className="mt-1.5 font-rpg text-base sm:text-lg font-bold leading-tight text-rpg-text">
          <Link to={`/forja-campanhas/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-rpg-gold-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-rpg-gold">
            {c.icon && <span aria-hidden>{ICON_EMOJI[c.icon]} </span>}
            {c.title}
          </Link>
        </h3>
        {c.description && <p className="mt-1 text-xs sm:text-[13px] text-rpg-muted line-clamp-2">{c.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {area && <span className="inline-flex items-center gap-1 border border-rpg-border bg-rpg-bg-2 px-2 py-0.5 text-[11px] text-rpg-text" style={{ borderRadius: 3 }}>{area.emoji} {area.label}</span>}
          <span className="inline-flex items-center gap-1 border border-rpg-border bg-rpg-bg-2 px-2 py-0.5 text-[11px] text-rpg-text" style={{ borderRadius: 3 }}>⏳ {TERM_LABEL[c.term]}</span>
        </div>
        <div className="mt-auto pt-2.5 flex items-center gap-2">
          <RPGProgressBar className="flex-1" tone={BAR_TONE[c.status]} label={`Progresso de ${c.title}`} value={c.progress.pct} showLabel={false} />
          <span className="font-pixel text-sm text-rpg-text tabular-nums">{c.progress.pct}%</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
          <span className="inline-flex items-center gap-1 font-pixel text-rpg-purple" title={`Previsto. Já ganho: ${c.earned.xp} XP`}>
            <Star size={13} aria-hidden /> +{totalXp.toLocaleString("pt-BR")} XP
          </span>
          <span className="inline-flex items-center gap-1 font-pixel text-rpg-gold-light" title={`Previsto. Já ganho: ${c.earned.coins} moedas`}>
            <Coins size={13} aria-hidden /> +{totalCoins.toLocaleString("pt-BR")}
          </span>
          {c.endDate && <span className="inline-flex items-center gap-1 text-rpg-muted"><CalendarDays size={13} aria-hidden /> {fmtMonthYear(c.endDate)}</span>}
          <span className="inline-flex items-center gap-1 text-rpg-muted"><Link2 size={13} aria-hidden /> {c.counts.missions} missões</span>
        </div>
      </div>
    </article>
  );
}
