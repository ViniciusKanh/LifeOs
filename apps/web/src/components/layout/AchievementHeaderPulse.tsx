import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Trophy } from "lucide-react";
import { ACHIEVEMENT_CREATED_EVENT, ACHIEVEMENT_UNLOCKED_EVENT } from "@/services/achievementsService";
import { useAchievements } from "@/hooks/useAchievements";
import { useCustomAchievements } from "@/hooks/useCustomAchievements";
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { achievements } = useAchievements();
  const { trophies } = useCustomAchievements();
  const all = [...achievements, ...trophies];
  const achieved = all.filter((entry) => entry.unlockedAt).sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt))).slice(0, 5);
  const close = all.filter((entry) => !entry.unlockedAt && entry.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 4);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    function onUnlocked(event: Event) {
      const detail = (event as CustomEvent<Array<Achievement | CustomAchievement>>).detail;
      if (detail?.length) {
        setItem(toHeaderEvent(detail[0], "unlocked"));
        setOpen(true);
      }
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

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={item?.title ?? "Conquistas"}
        className={`flex h-9 max-w-[220px] items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors ${item ? "animate-pulse border-brand-500/30 bg-brand-500 text-white" : "border-paper-border text-slate hover:border-brand-500/50 hover:text-brand-600 dark:border-ink-border"}`}
      >
        <Trophy size={15} /> <span className="truncate">{item ? `${item.kind === "unlocked" ? "Destravada" : "Criada"}: ${item.title}` : "Conquistas"}</span>
      </button>
      {open && <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-paper-border bg-paper-raised shadow-xl dark:border-ink-border dark:bg-ink-raised">
        <div className="flex items-center justify-between border-b border-paper-border px-4 py-3 dark:border-ink-border"><p className="text-sm font-semibold">Suas conquistas</p><span className="text-xs text-slate">{all.filter((entry) => entry.unlockedAt).length}/{all.length}</span></div>
        <div className="max-h-96 overflow-y-auto px-4 py-3">
          {item?.kind === "unlocked" && <p className="mb-3 flex items-center gap-2 rounded-md bg-growth/10 p-2 text-xs font-semibold text-growth"><Sparkles size={14} /> {item.title} desbloqueada!</p>}
          <p className="mb-2 text-[11px] font-semibold uppercase text-slate">Conquistadas</p>
          {achieved.length ? achieved.map((entry) => <div key={entry.id} className="flex items-center gap-2 py-1.5 text-xs"><Trophy size={14} className="shrink-0 text-signal" /><span className="truncate font-medium">{entry.title}</span></div>) : <p className="mb-3 text-xs text-slate">Sua primeira conquista aparecerá aqui.</p>}
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase text-slate">Quase lá</p>
          {close.length ? close.map((entry) => <div key={entry.id} className="mb-2"><div className="flex justify-between gap-2 text-xs"><span className="truncate">{entry.title}</span><span className="font-semibold">{entry.progress}%</span></div><div className="mt-1 h-1.5 rounded-full bg-paper-border dark:bg-ink-border"><div className="h-full rounded-full bg-brand-500" style={{ width: `${entry.progress}%` }} /></div></div>) : <p className="text-xs text-slate">Continue registrando seu progresso.</p>}
        </div>
        <Link to="/conquistas" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-paper-border px-4 py-3 text-xs font-semibold text-brand-600 dark:border-ink-border">Ver todas <ArrowRight size={14} /></Link>
      </div>}
    </div>
  );
}
