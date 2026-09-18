import { Activity, BookOpen, Droplets, Dumbbell, FlaskConical, GraduationCap, HeartPulse, Moon, Repeat, Sparkles, Target } from "lucide-react";
import type { ExperimentCategory, ExperimentMetricKey, ExperimentStatus } from "@/types";

/**
 * Rótulos de exibição no frontend — espelham o catálogo central do
 * backend (experimentMetricsService.ts). Mantidos aqui só para não
 * esperar uma requisição de rede pra desenhar um rótulo estático;
 * a disponibilidade real de cada métrica (hasHistory) sempre vem do
 * backend via /experiments/metrics/catalog.
 */
export const CATEGORY_METRIC_LABEL: Record<ExperimentMetricKey, string> = {
  sleep_duration: "Sono (duração)",
  sleep_quality: "Qualidade do sono",
  energy: "Energia",
  mood: "Humor",
  stress: "Estresse",
  water_ml: "Água",
  focus_minutes: "Foco (minutos)",
  focus_sessions: "Sessões de Focus",
  exercise_minutes: "Exercício (minutos)",
  exercise_sessions: "Atividades físicas",
  reading_pages: "Páginas lidas",
  reading_minutes: "Leitura (minutos)",
  study_minutes: "Estudo (minutos)",
  tasks_completed: "Tarefas concluídas",
  habit_consistency: "Consistência do hábito",
};

export const CATEGORY_LABEL: Record<ExperimentCategory, string> = {
  saude: "Saúde",
  sono: "Sono",
  exercicio: "Exercício",
  hidratacao: "Hidratação",
  produtividade: "Produtividade",
  focus: "Focus",
  educacao: "Educação",
  leitura: "Leitura",
  habitos: "Hábitos",
  bem_estar: "Bem-estar",
  personalizado: "Personalizado",
};

export const CATEGORY_ICON: Record<ExperimentCategory, typeof HeartPulse> = {
  saude: HeartPulse,
  sono: Moon,
  exercicio: Dumbbell,
  hidratacao: Droplets,
  produtividade: Activity,
  focus: Target,
  educacao: GraduationCap,
  leitura: BookOpen,
  habitos: Repeat,
  bem_estar: Sparkles,
  personalizado: FlaskConical,
};

export const STATUS_LABEL_PT: Record<ExperimentStatus, string> = {
  draft: "Rascunho",
  active: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
