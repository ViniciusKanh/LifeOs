import { BookOpen, ClipboardList, Flame, Library, ListChecks, Lock, Rocket, Target, Timer, Trophy } from "lucide-react";
import { useAchievements } from "@/hooks/useAchievements";
import { Card } from "@/components/ui/primitives";
import type { Achievement } from "@/types";

const ICONS: Record<string, typeof Trophy> = {
  ListChecks,
  Rocket,
  Flame,
  BookOpen,
  Library,
  Timer,
  ClipboardList,
  Target,
  Trophy,
};

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const Icon = (achievement.icon && ICONS[achievement.icon]) || Trophy;
  const unlocked = !!achievement.unlockedAt;

  return (
    <Card className={`p-5 flex flex-col gap-3 ${unlocked ? "" : "opacity-70"}`}>
      <div className="flex items-start justify-between">
        <span
          className={`w-11 h-11 rounded-xl2 flex items-center justify-center ${
            unlocked ? "bg-gradient-to-br from-brand-500 to-signal text-white shadow-glow-brand" : "bg-black/[0.04] dark:bg-white/[0.06] text-slate"
          }`}
        >
          {unlocked ? <Icon size={20} /> : <Lock size={18} />}
        </span>
        {unlocked && (
          <span className="text-[10px] font-semibold text-brand-700 dark:text-brand-100 bg-brand-50 dark:bg-brand-700/20 rounded-full px-2 py-1">
            Destravada
          </span>
        )}
      </div>
      <div>
        <p className="font-display font-semibold text-base">{achievement.title}</p>
        <p className="text-xs text-slate mt-0.5">{achievement.description}</p>
      </div>
      {!unlocked && achievement.threshold ? (
        <div>
          <div className="h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-signal"
              style={{ width: `${achievement.progress}%` }}
            />
          </div>
          <p className="text-[11px] text-slate mt-1.5">{achievement.progress}% do caminho</p>
        </div>
      ) : unlocked ? (
        <p className="text-[11px] text-slate">
          Desde {new Date(achievement.unlockedAt!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "")}
        </p>
      ) : null}
    </Card>
  );
}

export function ConquistasPage() {
  const { achievements, unlocked, isLoading } = useAchievements();

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="font-display font-bold text-2xl tracking-tight">Conquistas</p>
        <p className="text-sm text-slate mt-1">
          {unlocked.length} de {achievements.length} destravadas — sempre calculadas a partir dos seus dados reais, nunca marcadas à mão.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map((a) => (
            <AchievementCard key={a.id} achievement={a} />
          ))}
        </div>
      )}
    </div>
  );
}
