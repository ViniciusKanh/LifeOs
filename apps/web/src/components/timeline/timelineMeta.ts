import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  Droplets,
  Dumbbell,
  FlaskConical,
  Gift,
  Hammer,
  GraduationCap,
  Moon,
  NotebookPen,
  ReceiptText,
  ScrollText,
  Repeat,
  Smile,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import type { TimelineEvent } from "@/types";

export type TimelineType = TimelineEvent["type"];
export type ClassicTone = "blue" | "purple" | "green" | "pink" | "teal" | "amber";

/**
 * Fonte única de rótulo, ícone e cor de cada tipo de evento da Timeline
 * (usada pela Timeline e pela "Linha do dia" do Hoje). Todo tipo que o
 * backend devolve precisa estar aqui — antes, "review"/"life_admin" não
 * tinham entrada e quebravam a renderização.
 */
export const TIMELINE_META: Record<TimelineType, { tag: string; tone: ClassicTone; rpgTone: RpgTone; icon: typeof CheckCircle2 }> = {
  task: { tag: "Tarefas", tone: "blue", rpgTone: "blue", icon: CheckCircle2 },
  habit: { tag: "Hábitos", tone: "pink", rpgTone: "pink", icon: Repeat },
  workout: { tag: "Saúde", tone: "green", rpgTone: "green", icon: Dumbbell },
  reading: { tag: "Leitura", tone: "teal", rpgTone: "purple", icon: BookOpen },
  education: { tag: "Estudo", tone: "amber", rpgTone: "cyan", icon: GraduationCap },
  sleep: { tag: "Sono", tone: "purple", rpgTone: "purple", icon: Moon },
  mood: { tag: "Humor", tone: "amber", rpgTone: "orange", icon: Smile },
  water: { tag: "Água", tone: "blue", rpgTone: "blue", icon: Droplets },
  work_note: { tag: "Profissional", tone: "purple", rpgTone: "purple", icon: Briefcase },
  experiment: { tag: "Experimentos", tone: "purple", rpgTone: "purple", icon: FlaskConical },
  journal: { tag: "Diário", tone: "pink", rpgTone: "pink", icon: NotebookPen },
  life_admin: { tag: "Administração", tone: "amber", rpgTone: "orange", icon: ReceiptText },
  review: { tag: "Revisões", tone: "purple", rpgTone: "gold", icon: ClipboardCheck },
  focus: { tag: "Foco", tone: "teal", rpgTone: "cyan", icon: Timer },
  project: { tag: "Projetos", tone: "amber", rpgTone: "gold", icon: Swords },
  campaign: { tag: "Campanhas", tone: "purple", rpgTone: "gold", icon: Hammer },
  contract: { tag: "Contratos", tone: "amber", rpgTone: "gold", icon: ScrollText },
  achievement: { tag: "Conquistas", tone: "amber", rpgTone: "gold", icon: Trophy },
  reward: { tag: "Recompensas", tone: "amber", rpgTone: "gold", icon: Gift },
  level_up: { tag: "Nível", tone: "purple", rpgTone: "gold", icon: Crown },
};
