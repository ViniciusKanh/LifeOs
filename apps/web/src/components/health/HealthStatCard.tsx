import type React from "react";
import { Card, IconBadge } from "@/components/ui/primitives";

const TONE_BAR: Record<string, string> = {
  blue: "bg-cat-blue dark:bg-cat-blue-dark",
  purple: "bg-cat-purple dark:bg-cat-purple-dark",
  green: "bg-cat-green dark:bg-cat-green-dark",
  amber: "bg-signal",
};

const BADGE_TONE: Record<string, string> = {
  green: "bg-growth/10 text-growth",
  amber: "bg-signal/15 text-signal-deep dark:text-signal",
  slate: "bg-slate/10 text-slate",
};

export interface HealthBadge {
  label: string;
  tone: "green" | "amber" | "slate";
}

export interface MiniSeriesPoint {
  label: string;
  value: number;
}

export function HealthStatCard({
  tone,
  icon,
  label,
  value,
  badge,
  progressPct,
  caption,
  weekly,
}: {
  tone: "blue" | "purple" | "green" | "amber";
  icon: React.ReactNode;
  label: string;
  value: string;
  badge: HealthBadge;
  progressPct?: number;
  caption: string;
  weekly: MiniSeriesPoint[];
}) {
  const maxVal = Math.max(1, ...weekly.map((day) => day.value));
  return (
    <Card className="min-w-[210px] p-4 sm:min-w-0">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconBadge tone={tone} icon={icon} size={32} />
          <span className="truncate text-xs text-slate">{label}</span>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${BADGE_TONE[badge.tone]}`}>
          {badge.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold leading-none">{value}</p>
          <p className="mt-1.5 truncate text-[11px] text-slate">{caption}</p>
        </div>
        <div className="flex h-7 shrink-0 items-end gap-[3px]">
          {weekly.map((day) => (
            <div
              key={day.label}
              className={`w-1.5 rounded-t-sm ${day.value > 0 ? TONE_BAR[tone] : "bg-paper-border dark:bg-ink-border"}`}
              style={{ height: `${Math.max(2, (day.value / maxVal) * 28)}px` }}
              title={`${day.label}: ${day.value.toFixed(1)}`}
            />
          ))}
        </div>
      </div>

      {progressPct !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-border dark:bg-ink-border">
          <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${Math.min(100, progressPct)}%` }} />
        </div>
      )}
    </Card>
  );
}

export function WaterRing({ pct }: { pct: number }) {
  const size = 96;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} className="stroke-paper-border dark:stroke-ink-border" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeLinecap="round"
        className="stroke-cat-blue transition-[stroke-dashoffset] duration-500"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
