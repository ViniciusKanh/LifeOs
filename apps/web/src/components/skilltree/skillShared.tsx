import type { ReactNode } from "react";
import clsx from "clsx";
import {
  AlarmClock, BarChart3, BatteryCharging, BatteryMedium, BedDouble, BookOpen, Brain, CalendarCheck, Castle, ClipboardList, Compass, Crown, Droplets, Dumbbell, Eye, Feather,
  FileSignature, Flag, Flower, Flower2, FolderKanban, Footprints, Gem, GraduationCap, Heart, HeartPulse, Hourglass, Landmark, LayoutGrid, Leaf, Library, ListOrdered, Map as MapIcon,
  Microscope, Moon, Network, RefreshCw, Repeat, Scale, Shield, ShieldPlus, Sparkle, Sparkles, Sun, Swords, Target, Timer, Wand2, Waves, Workflow, Zap, type LucideIcon,
} from "lucide-react";
import { ApiError } from "@/services/api";
import type { SkillBranch, SkillState } from "@/services/skillTreeService";

export const SKILL_ART = "/assets/rpg/modules/skilltree";
export type Notify = (m: string, tone?: "success" | "error") => void;
export const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);
export const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold";

export const SKILL_ICONS: Record<string, LucideIcon> = {
  Zap, CalendarCheck, Repeat, ListOrdered, AlarmClock, Swords, Workflow, Crown, HeartPulse, Droplets, Footprints, Moon, Dumbbell, BatteryCharging, Scale, Sparkles, BookOpen, Library, Compass,
  Brain, RefreshCw, Microscope, BarChart3, Wand2, Target, Timer, Hourglass, LayoutGrid, Shield, Waves, Eye, Gem, Map: MapIcon, Flag, FolderKanban, FileSignature, Castle, ClipboardList, Network,
  Flower2, Heart, BedDouble, Feather, Sun, BatteryMedium, Leaf, Flower, ShieldPlus, Sparkle, Landmark, GraduationCap,
};
export const skillIcon = (name: string) => SKILL_ICONS[name] ?? Sparkles;

/** Cor de cada ramo como variável do tema (usada no SVG e nas barras). */
export const BRANCH_VAR: Record<SkillBranch, string> = { produtividade: "--rpg-blue", saude: "--rpg-pink", aprendizado: "--rpg-purple", foco: "--rpg-red", gestao: "--rpg-green", bemestar: "--rpg-cyan", avancada: "--rpg-gold" };
export const branchColor = (b: SkillBranch, alpha = 1) => `rgb(var(${BRANCH_VAR[b]}) / ${alpha})`;
export const BRANCH_ICON: Record<SkillBranch, LucideIcon> = { produtividade: Zap, saude: Heart, aprendizado: BookOpen, foco: Target, gestao: Network, bemestar: Flower2, avancada: Sparkles };
export const BRANCH_TEXT: Record<SkillBranch, string> = {
  produtividade: "text-rpg-blue",
  saude: "text-rpg-pink",
  aprendizado: "text-rpg-purple",
  foco: "text-rpg-red",
  gestao: "text-rpg-green",
  bemestar: "text-rpg-cyan",
  avancada: "text-rpg-gold-light",
};
export const STATE_TONE: Record<SkillState, string> = {
  bloqueada: "border-rpg-border text-rpg-muted",
  disponivel: "border-rpg-gold/70 bg-rpg-gold/10 text-rpg-gold-light",
  indisponivel: "border-rpg-orange/60 bg-rpg-orange/10 text-rpg-orange",
  desbloqueada: "border-rpg-blue/60 bg-rpg-blue/10 text-rpg-blue",
  em_evolucao: "border-rpg-green/60 bg-rpg-green/10 text-rpg-green",
  maximizada: "border-rpg-gold bg-rpg-gold/20 text-rpg-gold-light",
};
export const TYPE_LABEL: Record<string, string> = {
  "focus.preset": "Ritual de foco",
  "missions.template": "Modelo de missão",
  "habits.template": "Modelo de hábito",
  "goals.template": "Modelo de meta",
  "projects.template": "Modelo de projeto",
  "diary.prompts": "Reflexões guiadas",
  "grimoire.session": "Sessão do Grimório",
  "agenda.blocks": "Planejador de blocos",
  "analysis.panel": "Análise",
  "codex.title": "Título",
};

export function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide", className)} style={{ borderRadius: 2 }}>
      {children}
    </span>
  );
}

/** Barra segmentada (estilo HUD) — um segmento por nível. */
export function Segments({ value, max, tone = "--rpg-purple", className }: { value: number; max: number; tone?: string; className?: string }) {
  return (
    <span className={clsx("flex gap-1", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className="h-2.5 flex-1 border border-rpg-border" style={{ borderRadius: 1, background: i < value ? `linear-gradient(180deg, rgb(var(${tone}) / 1), rgb(var(${tone}) / 0.65))` : "rgb(var(--rpg-bg))" }} />
      ))}
    </span>
  );
}

export function Box({ title, icon, action, children, className, gold }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; gold?: boolean }) {
  return (
    <section className={clsx("rpg-panel p-3", gold && "rpg-panel-gold", className)} aria-label={title}>
      <header className="mb-2.5 flex items-center gap-2">
        {icon && (
          <span className="text-rpg-gold" aria-hidden>
            {icon}
          </span>
        )}
        <h2 className="font-pixel text-[12px] uppercase tracking-wider text-rpg-gold-light">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}
