import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RPGButton } from "@/components/rpg";
import { useAuth } from "@/hooks/useAuth";
import { useCodexActions } from "@/hooks/useCodex";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import type { Codex } from "@/services/codexService";
import { relicSrc } from "@/utils/codexDisplay";

type Notice =
  | { kind: "relic" | "title" | "knowledge" | "discovery"; id: string; heading: string; name: string; detail: string }
  | { kind: "level"; id: string; heading: string; name: string; detail: string };

/**
 * Avisos curtos de novidades do Códex. Desbloqueios/descobertas vêm do
 * backend (seen_at); a subida de nível de atributo é comparada com o
 * último nível visto neste aparelho (só para a animação, nada de dado).
 */
export function CodexUnlockOverlay({ codex }: { codex: Codex }) {
  const { user } = useAuth();
  const { prefs, update } = useRpgPreferences();
  const { seen } = useCodexActions();
  const reduce = useReducedMotion() || prefs.animations !== "full";
  const [levelUps, setLevelUps] = useState<Notice[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const key = `lifeos.codex.attrLevels.${user.id}`;
    let prev: Record<string, number> | null = null;
    try {
      prev = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, number> | null;
    } catch {
      prev = null;
    }
    const now = Object.fromEntries(codex.attributes.map((a) => [a.key, a.level]));
    if (prev) {
      setLevelUps(
        codex.attributes
          .filter((a) => (prev?.[a.key] ?? a.level) < a.level)
          .map((a) => ({ kind: "level" as const, id: `lv-${a.key}-${a.level}`, heading: `${a.label.toUpperCase()} EVOLUIU`, name: `Nv. ${prev?.[a.key]} → Nv. ${a.level}`, detail: "Seus registros fortaleceram este atributo." })),
      );
    }
    try {
      localStorage.setItem(key, JSON.stringify(now));
    } catch {
      // Sem armazenamento: só não há animação de subida de nível.
    }
  }, [codex.attributes, user]);

  const queue = useMemo<Notice[]>(() => {
    const items: Notice[] = [
      ...levelUps,
      ...codex.relics.filter((r) => r.unlocked && !r.seen).map((r) => ({ kind: "relic" as const, id: r.id, heading: "💎 RELÍQUIA DESCOBERTA", name: r.name, detail: `Obtida por: ${r.obtainedBy}` })),
      ...codex.titles.filter((t) => t.unlocked && !t.seen).map((t) => ({ kind: "title" as const, id: t.id, heading: "👑 NOVO TÍTULO", name: t.name, detail: t.description })),
      ...codex.knowledge.filter((k) => k.unlocked && !k.seen).map((k) => ({ kind: "knowledge" as const, id: k.id, heading: "📖 NOVO CONHECIMENTO", name: k.title, detail: k.summary })),
      ...codex.discoveries.filter((d) => !d.seen).map((d) => ({ kind: "discovery" as const, id: d.id, heading: "📜 NOVA DESCOBERTA", name: d.title, detail: d.description })),
    ];
    return items.filter((i) => !dismissed.includes(`${i.kind}:${i.id}`));
  }, [codex, levelUps, dismissed]);
  const current = queue[0] ?? null;

  const close = () => {
    if (!current) return;
    setDismissed((d) => [...d, `${current.kind}:${current.id}`]);
    if (current.kind !== "level") seen.mutate({ kind: current.kind, ids: [current.id] });
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-rpg-bg/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={current.heading}>
          <motion.div className="rpg-panel rpg-panel-gold w-full max-w-sm p-6 text-center" initial={reduce ? false : { scale: 0.85, y: 10 }} animate={{ scale: 1, y: 0 }}>
            <p className="font-pixel text-sm uppercase tracking-widest text-rpg-gold">{current.heading}</p>
            {current.kind === "relic" && <img src={relicSrc(current.id)} alt="" className="pixelated mx-auto mt-3 w-20 h-20" />}
            <p className="mt-2 rpg-title text-2xl font-bold">{current.name}</p>
            <p className="mt-2 text-sm text-rpg-text/85">{current.detail}</p>
            <div className="mt-4 flex justify-center gap-2">
              {current.kind === "title" && (
                <RPGButton variant="gold" onClick={() => (update({ title: current.id }), close())}>Equipar</RPGButton>
              )}
              <RPGButton variant={current.kind === "title" ? "ghost" : "primary"} onClick={close} autoFocus>Continuar</RPGButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
