import type { ReactNode } from "react";
import clsx from "clsx";
import {
  BarChart3, BookOpen, Brain, Briefcase, Calculator, Camera, Code2, Compass, Cpu, Database, Dumbbell, Flame, FlaskConical, Footprints, Globe, GraduationCap, Heart, Languages,
  Leaf, Lightbulb, Mic, Music, Palette, PenLine, Presentation, Rocket, Scale, Shield, Sparkles, Swords, Target, Terminal, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { ApiError } from "@/services/api";
import type { SkillDomain } from "@/services/personalSkillsService";

export const SKILL_ART = "/assets/rpg/modules/skilltree";
export type Notify = (m: string, tone?: "success" | "error") => void;
export const errMsg = (e: unknown, fb: string) => (e instanceof ApiError ? e.message : fb);
export const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold";

/** Mesmos nomes de config/personalSkills.ts (SKILL_ICONS) no servidor. */
export const SKILL_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, brain: Brain, code: Code2, terminal: Terminal, database: Database, chart: BarChart3, cpu: Cpu, book: BookOpen, languages: Languages, pen: PenLine,
  graduation: GraduationCap, scale: Scale, calculator: Calculator, flask: FlaskConical, globe: Globe, music: Music, palette: Palette, camera: Camera, swords: Swords,
  dumbbell: Dumbbell, footprints: Footprints, heart: Heart, flame: Flame, shield: Shield, briefcase: Briefcase, users: Users, presentation: Presentation, target: Target,
  rocket: Rocket, lightbulb: Lightbulb, wrench: Wrench, leaf: Leaf, mic: Mic, compass: Compass,
};
export const skillIcon = (name: string) => SKILL_ICONS[name] ?? Sparkles;

/** Cor de cada tronco como variável do tema (usada no SVG e nas barras). */
export const DOMAIN_VAR: Record<SkillDomain, string> = { saude: "--rpg-green", educacao: "--rpg-blue", pessoal: "--rpg-purple", trabalho: "--rpg-orange" };
export const domainColor = (d: SkillDomain, alpha = 1) => `rgb(var(${DOMAIN_VAR[d]}) / ${alpha})`;
export const DOMAIN_ICON: Record<SkillDomain, LucideIcon> = { saude: Heart, educacao: GraduationCap, pessoal: Lightbulb, trabalho: Briefcase };
export const DOMAIN_TEXT: Record<SkillDomain, string> = { saude: "text-rpg-green", educacao: "text-rpg-blue", pessoal: "text-rpg-purple", trabalho: "text-rpg-orange" };

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

/** Minutos → "3 h 20 min". */
export function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

export const fmtDate = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};
