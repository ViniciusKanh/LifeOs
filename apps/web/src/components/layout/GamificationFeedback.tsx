import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Crown, Sparkles } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useRpgPreferences } from "@/hooks/useRpgPreferences";
import { useGamificationProfile } from "@/hooks/useGamification";
import { GAMIFICATION_REFRESH_EVENT, type PlayerEvent } from "@/services/gamificationService";
import { RPGButton } from "@/components/rpg";

interface Burst {
  key: string;
  xp: number;
  coins: number;
  title: string;
  stamp: "mission" | "contract" | null;
  detail: string | null;
}

/** Título da explosão a partir dos eventos novos (missão, hábito, contrato ou genérico). */
function describe(events: PlayerEvent[]): Omit<Burst, "key" | "xp" | "coins"> {
  const main = events.find((e) => e.eventType === "completed" || e.eventType === "fulfilled" || e.eventType === "session" || e.eventType === "first_entry") ?? events[0];
  if (main.sourceType === "task") return { title: "MISSÃO CONCLUÍDA", stamp: "mission", detail: main.label?.replace(/^Missão concluída: /, "") ?? null };
  if (main.sourceType === "habit_entry") return { title: "HÁBITO CUMPRIDO", stamp: "contract", detail: main.label?.replace(/^Hábito cumprido: /, "") ?? null };
  if (main.sourceType === "project") return { title: "PROJETO CONCLUÍDO", stamp: "mission", detail: main.label?.replace(/^(Campanha|Projeto) concluíd[oa]: /, "") ?? null };
  if (main.sourceType === "campaign")
    return { title: main.eventType === "completed" ? "CAMPANHA CONCLUÍDA" : "MARCO CONQUISTADO", stamp: "mission", detail: main.label?.replace(/^(Campanha concluída|Marco da campanha): /, "") ?? null };
  if (main.sourceType === "contract") return { title: "CONTRATO SELADO", stamp: "mission", detail: main.label?.replace(/^Contrato cumprido: /, "") ?? null };
  if (main.sourceType === "experiment")
    return {
      title: main.eventType === "concluded" ? "ESTÁ VIVO!" : main.eventType === "started" ? "CRIATURA GANHOU VIDA" : "LABORATÓRIO",
      stamp: null,
      detail: main.label,
    };
  if (main.sourceType === "achievement") return { title: "CONQUISTA DESBLOQUEADA", stamp: "mission", detail: main.label?.replace(/^Conquista: /, "") ?? null };
  if (main.sourceType === "life_admin") return { title: "ITEM RESOLVIDO", stamp: "contract", detail: main.label?.replace(/^Resolvido: /, "") ?? null };
  if (main.sourceType === "habit_streak") return { title: "MARCO DE SEQUÊNCIA", stamp: "contract", detail: main.label };
  if (main.sourceType === "review") return { title: "CICLO CONCLUÍDO", stamp: "mission", detail: main.label };
  if (main.sourceType === "focus") return { title: "FOCO REGISTRADO", stamp: null, detail: main.label };
  if (main.sourceType === "journal") return { title: "CRÔNICA REGISTRADA", stamp: null, detail: null };
  return { title: "BÔNUS", stamp: null, detail: main.label };
}

/**
 * Feedback global da gamificação (só no tema RPG): escuta o evento de
 * "ação persistida", recarrega o perfil e anima APENAS os eventos de XP
 * que ainda não tinham sido vistos nesta sessão (+XP, +moedas, selo e
 * subida de nível). Nada é animado antes do backend confirmar.
 */
export function GamificationFeedback() {
  const { isRpg } = useTheme();
  const qc = useQueryClient();
  const { prefs } = useRpgPreferences();
  // Preferência do usuário soma-se ao prefers-reduced-motion do sistema.
  const reduce = useReducedMotion() || prefs.animations === "reduced";
  const silent = !prefs.gamification || prefs.animations === "off";
  const { data } = useGamificationProfile(isRpg);
  const seen = useRef<Set<string> | null>(null);
  const lastLevel = useRef<number | null>(null);
  const [burst, setBurst] = useState<Burst | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    if (!isRpg) return;
    const onRefresh = () => {
      // Pequeno atraso para cobrir hooks encadeados no backend (ex.: hábito vinculado).
      window.setTimeout(() => qc.invalidateQueries({ queryKey: ["gamification"] }), 150);
    };
    window.addEventListener(GAMIFICATION_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(GAMIFICATION_REFRESH_EVENT, onRefresh);
  }, [isRpg, qc]);

  useEffect(() => {
    if (!data) return;
    // Primeira carga: tudo que já existe conta como "visto".
    if (seen.current === null) {
      seen.current = new Set(data.recentEvents.map((e) => e.id));
      lastLevel.current = data.level;
      return;
    }
    const fresh = data.recentEvents.filter((e) => !seen.current!.has(e.id));
    fresh.forEach((e) => seen.current!.add(e.id));
    if (fresh.length > 0 && !silent) {
      setBurst({
        key: fresh[0].id,
        xp: fresh.reduce((a, e) => a + e.xp, 0),
        coins: fresh.reduce((a, e) => a + e.coins, 0),
        ...describe(fresh),
      });
    }
    if (lastLevel.current !== null && data.level > lastLevel.current && !silent) setLevelUp(data.level);
    lastLevel.current = data.level;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(null), reduce ? 2600 : 2200);
    return () => window.clearTimeout(t);
  }, [burst, reduce]);

  if (!isRpg) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4" aria-live="polite">
        <AnimatePresence>
          {burst && (
            <motion.div
              key={burst.key}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -24 }}
              transition={{ duration: 0.28 }}
              className="rpg-panel rpg-panel-gold relative flex items-center gap-4 px-4 py-3 max-w-md w-full"
              role="status"
            >
              {!reduce && (
                <motion.span
                  className="absolute inset-0 bg-rpg-gold/20"
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  aria-hidden
                />
              )}
              {burst.stamp && (
                <motion.span
                  initial={reduce ? false : { scale: 2.2, rotate: -18, opacity: 0 }}
                  animate={{ scale: 1, rotate: -8, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className={`shrink-0 border-2 px-1.5 py-1 font-pixel text-[10px] leading-tight text-center ${burst.stamp === "contract" ? "border-rpg-green text-rpg-green" : "border-rpg-gold text-rpg-gold-light"}`}
                  style={{ borderRadius: 3 }}
                  aria-hidden
                >
                  {burst.title === "ITEM RESOLVIDO" ? "RESOLVIDO" : burst.stamp === "contract" ? "CUMPRIDO" : "FEITO"}
                </motion.span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-pixel text-sm tracking-wider text-rpg-gold-light">{burst.title}</p>
                {burst.detail && <p className="text-xs text-rpg-muted truncate">{burst.detail}</p>}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <motion.span
                  initial={reduce ? false : { y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-1 font-pixel text-base text-rpg-purple"
                >
                  <Sparkles size={14} aria-hidden /> +{burst.xp} XP
                </motion.span>
                {burst.coins > 0 && (
                  <motion.span
                    initial={reduce ? false : { y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="inline-flex items-center gap-1 font-pixel text-sm text-rpg-gold-light"
                  >
                    <Coins size={13} aria-hidden /> +{burst.coins}
                  </motion.span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {levelUp != null && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLevelUp(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Você subiu para o nível ${levelUp}`}
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="rpg-panel rpg-panel-legendary flex flex-col items-center text-center gap-3 px-8 py-7 max-w-sm w-full"
            >
              <motion.span
                animate={reduce ? undefined : { y: [0, -6, 0] }}
                transition={{ duration: 1.6, repeat: 2 }}
                className="w-16 h-16 flex items-center justify-center border-2 border-rpg-gold bg-rpg-gold/15 text-rpg-gold-light"
                style={{ borderRadius: 4 }}
                aria-hidden
              >
                <Crown size={34} />
              </motion.span>
              <p className="font-pixel text-xl tracking-widest text-rpg-gold-light">LEVEL UP!</p>
              <p className="rpg-title text-3xl font-bold">Nível {levelUp}</p>
              <p className="text-sm text-rpg-muted">Sua jornada avançou com ações reais registradas no LifeOS.</p>
              <RPGButton variant="gold" onClick={() => setLevelUp(null)} autoFocus>
                Continuar
              </RPGButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
