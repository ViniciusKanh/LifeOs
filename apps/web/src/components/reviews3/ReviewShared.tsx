import type { ReactNode } from "react";
import clsx from "clsx";
import {
  BookOpen,
  CalendarCheck,
  Coins,
  Dumbbell,
  FileSignature,
  FolderCheck,
  GraduationCap,
  Heart,
  ListChecks,
  Moon,
  NotebookPen,
  Repeat,
  Target,
  Timer,
  Trophy,
  Zap,
  GitBranch,
  ScrollText,
} from "lucide-react";
import type { RpgTone } from "@/components/rpg/rpgAssets";
import { fmtMin } from "@/services/missions3Service";
import type { Indicator, JourneyReview, ReviewKind } from "@/services/journeyReviewService";

/** Utilitários comuns da tela de Revisões 3.0. */
export const REVIEWS_ART = "/assets/rpg/modules/reviews3";
export type Notify = (m: string, tone?: "success" | "error") => void;
export const FIELD = "w-full border border-rpg-border bg-rpg-bg-2 px-2 py-1.5 text-sm text-rpg-text outline-none focus:border-rpg-gold";
export const R = { borderRadius: 4 };

export const KIND_UNIT: Record<ReviewKind, { this: string; next: string }> = {
  weekly: { this: "da semana", next: "a próxima semana" },
  monthly: { this: "do mês", next: "o próximo mês" },
  quarterly: { this: "do trimestre", next: "o próximo trimestre" },
  annual: { this: "do ano", next: "o próximo ano" },
};

export const IND_META: Record<string, { icon: ReactNode; tone: RpgTone }> = {
  xp: { icon: <Zap size={17} />, tone: "purple" },
  coins: { icon: <Coins size={17} />, tone: "gold" },
  tasksDone: { icon: <ListChecks size={17} />, tone: "blue" },
  habitsDone: { icon: <Repeat size={17} />, tone: "green" },
  habitDays: { icon: <CalendarCheck size={17} />, tone: "green" },
  workouts: { icon: <Dumbbell size={17} />, tone: "pink" },
  pagesRead: { icon: <BookOpen size={17} />, tone: "cyan" },
  readingDays: { icon: <BookOpen size={17} />, tone: "cyan" },
  studyMinutes: { icon: <GraduationCap size={17} />, tone: "blue" },
  focusMinutes: { icon: <Timer size={17} />, tone: "purple" },
  sleepAvgMinutes: { icon: <Moon size={17} />, tone: "blue" },
  energyAvg: { icon: <Heart size={17} />, tone: "orange" },
  journalDays: { icon: <NotebookPen size={17} />, tone: "pink" },
  goalsCompleted: { icon: <Target size={17} />, tone: "green" },
  contractsFulfilled: { icon: <FileSignature size={17} />, tone: "gold" },
  projectsCompleted: { icon: <FolderCheck size={17} />, tone: "orange" },
  skillLevels: { icon: <GitBranch size={17} />, tone: "green" },
  skillProofs: { icon: <ScrollText size={17} />, tone: "purple" },
  lifeScore: { icon: <Trophy size={17} />, tone: "gold" },
};

/** Valor de indicador legível (minutos viram horas; médias com 1 casa). */
export function fmtIndicator(i: Pick<Indicator, "key" | "value" | "unit">) {
  if (i.value == null) return "—";
  if (i.unit.startsWith("min")) return fmtMin(Math.round(i.value));
  if (i.key === "lifeScore") return `${Math.round(i.value)}`;
  return Number.isInteger(i.value) ? i.value.toLocaleString("pt-BR") : i.value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/** Variação nunca inventa: sem base, mostra a nota (e nunca “−100%” por ausência de dados). */
export function Delta({ i, compact }: { i: Indicator; compact?: boolean }) {
  if (i.deltaPct == null) return <span className="text-[10px] text-rpg-muted" title={i.note ?? undefined}>{compact ? "sem base" : i.note ?? "sem variação"}</span>;
  const up = i.deltaPct > 0;
  return (
    <span className={clsx("text-[11px] font-bold tabular-nums", i.deltaPct === 0 ? "text-rpg-muted" : up ? "text-rpg-green" : "text-rpg-red")} title={i.note ?? `vs período anterior: ${i.previous ?? "—"}`}>
      {up ? "▲" : i.deltaPct < 0 ? "▼" : "="} {up ? "+" : ""}
      {i.deltaPct}%{i.note ? "*" : ""}
    </span>
  );
}

export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
export const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14));

/** Regra local espelhada do servidor só para habilitar o botão (o servidor valida de novo ao selar). */
export function canSealLocal(d: JourneyReview, answers: Record<string, string>, reflection: string, prioritiesAndFocus: number, actions: number) {
  const filled = Object.values(answers).filter((v) => plain(v ?? "").length > 0).length + (plain(reflection).length > 0 ? 1 : 0);
  const required = d.seal.required;
  return { filled, required, ok: filled >= required && (d.kind !== "weekly" || prioritiesAndFocus + actions > 0) };
}

/** Painel de seção com o mesmo cabeçalho do RPGPanel (pixel só no título). */
export function Panel({ title, icon, action, children, className, tone = "default" }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tone?: "default" | "gold" }) {
  return (
    <section className={clsx("rpg-panel p-3 sm:p-4", tone === "gold" && "rpg-panel-gold", className)} aria-label={title}>
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-rpg-gold" aria-hidden>
          {icon}
        </span>
        <h2 className="font-pixel text-[13px] uppercase tracking-wider text-rpg-gold-light">{title}</h2>
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}

export const KIND_TONE: Record<string, string> = { dado: "border-rpg-blue/60 text-rpg-blue", inferencia: "border-rpg-purple/60 text-rpg-purple", sugestao: "border-rpg-green/60 text-rpg-green" };
export const KIND_LABEL: Record<string, string> = { dado: "Dado real", inferencia: "Inferência", sugestao: "Sugestão" };

export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
