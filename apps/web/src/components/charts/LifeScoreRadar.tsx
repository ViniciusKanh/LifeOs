import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

export interface LifeScoreDimension {
  dim: string;
  value: number;
}

export function LifeScoreRadar({ data }: { data: LifeScoreDimension[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="currentColor" className="text-paper-border dark:text-ink-border" />
        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 9, fill: "currentColor" }} className="text-slate" />
        <Radar dataKey="value" stroke="#E8A33D" fill="#E8A33D" fillOpacity={0.25} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
