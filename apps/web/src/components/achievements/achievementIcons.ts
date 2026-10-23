import { BookOpen, ClipboardList, Droplets, Dumbbell, Flame, FlaskConical, GraduationCap, Library, ListChecks, Rocket, Target, Timer, Trophy, type LucideIcon } from "lucide-react";

/** Ícone de cada conquista (o catálogo guarda o nome do ícone). Fallback: troféu. */
export const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = { ListChecks, Rocket, Flame, BookOpen, Library, Timer, ClipboardList, Target, Dumbbell, Droplets, GraduationCap, FlaskConical, Trophy };
export const achievementIcon = (name: string | null | undefined): LucideIcon => (name && ACHIEVEMENT_ICONS[name]) || Trophy;
