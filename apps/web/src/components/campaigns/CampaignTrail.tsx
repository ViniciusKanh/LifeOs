import { Check, Flag, Lock, Map as MapIcon, Skull } from "lucide-react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { RPGPanel } from "@/components/rpg";
import type { Campaign, TrailState } from "@/services/campaignsService";
import { campaignArtSrc } from "@/utils/campaignDisplay";

const NODE: Record<TrailState, string> = {
  completed: "border-rpg-green bg-rpg-green/25 text-rpg-green",
  current: "border-rpg-gold bg-rpg-gold/25 text-rpg-gold-light",
  upcoming: "border-rpg-muted/70 bg-rpg-bg/80 text-rpg-muted",
  blocked: "border-rpg-muted/50 bg-rpg-bg/80 text-rpg-muted/70",
};
const STATE_LABEL: Record<TrailState, string> = { completed: "concluído", current: "atual", upcoming: "a seguir", blocked: "bloqueado" };

/**
 * Trilha da campanha: os marcos REAIS em ordem, como caminho num mapa.
 * O último marco principal é o "chefe" (só apresentação, em vermelho).
 */
export function CampaignTrail({ campaign }: { campaign: Campaign | null }) {
  const reduce = useReducedMotion();
  const ms = campaign?.milestones ?? [];
  const bossId = [...ms].reverse().find((m) => m.isMajor)?.id ?? null;
  const shown = ms.slice(0, 9);
  const points = [{ x: 7, y: 70 }, ...shown.map((_, i) => ({ x: 7 + ((i + 1) * 86) / Math.max(1, shown.length), y: 58 + Math.sin((i + 1) * 1.25) * 24 }))];
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <RPGPanel
      title="Trilha da campanha"
      icon={<MapIcon size={16} />}
      actions={campaign && <Link to={`/forja-campanhas/${campaign.id}`} className="text-xs text-rpg-gold-light hover:underline">Ver mapa →</Link>}
    >
      {!campaign && <p className="py-8 text-center text-sm text-rpg-muted">Selecione uma campanha para ver a trilha.</p>}
      {campaign && ms.length === 0 && <p className="py-8 text-center text-sm text-rpg-muted">Esta campanha ainda não tem marcos. Adicione marcos no detalhe da campanha.</p>}
      {campaign && ms.length > 0 && (
        <>
          <div className="relative h-36 overflow-hidden border border-rpg-border" style={{ borderRadius: 3 }} aria-hidden>
            <img src={campaignArtSrc(campaign.banner)} alt="" loading="lazy" className="pixelated absolute inset-0 w-full h-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-t from-rpg-bg/85 to-rpg-bg/20" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <path d={path} fill="none" stroke="rgb(var(--rpg-gold))" strokeWidth="1.4" strokeDasharray="2.5 2" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute -translate-x-1/2 -translate-y-1/2 text-rpg-gold-light" style={{ left: `${points[0].x}%`, top: `${points[0].y}%` }}>
              <Flag size={18} />
            </span>
            {shown.map((m, i) => {
              const boss = m.id === bossId;
              const p = points[i + 1];
              return (
                <span
                  key={m.id}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border-2 ${boss && m.state !== "completed" ? "w-9 h-9 border-rpg-red bg-rpg-red/25 text-rpg-red" : `w-7 h-7 ${NODE[m.state]}`} ${m.state === "current" && !reduce ? "animate-pulse" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  title={`${m.title} — ${STATE_LABEL[m.state]}`}
                >
                  {m.state === "completed" ? <Check size={14} strokeWidth={3} /> : boss ? <Skull size={17} /> : m.state === "blocked" ? <Lock size={12} /> : m.state === "current" ? <Flag size={13} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                </span>
              );
            })}
          </div>
          <ol className="sr-only">
            {ms.map((m) => (
              <li key={m.id}>{m.title}: {STATE_LABEL[m.state]}{m.id === bossId ? " (marco principal final)" : ""}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-rpg-muted">
            {campaign.counts.milestonesDone}/{campaign.counts.milestones} marcos · próximo: {ms.find((m) => m.state === "current")?.title ?? "—"}
          </p>
        </>
      )}
    </RPGPanel>
  );
}
