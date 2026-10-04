import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { SlidersHorizontal } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { RPGButton, RPGPanel } from "@/components/rpg";
import { rpgColor } from "@/components/rpg/rpgAssets";
import type { BuildOverview } from "@/services/buildService";

/** Radar vetorial Atual (roxo) × Desejada (dourado), com tabela textual equivalente. */
export function CharacterBuildRadar({ data, onAdjust }: { data: BuildOverview; onAdjust: () => void }) {
  const reduce = useReducedMotion();
  const rows = data.gaps.map((g) => ({ attr: g.label, atual: g.current, desejada: g.target }));
  return (
    <RPGPanel
      title="Build desejada"
      variant="gold"
      className="h-full"
      actions={
        <RPGButton variant="ghost" className="!px-2 !py-1" onClick={onAdjust} aria-label="Ajustar build desejada">
          <SlidersHorizontal size={14} aria-hidden />
        </RPGButton>
      }
    >
      <p className="font-rpg text-lg font-bold text-rpg-text -mt-1">{data.desired.name}</p>
      <div className="h-[230px] sm:h-[250px]" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="70%">
            <PolarGrid stroke={rpgColor("border")} />
            <PolarAngleAxis dataKey="attr" tick={{ fill: rpgColor("muted-text"), fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Desejada" dataKey="desejada" stroke={rpgColor("gold")} fill={rpgColor("gold")} fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} />
            <Radar name="Atual" dataKey="atual" stroke={rpgColor("purple")} fill={rpgColor("purple")} fillOpacity={0.35} strokeWidth={2} isAnimationActive={!reduce} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Atual e desejada por atributo</caption>
        <thead>
          <tr>
            <th>Atributo</th>
            <th>Atual</th>
            <th>Desejada</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.attr}>
              <td>{r.attr}</td>
              <td>{r.atual}</td>
              <td>{r.desejada}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="flex items-center justify-center gap-4 text-xs text-rpg-text">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rpg-purple" aria-hidden /> Atual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-rpg-gold" aria-hidden /> Desejada
        </span>
      </p>
      <RPGButton variant="secondary" className="mt-2 w-full justify-center" onClick={onAdjust}>
        Ajustar build desejada
      </RPGButton>
    </RPGPanel>
  );
}
