import { Moon, Smile, Zap, Timer, Dumbbell, BookOpen, CalendarDays, CloudSun, Smartphone, type LucideIcon } from "lucide-react";
import { Card, IconBadge } from "@/components/ui/primitives";
import { STATUS_LABEL, STATUS_TONE, formatSignalValue } from "./signalDisplay";
import type { SignalCard as SignalCardData } from "@/types";

const ICON: Record<string, LucideIcon> = {
  sleep: Moon,
  mood: Smile,
  energy: Zap,
  focus: Timer,
  exercise: Dumbbell,
  reading: BookOpen,
  agenda: CalendarDays,
  weather: CloudSun,
  screen_time: Smartphone,
};

const TONE: Record<string, "blue" | "purple" | "green" | "pink" | "teal" | "amber"> = {
  sleep: "purple",
  mood: "pink",
  energy: "amber",
  focus: "purple",
  exercise: "green",
  reading: "pink",
  agenda: "blue",
  weather: "teal",
  screen_time: "teal",
};

export function SignalCard({ signal }: { signal: SignalCardData }) {
  const Icon = ICON[signal.key] ?? CloudSun;
  const isUnavailable = signal.status === "not_connected";

  return (
    <Card className={`p-4 flex flex-col gap-2.5 ${isUnavailable ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <IconBadge tone={TONE[signal.key] ?? "blue"} icon={<Icon size={18} />} size={36} />
          <span className="text-sm font-medium">{signal.label}</span>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_TONE[signal.status]}`}>
          {STATUS_LABEL[signal.status]}
        </span>
      </div>
      <p className="font-display font-bold text-xl leading-none">{formatSignalValue(signal.value, signal.unit)}</p>
      <p className="text-xs text-slate leading-snug">{signal.description}</p>
      {signal.comparisonLabel && <p className="text-[11px] text-slate">{signal.comparisonLabel}</p>}
    </Card>
  );
}

export function SignalsGrid({ signals }: { signals: SignalCardData[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {signals.map((s) => (
        <SignalCard key={s.key} signal={s} />
      ))}
    </div>
  );
}
