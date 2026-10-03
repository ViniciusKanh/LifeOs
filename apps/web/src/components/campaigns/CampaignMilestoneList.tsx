import { BookOpen, CheckCircle2, Circle, Crown, Gem, Lock, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { RPGPanel } from "@/components/rpg";
import type { Campaign, CampaignMilestone } from "@/services/campaignsService";
import { fmtMonthYear } from "@/utils/campaignDisplay";

const ICONS = [Crown, BookOpen, Gem, Shield];

/**
 * "Chefes finais / Marcos": marcos principais primeiro (o "chefe" é só a
 * apresentação de um marco importante). Concluir aqui chama o backend,
 * que paga a recompensa uma única vez.
 */
export function CampaignMilestoneList({
  campaign,
  onToggle,
  busyId,
  limit = 3,
}: {
  campaign: Campaign | null;
  onToggle?: (m: CampaignMilestone) => void;
  busyId?: string | null;
  limit?: number;
}) {
  const list = campaign ? [...campaign.milestones].sort((a, b) => Number(b.isMajor) - Number(a.isMajor) || a.position - b.position).slice(0, limit) : [];
  const editable = !!onToggle && (campaign?.status === "active" || campaign?.status === "paused" || campaign?.status === "planned");
  return (
    <RPGPanel
      title="Chefes finais / Marcos"
      icon={<Crown size={16} />}
      actions={campaign && <Link to={`/forja-campanhas/${campaign.id}?aba=marcos`} className="text-xs text-rpg-gold-light hover:underline">Ver todos →</Link>}
    >
      {!campaign && <p className="py-4 text-sm text-rpg-muted">Nenhuma campanha selecionada.</p>}
      {campaign && list.length === 0 && <p className="py-4 text-sm text-rpg-muted">Sem marcos ainda.</p>}
      <ul className="relative space-y-1">
        {list.map((m, i) => {
          const Icon = ICONS[i % ICONS.length];
          const done = m.status === "completed";
          return (
            <li key={m.id} className="flex items-center gap-3 border-l-2 border-rpg-border/70 pl-3 py-1.5">
              <span className={`shrink-0 w-9 h-9 flex items-center justify-center border ${m.isMajor ? "border-rpg-gold/70 text-rpg-gold-light" : "border-rpg-border text-rpg-muted"} bg-rpg-bg`} style={{ borderRadius: 3 }} aria-hidden>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-rpg-text truncate">{m.title}{m.isMajor && <span className="sr-only"> (marco principal)</span>}</p>
                {m.description && <p className="text-[11px] text-rpg-muted truncate">{m.description}</p>}
              </div>
              <button
                type="button"
                disabled={!editable || busyId === m.id || (m.state === "blocked" && !done)}
                onClick={() => onToggle?.(m)}
                className="shrink-0 p-1 disabled:cursor-default disabled:opacity-80"
                aria-label={done ? `Reabrir marco ${m.title}` : m.state === "blocked" ? `Marco ${m.title} bloqueado por dependência` : `Concluir marco ${m.title}`}
                aria-pressed={done}
              >
                {done ? <CheckCircle2 size={22} className="text-rpg-green" /> : m.state === "blocked" ? <Lock size={18} className="text-rpg-muted" /> : <Circle size={22} className="text-rpg-text/80" />}
              </button>
              <span className="w-16 shrink-0 text-right text-xs text-rpg-gold-light">{fmtMonthYear(m.dueDate) ?? "—"}</span>
            </li>
          );
        })}
      </ul>
    </RPGPanel>
  );
}
