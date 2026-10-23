import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarClock, Crown, Lock, Trophy } from "lucide-react";
import { RPGBadge, RPGPanel, RPGProgressBar } from "@/components/rpg";
import type { Season } from "@/services/questsService";
import { daysLeftLabel, fmtNum, fmtShortDay } from "./questFormat";

/** Progresso até o próximo tier (ou a trilha cheia, no último). */
export function seasonProgress(s: Season): { value: number; max: number; text: string } {
  if (!s.nextTier) return { value: 1, max: 1, text: "Trilha completa" };
  const prevXp = s.tiers.find((t) => t.tier === s.tier)?.xp ?? 0;
  return { value: s.xp - prevXp, max: s.nextTier.xp - prevXp, text: `${fmtNum(s.xp)}/${fmtNum(s.nextTier.xp)} XP` };
}

/**
 * Temporada do mês: XP do mês (soma real do ledger), trilha de recompensas
 * cosméticas por tier e o resumo da temporada anterior.
 */
export function SeasonTrack({ season: s }: { season: Season }) {
  const p = seasonProgress(s);
  return (
    <RPGPanel
      title={s.name}
      icon={<Trophy size={14} />}
      variant="gold"
      actions={
        <span className="inline-flex items-center gap-1 text-[11px] text-rpg-muted">
          <CalendarClock size={12} aria-hidden /> {daysLeftLabel(s.daysLeft, fmtShortDay(s.to))}
        </span>
      }
    >
      <p className="-mt-1 mb-3 text-xs italic text-rpg-muted">“{s.motto}”</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[11px] text-rpg-muted">XP da temporada</p>
          <p className="font-pixel text-2xl tabular-nums text-rpg-text">{fmtNum(s.xp)}</p>
        </div>
        <div>
          <p className="text-[11px] text-rpg-muted">Tier</p>
          <p className="font-pixel text-2xl tabular-nums text-rpg-gold-light">
            {s.tier}
            <span className="text-sm text-rpg-muted">/{s.maxTier}</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-rpg-muted">Quests resgatadas no mês</p>
          <p className="font-pixel text-2xl tabular-nums text-rpg-text">{fmtNum(s.questsCompleted)}</p>
        </div>
      </div>
      <RPGProgressBar
        className="mt-3"
        tone="gold"
        label={s.nextTier ? `Próximo tier: ${s.nextTier.reward}` : "Todos os tiers da temporada liberados"}
        value={p.value}
        max={p.max}
        valueLabel={p.text}
      />
      {s.nextTier && (
        <p className="mt-1 text-[11px] text-rpg-muted">
          Faltam {fmtNum(s.nextTier.missing)} XP para o tier {s.nextTier.tier}.
        </p>
      )}

      <h3 className="mt-4 mb-2 font-pixel text-[11px] uppercase tracking-[0.12em] text-rpg-gold">Trilha de recompensas</h3>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {s.tiers.map((t) => (
          <li
            key={t.tier}
            className={clsx("flex flex-col gap-1 border p-2 text-xs", t.unlocked ? "border-rpg-gold/70 bg-rpg-gold/10" : "border-rpg-border/70 bg-rpg-bg-2/60 opacity-80")}
            style={{ borderRadius: 3 }}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="font-pixel text-[10px] text-rpg-muted">Tier {t.tier}</span>
              {t.unlocked ? <Crown size={12} className="text-rpg-gold-light" aria-hidden /> : <Lock size={12} className="text-rpg-muted" aria-hidden />}
            </span>
            <span className="font-semibold leading-tight text-rpg-text">{t.reward}</span>
            <span className="text-[10px] text-rpg-muted">
              {fmtNum(t.xp)} XP · {t.unlocked ? "Liberado" : "Bloqueado"}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-rpg-muted">
        Recompensas cosméticas, guardadas na{" "}
        <Link to="/inventario" className="text-rpg-gold-light underline underline-offset-2">
          Coleção
        </Link>
        . XP da temporada = todo o XP real ganho no mês.
      </p>

      {s.previous && (
        <div className="mt-4 border-t border-rpg-border/70 pt-3">
          <p className="text-[11px] text-rpg-muted">Temporada anterior</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-rpg-text">
            <span className="font-semibold">{s.previous.name}</span>
            <RPGBadge tone="gold">Tier {s.previous.tier}</RPGBadge>
            <span className="text-xs text-rpg-muted">
              {fmtNum(s.previous.xp)} XP · {fmtNum(s.previous.questsCompleted)} quests
            </span>
          </p>
        </div>
      )}
    </RPGPanel>
  );
}
