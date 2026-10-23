import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Crown } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RPGBadge, RPGButton, RPGPanel, RPG_TONE_SOFT } from "@/components/rpg";
import { useAchievements } from "@/hooks/useAchievements";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { useQueryClient } from "@tanstack/react-query";
import type { HeroHud } from "@/services/codexService";
import type { AchievementTier } from "@/types";
import { TIER_LABEL, TIER_ORDER, TIER_RPG_TONE } from "./tierDisplay";
import { achievementIcon } from "./achievementIcons";

type ShowcaseItem = HeroHud["showcase"][number];
const MAX = 3;
const tierRank = (t: AchievementTier) => TIER_ORDER.length - TIER_ORDER.indexOf(t);

/** Medalhas pequenas da vitrine (cabeçalho e cartões). */
export function TrophyShowcaseStrip({ items, size = "sm" }: { items: ShowcaseItem[]; size?: "xs" | "sm" }) {
  const box = size === "xs" ? "h-5 w-5" : "h-7 w-7";
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Vitrine: ${items.map((i) => i.title).join(", ")}`}>
      {items.map((i) => {
        const Icon = achievementIcon(i.icon);
        return (
          <span key={i.id} className={clsx("inline-flex items-center justify-center border", box, RPG_TONE_SOFT[TIER_RPG_TONE[i.tier]])} style={{ borderRadius: 3 }} title={`${i.title} (${TIER_LABEL[i.tier]})`}>
            <Icon size={size === "xs" ? 11 : 14} aria-hidden />
          </span>
        );
      })}
    </span>
  );
}

/**
 * Vitrine de troféus do Perfil: até 3 conquistas desbloqueadas escolhidas
 * pelo usuário (as mais raras primeiro na escolha). Fica nas preferências
 * do personagem; o servidor só exibe as que estão de fato desbloqueadas.
 */
export function TrophyShowcasePanel({ hud }: { hud: HeroHud | undefined }) {
  const [open, setOpen] = useState(false);
  const items = hud?.showcase ?? [];
  return (
    <RPGPanel
      title="Vitrine de troféus"
      icon={<Crown size={14} />}
      variant="gold"
      actions={
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-rpg-muted hover:text-rpg-gold-light">
          Escolher
        </button>
      }
    >
      {items.length === 0 ? (
        <div className="py-3 text-sm text-rpg-muted">
          Escolha até 3 conquistas desbloqueadas para exibir aqui e no cabeçalho.
          <RPGButton variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
            Montar vitrine
          </RPGButton>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {items.map((i) => {
            const Icon = achievementIcon(i.icon);
            return (
              <li key={i.id} className="flex flex-col items-center gap-1.5 border border-rpg-border bg-rpg-bg-2/70 p-3 text-center" style={{ borderRadius: 3 }}>
                <span className={clsx("inline-flex h-12 w-12 items-center justify-center border-2", RPG_TONE_SOFT[TIER_RPG_TONE[i.tier]])} style={{ borderRadius: 4 }} aria-hidden>
                  <Icon size={22} />
                </span>
                <p className="text-sm font-semibold text-rpg-text leading-tight">{i.title}</p>
                <RPGBadge tone={TIER_RPG_TONE[i.tier]}>{TIER_LABEL[i.tier]}</RPGBadge>
                <p className="text-[10px] text-rpg-muted">desde {new Date(i.unlockedAt.replace(" ", "T") + (i.unlockedAt.endsWith("Z") ? "" : "Z")).toLocaleDateString("pt-BR")}</p>
              </li>
            );
          })}
        </ul>
      )}
      {open && <ShowcasePicker current={items.map((i) => i.id)} onClose={() => setOpen(false)} />}
    </RPGPanel>
  );
}

function ShowcasePicker({ current, onClose }: { current: string[]; onClose: () => void }) {
  const { achievements, isLoading } = useAchievements(false);
  const { update } = useRpgPreferences();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>(current);
  const unlocked = useMemo(
    () => achievements.filter((a) => a.unlockedAt).sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? "")),
    [achievements],
  );
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX ? p : [...p, id]));
  const save = () => {
    update({ showcase: picked });
    // A vitrine vem do HUD (servidor valida o que está desbloqueado).
    window.setTimeout(() => void qc.invalidateQueries({ queryKey: ["codex", "hud"] }), 400);
    onClose();
  };
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Montar vitrine de troféus"
      footer={
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-rpg-muted">
            {picked.length}/{MAX} escolhidas
          </span>
          <RPGButton variant="ghost" onClick={onClose}>
            Cancelar
          </RPGButton>
          <RPGButton variant="gold" onClick={save}>
            Salvar vitrine
          </RPGButton>
        </div>
      }
    >
      {isLoading ? (
        <div className="h-40 rpg-bar animate-pulse motion-reduce:animate-none" aria-label="Carregando conquistas" />
      ) : unlocked.length === 0 ? (
        <p className="py-6 text-sm text-rpg-muted">Você ainda não desbloqueou conquistas. Complete missões e hábitos para ganhar as primeiras.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {unlocked.map((a) => {
            const on = picked.includes(a.id);
            const Icon = achievementIcon(a.icon);
            const full = !on && picked.length >= MAX;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  disabled={full}
                  aria-pressed={on}
                  className={clsx(
                    "flex w-full items-center gap-2.5 border p-2 text-left transition-colors disabled:opacity-40",
                    on ? "border-rpg-gold bg-rpg-gold/10" : "border-rpg-border hover:border-rpg-gold/60",
                  )}
                  style={{ borderRadius: 3 }}
                >
                  <span className={clsx("inline-flex h-9 w-9 shrink-0 items-center justify-center border", RPG_TONE_SOFT[TIER_RPG_TONE[a.tier]])} style={{ borderRadius: 3 }} aria-hidden>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rpg-text">{a.title}</span>
                    <span className="text-[11px] text-rpg-muted">{TIER_LABEL[a.tier]}</span>
                  </span>
                  {on && <Check size={16} className="shrink-0 text-rpg-gold-light" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
