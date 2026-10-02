import { Droplets, Dumbbell, HeartPulse, Moon, Sun } from "lucide-react";
import { RPGPanel, RPGProgressBar, RPGProgressRing } from "@/components/rpg";

/**
 * "Atributos do personagem" da tela Saúde no tema RPG. Mostra exatamente os
 * mesmos números do herói clássico (calculados na SaudePage): a vitalidade é
 * a média dos quatro cuidados do dia, não uma pontuação médica.
 */
export function RpgHealthAttributes({
  vitalityScore,
  waterPct,
  sleepPct,
  workoutsPct,
  moodPct,
  isToday,
}: {
  vitalityScore: number;
  waterPct: number;
  sleepPct: number;
  workoutsPct: number;
  moodPct: number;
  isToday: boolean;
}) {
  const rows = [
    { key: "water", label: "Poção de água", hint: "meta 2,5 L", value: waterPct, tone: "blue" as const, icon: <Droplets size={14} /> },
    { key: "sleep", label: "Descanso (sono)", hint: "8 h ou qualidade 5/5", value: sleepPct, tone: "purple" as const, icon: <Moon size={14} /> },
    { key: "move", label: "Movimento", hint: "exercício registrado", value: workoutsPct, tone: "green" as const, icon: <Dumbbell size={14} /> },
    { key: "mood", label: "Check-in de humor", hint: "humor e energia", value: moodPct, tone: "gold" as const, icon: <Sun size={14} /> },
  ];
  return (
    <RPGPanel title="Atributos do personagem" icon={<HeartPulse size={14} />} variant="gold" className="h-full">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="rpg-parchment mx-1.5 my-1.5 flex flex-col items-center px-4 py-3 shrink-0">
          <RPGProgressRing value={vitalityScore} size={110} tone="green" label={isToday ? "Vitalidade de hoje" : "Vitalidade do dia"} />
          <p className="mt-1.5 font-pixel text-xs font-bold uppercase tracking-wide text-rpg-ink/80">{isToday ? "Vitalidade de hoje" : "Vitalidade do dia"}</p>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2.5">
              <span className="inline-flex w-7 h-7 shrink-0 items-center justify-center border-2 border-rpg-border bg-rpg-bg text-rpg-gold-light" style={{ borderRadius: 3 }} aria-hidden>
                {r.icon}
              </span>
              <RPGProgressBar className="flex-1" tone={r.tone} label={`${r.label} · ${r.hint}`} value={r.value} />
            </div>
          ))}
          <p className="text-[10px] text-rpg-muted">Vitalidade = média dos quatro cuidados do dia. Referência de hábitos, não avaliação médica.</p>
        </div>
      </div>
    </RPGPanel>
  );
}
