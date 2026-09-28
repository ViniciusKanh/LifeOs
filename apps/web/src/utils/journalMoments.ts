import type { JournalAutoData } from "@/types";

/**
 * "Momentos" do Diário (Fase 5 do modelo Apple Journal) — sugestões de
 * escrita derivadas de dados REAIS já registrados em outros módulos do
 * LifeOS no dia (tarefas, hábitos, água, exercício, leitura). Nunca
 * inventa nem estima nada: só aparece um momento quando o módulo de
 * origem realmente tem algo registrado naquele dia. Clicar num momento
 * insere a frase pronta na reflexão do dia — é assim que a integração
 * entre módulos vira, de fato, texto no Diário.
 */
export type JournalMomentKind = "tasks" | "habits" | "water" | "exercise" | "reading";

export interface JournalMoment {
  id: string;
  kind: JournalMomentKind;
  /** Texto pronto pra inserir na reflexão do dia. */
  text: string;
}

function formatWaterLiters(ml: number): string {
  const liters = ml / 1000;
  return `${liters.toFixed(1).replace(/\.0$/, "")}L`.replace(".", ",");
}

export function buildJournalMoments(auto: JournalAutoData): JournalMoment[] {
  const moments: JournalMoment[] = [];

  if (auto.tasksToday.done > 0) {
    moments.push({
      id: "tasks",
      kind: "tasks",
      text: `Concluí ${auto.tasksToday.done} de ${auto.tasksToday.total} tarefas hoje.`,
    });
  }

  if (auto.habitsToday.done > 0) {
    const streakPart = auto.habitsToday.streak
      ? ` Sequência de ${auto.habitsToday.streak.streak} dias em "${auto.habitsToday.streak.habitName}".`
      : "";
    moments.push({
      id: "habits",
      kind: "habits",
      text: `Mantive ${auto.habitsToday.done} de ${auto.habitsToday.total} hábitos hoje.${streakPart}`,
    });
  }

  if (auto.waterMl > 0) {
    moments.push({
      id: "water",
      kind: "water",
      text: `Bebi ${formatWaterLiters(auto.waterMl)} de água hoje.`,
    });
  }

  if (auto.exerciseMinutes > 0) {
    moments.push({
      id: "exercise",
      kind: "exercise",
      text: `Me exercitei por ${auto.exerciseMinutes} minutos hoje.`,
    });
  }

  if (auto.reading.pages > 0 || auto.reading.minutes > 0) {
    const bookPart = auto.currentBook ? ` de "${auto.currentBook.title}"` : "";
    const amountPart = auto.reading.pages > 0 ? `${auto.reading.pages} páginas` : `${auto.reading.minutes} minutos`;
    moments.push({
      id: "reading",
      kind: "reading",
      text: `Li ${amountPart}${bookPart} hoje.`,
    });
  }

  return moments;
}
