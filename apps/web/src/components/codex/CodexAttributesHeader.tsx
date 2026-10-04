import { BarChart3, Shield } from "lucide-react";
import { RPGProgressBar } from "@/components/rpg";
import type { CodexAttribute } from "@/services/codexService";
import { ATTR_UI, CODEX_ATTR_HEADER } from "@/utils/codexDisplay";

/** Cabeçalho da aba Atributos com o painel "Nível do atributo" (do atributo em foco). */
export function CodexAttributesHeader({ attr }: { attr: CodexAttribute | null }) {
  const tone = attr ? ATTR_UI[attr.key].tone : "purple";
  return (
    <section className="rpg-panel rpg-panel-gold relative overflow-hidden">
      <img src={CODEX_ATTR_HEADER} alt="" aria-hidden decoding="async" className="pixelated absolute inset-0 w-full h-full object-cover object-right" />
      <div className="absolute inset-0 bg-gradient-to-r from-rpg-bg via-rpg-bg/70 to-rpg-bg/10" aria-hidden />
      <div className="relative grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)] md:items-center">
        <div className="flex items-start gap-3 min-w-0">
          <BarChart3 size={34} className="shrink-0 text-rpg-gold-light" aria-hidden />
          <div className="min-w-0">
            <h2 className="rpg-title text-2xl font-bold">Atributos</h2>
            <p className="text-sm text-rpg-text/85 max-w-md">Seus pilares de evolução. Cada atributo representa uma força que você desenvolve na sua jornada.</p>
          </div>
        </div>
        <div className="rpg-panel bg-rpg-bg/85 p-3" aria-live="polite">
          <p className="font-pixel text-[10px] uppercase tracking-wider text-rpg-gold">Nível do atributo{attr ? ` · ${attr.label}` : ""}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="relative shrink-0 flex w-11 h-12 items-center justify-center text-rpg-gold-light" aria-hidden>
              <Shield size={44} strokeWidth={1.5} className="absolute inset-0 m-auto" />
              <span className="relative font-pixel text-lg">{attr?.level ?? "—"}</span>
            </span>
            <div className="min-w-0 flex-1">
              {attr ? (
                <>
                  <RPGProgressBar tone={tone} label={`Progresso de ${attr.label}`} value={attr.xp - attr.levelStartXp} max={attr.nextLevelXp - attr.levelStartXp} showLabel={false} />
                  <p className="mt-1 font-pixel text-xs text-rpg-text">{attr.xp - attr.levelStartXp} / {attr.nextLevelXp - attr.levelStartXp} XP</p>
                </>
              ) : (
                <p className="text-xs text-rpg-muted">Dados insuficientes.</p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-rpg-muted">Continue desenvolvendo seus hábitos e missões para fortalecer seus atributos.</p>
        </div>
      </div>
    </section>
  );
}
