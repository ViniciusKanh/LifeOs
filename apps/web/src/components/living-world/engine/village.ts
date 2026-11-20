/**
 * Regras da Vila do Meu Mundo (puras, testáveis, sem canvas):
 * - marcadores de pendência sobre casas/ambientes, derivados SÓ dos dados reais;
 * - falas das conversas entre agentes, também derivadas dos dados reais.
 *
 * Saudações são genéricas; qualquer fala com número ou afirmação sobre o
 * usuário vem de um campo de `WorldFacts`. Sem dado, o assunto não aparece.
 */
import type { BuildingKey, RoomKey } from "./worldMap";

export interface WorldFacts {
  overdue: number;
  dueToday: number;
  cardsDue: number;
  claimable: number;
  loanOverdue: number;
  ordersPending: number;
  habitsPending: number;
  journalToday: boolean;
  workoutToday: boolean;
  studyToday: boolean;
  /** Título da missão em andamento (real), se houver. */
  activityTitle: string | null;
}

export type PlaceKey = RoomKey | BuildingKey;
export type MarkerTone = "danger" | "warn" | "info";

export interface PlaceMarker {
  /** 0 = sem número (só o símbolo). */
  count: number;
  tone: MarkerTone;
  text: string;
}

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Marcadores estilo "missão disponível": vermelho = atrasado, dourado = hoje, azul = lembrete. */
export function buildMarkers(f: WorldFacts | null): Partial<Record<PlaceKey, PlaceMarker>> {
  if (!f) return {};
  const m: Partial<Record<PlaceKey, PlaceMarker>> = {};
  if (f.overdue > 0) m.guilda = { count: f.overdue, tone: "danger", text: pl(f.overdue, "missão atrasada", "missões atrasadas") };
  else if (f.dueToday > 0) m.guilda = { count: f.dueToday, tone: "warn", text: pl(f.dueToday, "missão para hoje", "missões para hoje") };
  if (f.habitsPending > 0) m.jardim = { count: f.habitsPending, tone: "warn", text: pl(f.habitsPending, "hábito pendente", "hábitos pendentes") };
  if (f.cardsDue > 0) m.torre = { count: f.cardsDue, tone: "warn", text: pl(f.cardsDue, "carta para revisar", "cartas para revisar") };
  if (f.loanOverdue > 0) m.banco = { count: f.loanOverdue, tone: "danger", text: pl(f.loanOverdue, "empréstimo vencido", "empréstimos vencidos") };
  else if (f.claimable > 0) m.banco = { count: f.claimable, tone: "warn", text: pl(f.claimable, "resgate disponível", "resgates disponíveis") };
  if (f.ordersPending > 0) m.loja = { count: f.ordersPending, tone: "warn", text: pl(f.ordersPending, "pedido aguardando", "pedidos aguardando") };
  if (!f.journalToday) m.casa = { count: 0, tone: "info", text: "Diário de hoje em branco" };
  if (!f.workoutToday) m.academia = { count: 0, tone: "info", text: "Sem treino registrado hoje" };
  if (!f.studyToday) m.biblioteca = { count: 0, tone: "info", text: "Sem estudo registrado hoje" };
  return m;
}

export interface TalkLine {
  /** 0 = quem puxa o assunto, 1 = quem responde. */
  speaker: 0 | 1;
  text: string;
}

interface Topic {
  id: string;
  owners: string[];
  when: (f: WorldFacts) => boolean;
  say: (f: WorldFacts) => [string, string];
}

const TOPICS: Topic[] = [
  { id: "overdue", owners: ["planejador", "analista"], when: (f) => f.overdue > 0, say: (f) => [`${pl(f.overdue, "missão está atrasada", "missões estão atrasadas")} na Guilda.`, "Vamos começar pela mais antiga."] },
  { id: "today", owners: ["planejador"], when: (f) => f.dueToday > 0, say: (f) => [`${pl(f.dueToday, "missão vence", "missões vencem")} hoje.`, "Dá tempo, se começar agora."] },
  { id: "clear", owners: ["planejador", "analista"], when: (f) => f.overdue === 0 && f.dueToday === 0, say: () => ["Nenhuma missão atrasada no quadro.", "Reino em ordem por enquanto."] },
  { id: "activity", owners: ["planejador", "mentor"], when: (f) => !!f.activityTitle, say: (f) => [`O herói está em "${(f.activityTitle ?? "").slice(0, 26)}".`, "Melhor não interromper."] },
  { id: "habits", owners: ["habitos"], when: (f) => f.habitsPending > 0, say: (f) => [`${pl(f.habitsPending, "hábito ainda falta", "hábitos ainda faltam")} no Jardim.`, "Cada dia regado mantém a sequência."] },
  { id: "cards", owners: ["mentor"], when: (f) => f.cardsDue > 0, say: (f) => [`${pl(f.cardsDue, "carta espera", "cartas esperam")} revisão na Torre.`, "Revisar hoje evita esquecer amanhã."] },
  { id: "study", owners: ["mentor"], when: (f) => f.studyToday, say: () => ["Teve estudo registrado hoje.", "A Biblioteca agradece!"] },
  { id: "claim", owners: ["analista"], when: (f) => f.claimable > 0, say: (f) => [`${pl(f.claimable, "investimento pronto", "investimentos prontos")} para resgate.`, "Vale passar no Banco."] },
  { id: "loan", owners: ["analista"], when: (f) => f.loanOverdue > 0, say: () => ["Tem empréstimo vencido no Banco.", "Melhor regularizar logo."] },
  { id: "orders", owners: ["analista", "habitos"], when: (f) => f.ordersPending > 0, say: (f) => [`${pl(f.ordersPending, "pedido da Loja aguarda", "pedidos da Loja aguardam")} entrega.`, "A recompensa já foi conquistada."] },
  { id: "journal", owners: ["mentor", "habitos"], when: (f) => !f.journalToday, say: () => ["O diário de hoje está em branco.", "Ainda dá para escrever na Casa."] },
  { id: "workout", owners: ["habitos"], when: (f) => f.workoutToday, say: () => ["Treino de hoje registrado!", "A energia agradece."] },
];

const GREETINGS: Array<[string, string]> = [
  ["Olá, {b}!", "Oi, {a}! Novidades?"],
  ["Bom te ver, {b}.", "Igualmente! O que há?"],
  ["{b}, tem um minuto?", "Claro, {a}."],
  ["Ei, {b}!", "Fala, {a}!"],
];

/** Conversa curta (saudação + um assunto real). `seed` escolhe sem aleatoriedade escondida. */
export function buildConversation(a: { key: string; name: string }, b: { key: string; name: string }, f: WorldFacts | null, seed: number): TalkLine[] {
  const short = (n: string) => n.split(" ")[0] ?? n;
  const g = GREETINGS[Math.abs(seed) % GREETINGS.length]!;
  const lines: TalkLine[] = [
    { speaker: 0, text: g[0].replace("{a}", short(a.name)).replace("{b}", short(b.name)) },
    { speaker: 1, text: g[1].replace("{a}", short(a.name)).replace("{b}", short(b.name)) },
  ];
  if (!f) return lines;
  const valid = TOPICS.filter((t) => t.when(f));
  if (!valid.length) return lines;
  const mine = valid.filter((t) => t.owners.includes(a.key));
  const pool = mine.length ? mine : valid;
  const topic = pool[Math.abs(seed >> 2) % pool.length]!;
  const [q, r] = topic.say(f);
  lines.push({ speaker: 0, text: q }, { speaker: 1, text: r });
  return lines;
}
