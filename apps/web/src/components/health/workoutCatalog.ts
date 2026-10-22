import type { LucideIcon } from "lucide-react";
import {
  Accessibility,
  Activity,
  Bike,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  PersonStanding,
  Swords,
  Target,
  Users,
  Waves,
  Wind,
  Zap,
} from "lucide-react";
import type { FightModality, Workout, WorkoutCategory, WorkoutSet } from "@/types";
import { formatPace, paceMinPerKm, strengthVolumeKg, workoutCategoryOf } from "@/utils/workoutStats";

/**
 * Catálogo de tipos de exercício: rótulo, ícone e quais campos opcionais
 * fazem sentido. O formulário mostra só os campos do grupo escolhido.
 *  - strength: treino/grupo muscular + lista de séries
 *  - fight:    modalidade + rounds
 *  - cardio:   distância (e pace calculado)
 */
export type WorkoutFieldGroup = "strength" | "fight" | "cardio" | "general";

export interface WorkoutTypeMeta {
  key: WorkoutCategory;
  label: string;
  icon: LucideIcon;
  group: WorkoutFieldGroup;
}

export const WORKOUT_TYPES: WorkoutTypeMeta[] = [
  { key: "musculacao", label: "Musculação", icon: Dumbbell, group: "strength" },
  { key: "luta", label: "Luta", icon: Swords, group: "fight" },
  { key: "corrida", label: "Corrida", icon: Footprints, group: "cardio" },
  { key: "caminhada", label: "Caminhada", icon: PersonStanding, group: "cardio" },
  { key: "bike", label: "Bike", icon: Bike, group: "cardio" },
  { key: "natacao", label: "Natação", icon: Waves, group: "cardio" },
  { key: "crossfit", label: "Crossfit", icon: Flame, group: "general" },
  { key: "funcional", label: "Funcional", icon: Target, group: "general" },
  { key: "hiit", label: "HIIT", icon: Zap, group: "general" },
  { key: "pilates", label: "Pilates", icon: Accessibility, group: "general" },
  { key: "yoga", label: "Yoga", icon: Flower2, group: "general" },
  { key: "alongamento", label: "Alongamento", icon: Wind, group: "general" },
  { key: "esporte_coletivo", label: "Esporte coletivo", icon: Users, group: "cardio" },
  { key: "outro", label: "Outro", icon: Activity, group: "general" },
];

const BY_KEY = new Map(WORKOUT_TYPES.map((t) => [t.key, t]));

export function workoutTypeMeta(category: WorkoutCategory): WorkoutTypeMeta {
  return BY_KEY.get(category) ?? WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
}

export const FIGHT_MODALITIES: Array<{ key: FightModality; label: string }> = [
  { key: "muay_thai", label: "Muay Thai" },
  { key: "jiu_jitsu", label: "Jiu-jitsu" },
  { key: "boxe", label: "Boxe" },
  { key: "mma", label: "MMA" },
  { key: "judo", label: "Judô" },
  { key: "kickboxing", label: "Kickboxing" },
  { key: "karate", label: "Karatê" },
  { key: "wrestling", label: "Wrestling" },
  { key: "outra", label: "Outra" },
];

export function fightModalityLabel(modality: FightModality | null | undefined) {
  return FIGHT_MODALITIES.find((m) => m.key === modality)?.label ?? null;
}

/** Faixas da escala de esforço percebido (RPE 1–10) para orientar quem registra. */
export function rpeLabel(rpe: number) {
  if (rpe <= 2) return "Muito leve";
  if (rpe <= 4) return "Leve";
  if (rpe <= 6) return "Moderado";
  if (rpe <= 8) return "Difícil";
  return "Máximo";
}

/** Sugestões rápidas de treino de musculação (o campo continua livre). */
export const STRENGTH_SPLIT_SUGGESTIONS = ["Treino A", "Treino B", "Treino C", "Peito", "Costas", "Pernas", "Ombros", "Braços", "Full body"];

/** Texto legível de um treino para listas/histórico (sem inventar campos ausentes). */
export function describeWorkout(w: Workout): { title: string; details: string[] } {
  const category = workoutCategoryOf(w);
  const meta = workoutTypeMeta(category);
  const modality = fightModalityLabel(w.modality);
  const title = [meta.label === "Outro" && w.kind && w.kind !== "Outro" ? w.kind : meta.label, modality, w.muscle_groups].filter(Boolean).join(" · ");
  const details: string[] = [];
  if (w.duration_minutes) details.push(`${w.duration_minutes} min`);
  if (w.rpe) details.push(`RPE ${w.rpe}`);
  else if (w.intensity) details.push(w.intensity);
  if (w.rounds) details.push(w.round_minutes ? `${w.rounds}×${w.round_minutes} min` : `${w.rounds} rounds`);
  if (w.distance_km) {
    details.push(`${w.distance_km.toLocaleString("pt-BR")} km`);
    const pace = formatPace(paceMinPerKm(w.duration_minutes, w.distance_km));
    if (pace && meta.group === "cardio") details.push(pace);
  }
  const sets = w.sets ?? [];
  if (sets.length > 0) {
    details.push(`${sets.length} ${sets.length === 1 ? "exercício" : "exercícios"}`);
    const volume = strengthVolumeKg(w);
    if (volume > 0) details.push(`${Math.round(volume).toLocaleString("pt-BR")} kg de volume`);
  }
  return { title, details };
}

/** "4×10 · 60 kg" para uma linha de série. */
export function describeSet(s: WorkoutSet): string {
  const parts: string[] = [];
  if (s.sets && s.reps) parts.push(`${s.sets}×${s.reps}`);
  else if (s.sets) parts.push(`${s.sets} séries`);
  else if (s.reps) parts.push(`${s.reps} reps`);
  if (s.load_kg !== null && s.load_kg !== undefined) parts.push(`${s.load_kg.toLocaleString("pt-BR")} kg`);
  return parts.join(" · ");
}
