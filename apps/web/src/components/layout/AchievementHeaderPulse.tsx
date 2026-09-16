import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Trophy } from "lucide-react";
import { ACHIEVEMENT_CREATED_EVENT, ACHIEVEMENT_UNLOCKED_EVENT } from "@/services/achievementsService";
import type { Achievement, CustomAchievement } from "@/types";

type HeaderAchievementEvent = {
  title: string;
  icon?: string | null;
  kind: "created" | "unlocked";
};

function toHeaderEvent(item: Achievement | CustomAchievement, kind: HeaderAchievementEvent["kind"]): HeaderAchievementEvent {
  return {
    title: item.title,
    icon: "icon" in item ? item.icon : null,
    kind,
  };
}

export function AchievementHeaderPulse() {
  const [item, setItem] = useState<HeaderAchievementEvent | null>(null);

  useEffect(() => {
    function onUnlocked(event: Event) {
      const detail = (event as CustomEvent<Array<Achievement | CustomAchievement>>).detail;
      if (detail?.length) setItem(toHeaderEvent(detail[0], "unlocked"));
    }

    function onCreated(event: Event) {
      const detail = (event as CustomEvent<CustomAchievement>).detail;
      if (detail) setItem(toHeaderEvent(detail, "created"));
    }

    window.addEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
    window.addEventListener(ACHIEVEMENT_CREATED_EVENT, onCreated);
    return () => {
      window.removeEventListener(ACHIEVEMENT_UNLOCKED_EVENT, onUnlocked);
      window.removeEventListener(ACHIEVEMENT_CREATED_EVENT, onCreated);
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => setItem(null), 7000);
    return () => clearTimeout(timer);
  }, [item]);

  if (!item) {
    return (
      <Link
        to="/conquistas"
        className="hidden sm:flex h-9 items-center gap-2 rounded-full border border-paper-border px-3 text-xs font-semibold text-slate transition-colors hover:border-brand-500/50 hover:text-brand-600 dark:border-ink-border dark:hover:text-brand-300"
      >
        <Trophy size={14} />
        Conquistas
      </Link>
    );
  }

  return (
    <Link
      to="/conquistas"
      className="hidden sm:flex max-w-[230px] animate-pulse items-center gap-2 rounded-full border border-brand-500/30 bg-gradient-to-r from-brand-500 to-signal px-3 py-2 text-xs font-semibold text-white shadow-glow-brand"
      title={item.title}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm">
        {item.icon && item.icon.length <= 4 ? item.icon : <Sparkles size={13} />}
      </span>
      <span className="min-w-0 truncate">{item.kind === "unlocked" ? "Destravada" : "Criada"}: {item.title}</span>
    </Link>
  );
}
