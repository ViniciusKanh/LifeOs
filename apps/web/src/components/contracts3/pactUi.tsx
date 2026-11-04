import clsx from "clsx";
import { Lock } from "lucide-react";
import type { Difficulty } from "@/types";
import { RISK_LABEL, type RiskLevel, type SealCode } from "@/services/contractGuildService";

export const ART = "/assets/rpg/modules/contracts3";

/** Ilustração do card pela categoria (arte do protótipo aprovado). */
export function pactArt(category: string | null): string {
  if (category === "estudos" || category === "leitura") return `${ART}/card-study.webp`;
  if (category === "saude" || category === "relacionamentos") return `${ART}/card-quest.webp`;
  return `${ART}/card-scroll.webp`;
}

export function SealIcon({ code, size = 32, locked = false }: { code: SealCode; size?: number; locked?: boolean }) {
  if (locked)
    return (
      <span className="flex shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg-2 text-rpg-muted" style={{ width: size, height: size, borderRadius: 999 }} aria-hidden>
        <Lock size={Math.round(size * 0.4)} />
      </span>
    );
  return <img src={`${ART}/seal-${code}.webp`} alt="" aria-hidden className="pixelated shrink-0" style={{ width: size, height: size }} />;
}

const DIFF_LEVEL: Record<Difficulty, number> = { facil: 1, medio: 2, dificil: 3, epico: 4 };
export function DifficultyGems({ difficulty }: { difficulty: Difficulty }) {
  const n = DIFF_LEVEL[difficulty];
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Dificuldade ${n} de 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={clsx("inline-block h-2 w-2 rotate-45", i <= n ? "bg-rpg-orange" : "bg-rpg-border")} aria-hidden />
      ))}
    </span>
  );
}

const RISK_TONE: Record<RiskLevel, { bar: string; text: string; seg: number }> = {
  baixo: { bar: "bg-rpg-green", text: "text-rpg-green", seg: 3 },
  moderado: { bar: "bg-rpg-orange", text: "text-rpg-orange", seg: 6 },
  alto: { bar: "bg-rpg-red", text: "text-rpg-red", seg: 9 },
  sem_dados: { bar: "bg-rpg-muted", text: "text-rpg-muted", seg: 0 },
};

/** Medidor do risco de quebra — categoria explicável, nunca probabilidade. */
export function RiskMeter({ level, reasons, compact }: { level: RiskLevel; reasons: string[]; compact?: boolean }) {
  const t = RISK_TONE[level];
  return (
    <div className={clsx("min-w-0", compact && "border border-rpg-border bg-rpg-bg-2/60 p-2")} style={compact ? { borderRadius: 3 } : undefined}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-0.5" role="img" aria-label={`Risco de quebra: ${RISK_LABEL[level]}`}>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={clsx("h-2.5 flex-1", i < t.seg ? t.bar : "bg-rpg-border/60")} />
          ))}
        </div>
        <span className={clsx("font-rpg text-sm font-bold", t.text)}>{RISK_LABEL[level]}</span>
      </div>
      <ul className="mt-1 space-y-0.5 text-[11px] text-rpg-muted">
        {reasons.slice(0, compact ? 2 : 4).map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}
