import { FIGHT_MODALITIES, inferWorkoutCategory, type WorkoutCategory } from "./healthService.js";

/**
 * Parser LOCAL e determinístico (sem IA) dos comandos mais frequentes da
 * paleta/Copilot: "bebi 500ml", "treino jiu-jitsu 60min hoje", "li 20
 * páginas de Duna", "tarefa revisar contrato sexta alta"...
 *
 * Roda ANTES do Gemini: é instantâneo, não gasta cota e funciona sem IA
 * configurada. Só reconhece padrões inequívocos — qualquer coisa fora
 * deles devolve null e segue para o Gemini. O resultado é apenas uma
 * intenção crua (texto do livro/hábito ainda não resolvido contra o
 * banco); quem resolve e monta a prévia é o copilotActionsService.
 * Nada aqui grava dados.
 */

export type Priority = "Baixa" | "Média" | "Alta";
export type FightModality = (typeof FIGHT_MODALITIES)[number];

export type LocalCommand =
  | { action: "registrar_agua"; amountMl: number; date: string }
  | {
      action: "registrar_treino";
      activity: string;
      category: WorkoutCategory;
      modality: FightModality | null;
      durationMinutes: number;
      date: string;
    }
  | { action: "registrar_leitura"; bookQuery: string; pagesRead: number; durationMinutes: number | null; date: string }
  | { action: "criar_tarefa"; title: string; dueDate: string | null; priority: Priority }
  | { action: "criar_meta"; title: string; dueDate: string | null }
  | { action: "criar_projeto"; name: string }
  | { action: "capturar_inbox"; content: string }
  | { action: "registrar_sono"; date: string; bedTime: string; wakeTime: string }
  | { action: "registrar_humor"; mood: number; energy: number; date: string }
  | { action: "marcar_habito"; habitQuery: string; date: string }
  | { action: "concluir_tarefa"; taskQuery: string }
  /** Reconheceu a intenção, mas falta um dado que não dá pra supor (ex.: horários do sono). */
  | { action: "esclarecer"; message: string };

/* ------------------------------ Datas ------------------------------ */

const WEEKDAYS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

function addDays(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Converte uma palavra de data em YYYY-MM-DD relativo a `todayKey` (o "hoje"
 * no fuso do usuário). `direction` decide dias da semana e dd/mm sem ano:
 * registros ("treinei sexta") olham para trás; tarefas ("entregar sexta")
 * olham para frente. Em ambos os casos o próprio dia de hoje vale.
 */
export function resolveDateWord(word: string, todayKey: string, direction: "past" | "future"): string | null {
  const w = fold(word).trim().replace(/-feira$|\s+feira$/, "");
  if (w === "hoje") return todayKey;
  if (w === "ontem") return addDays(todayKey, -1);
  if (w === "anteontem") return addDays(todayKey, -2);
  if (w === "amanha") return addDays(todayKey, 1);
  if (w === "depois de amanha") return addDays(todayKey, 2);
  if (w in WEEKDAYS) {
    const today = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
    const target = WEEKDAYS[w];
    const delta = direction === "future" ? (target - today + 7) % 7 : -((today - target + 7) % 7);
    return addDays(todayKey, delta);
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w);
  if (m) return isRealDate(+m[1], +m[2], +m[3]) ? w : null;
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(w);
  if (m) {
    const day = +m[1];
    const month = +m[2];
    let year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +todayKey.slice(0, 4);
    if (!isRealDate(year, month, day)) return null;
    let key = `${year}-${pad(month)}-${pad(day)}`;
    if (!m[3]) {
      // Sem ano: escolhe o ano que faz sentido para a direção.
      if (direction === "future" && key < todayKey) year += 1;
      if (direction === "past" && key > todayKey) year -= 1;
      if (!isRealDate(year, month, day)) return null;
      key = `${year}-${pad(month)}-${pad(day)}`;
    }
    return key;
  }
  return null;
}

/* --------------------------- Normalização --------------------------- */

/**
 * Minúsculas sem acento PRESERVANDO o comprimento (um caractere por
 * caractere), para que os índices achados no texto "dobrado" sirvam
 * para recortar o texto original com caixa e acentos.
 */
export function fold(s: string): string {
  return Array.from(s)
    .map((c) => {
      const base = (c.normalize("NFD")[0] ?? c).toLowerCase();
      return base.length === c.length ? base : c;
    })
    .join("");
}

/** Par texto original + dobrado, recortados juntos. */
interface Txt {
  raw: string;
  f: string;
}

const txt = (raw: string): Txt => {
  const clean = raw.normalize("NFC").replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  return { raw: clean, f: fold(clean) };
};
const slice = (t: Txt, start: number, end?: number): Txt => ({ raw: t.raw.slice(start, end).trim(), f: t.f.slice(start, end).trim() });

/** Aplica a regex no texto dobrado e devolve os grupos recortados do original. */
function match(t: Txt, re: RegExp): Txt[] | null {
  const m = re.exec(t.f);
  if (!m) return null;
  const out: Txt[] = [];
  let cursor = m.index;
  for (let i = 0; i < m.length; i++) {
    const g = m[i];
    if (g === undefined) {
      out.push({ raw: "", f: "" });
      continue;
    }
    const at = i === 0 ? m.index : t.f.indexOf(g, cursor);
    out.push({ raw: t.raw.slice(at, at + g.length), f: g });
    if (i > 0) cursor = at + g.length;
  }
  return out;
}

const DATE_WORD =
  "(hoje|amanha|depois de amanha|ontem|anteontem|(?:segunda|terca|quarta|quinta|sexta)(?:-feira| feira)?|sabado|domingo|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2})";
const TRAILING_DATE = new RegExp(`(?:^|\\s)(?:(?:na|no|para|pra|ate|em|dia|de|prazo)\\s+)?${DATE_WORD}$`);
const TRAILING_PRIORITY = /(?:^|\s)(?:(?:prioridade|prio)\s+)?(alta|media|baixa|urgente)$/;

/** Retira do fim do texto uma data e/ou prioridade (em qualquer ordem). */
function stripTrailing(t: Txt, todayKey: string, direction: "past" | "future", allowPriority: boolean) {
  let rest = t;
  let date: string | null = null;
  let priority: Priority | null = null;
  for (let guard = 0; guard < 3; guard++) {
    const dm: RegExpExecArray | null = date === null ? TRAILING_DATE.exec(rest.f) : null;
    if (dm) {
      const resolved = resolveDateWord(dm[1], todayKey, direction);
      if (!resolved) return { rest, date: null, priority, invalidDate: dm[1] };
      date = resolved;
      rest = slice(rest, 0, dm.index);
      continue;
    }
    const pm: RegExpExecArray | null = allowPriority && priority === null ? TRAILING_PRIORITY.exec(rest.f) : null;
    if (pm) {
      priority = pm[1] === "alta" || pm[1] === "urgente" ? "Alta" : pm[1] === "baixa" ? "Baixa" : "Média";
      rest = slice(rest, 0, pm.index);
      continue;
    }
    break;
  }
  return { rest, date, priority, invalidDate: null as string | null };
}

/* ---------------------------- Duração ---------------------------- */

const DURATION_RE = /(\d+(?:[.,]\d+)?)\s*(?:h|hrs?|horas?)(?:\s*(\d{1,2})\s*(?:min(?:utos)?)?)?(?![a-z])|(\d+)\s*(?:min|mins|minutos?)(?![a-z])/;

function readDuration(t: Txt): { minutes: number; rest: Txt } | null {
  const m = DURATION_RE.exec(t.f);
  if (!m) return null;
  let minutes: number;
  if (m[3]) minutes = Number(m[3]);
  else minutes = Math.round(Number(m[1].replace(",", ".")) * 60) + (m[2] ? Number(m[2]) : 0);
  const rest: Txt = {
    raw: `${t.raw.slice(0, m.index)} ${t.raw.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim(),
    f: `${t.f.slice(0, m.index)} ${t.f.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim(),
  };
  return { minutes, rest };
}

/* --------------------------- Modalidades --------------------------- */

const MODALITY_RULES: Array<[FightModality, RegExp]> = [
  ["jiu_jitsu", /jiu|bjj/],
  ["muay_thai", /muay/],
  ["kickboxing", /kick/],
  ["boxe", /boxe|boxing/],
  ["mma", /\bmma\b/],
  ["judo", /judo/],
  ["karate", /karate/],
  ["wrestling", /wrestling|luta livre/],
];

export function inferFightModality(activity: string): FightModality | null {
  const f = fold(activity);
  return MODALITY_RULES.find(([, re]) => re.test(f))?.[0] ?? null;
}

/* ----------------------------- Parser ----------------------------- */

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function parseWater(t: Txt, todayKey: string): LocalCommand | null {
  const patterns = [
    /^(?:bebi|tomei)\s+(\d+(?:[.,]\d+)?)\s*(ml|litros?|l(?![a-z]))?(?:\s+de)?(\s+agua)?(.*)$/,
    /^agua\s*:?\s+(\d+(?:[.,]\d+)?)\s*(ml|litros?|l(?![a-z]))?()(.*)$/,
    /^(?:\+\s*)?(\d+(?:[.,]\d+)?)\s*(ml|litros?|l(?![a-z]))\s+(?:de\s+)?(agua)(.*)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(t.f);
    if (!m) continue;
    const value = Number(m[1].replace(",", "."));
    const unit = m[2] ?? "";
    const saidWater = Boolean(m[3]?.trim()) || re !== patterns[0];
    // "bebi 2 cafés" não é água: sem unidade e sem "água" só vale para valores típicos em ml.
    if (!unit && !saidWater && value < 50) return null;
    const amountMl = Math.round(unit.startsWith("l") ? value * 1000 : value);
    const tail = slice({ raw: t.raw, f: t.f }, t.f.length - m[4].length);
    const { rest, date, invalidDate } = stripTrailing(tail, todayKey, "past", false);
    if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
    if (rest.f) return null; // sobrou texto ("bebi 2 litros de suco") → não é um registro de água claro
    if (amountMl < 1 || amountMl > 5000) {
      return { action: "esclarecer", message: "Informe uma quantidade de água entre 1 ml e 5 litros por registro." };
    }
    return { action: "registrar_agua", amountMl, date: date ?? todayKey };
  }
  return null;
}

function parseWorkout(t: Txt, todayKey: string): LocalCommand | null {
  const head = match(t, /^(?:treino|treinei|fiz|pratiquei|registrar treino)\s*:?\s+(.+)$/);
  if (!head) return null;
  const duration = readDuration(head[1]);
  if (!duration) return null; // sem duração não dá para registrar treino com segurança
  const { rest, date, invalidDate } = stripTrailing(duration.rest, todayKey, "past", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  const activity = rest.raw.replace(/^(?:de|do|da)\s+/i, "").trim();
  if (!activity) return null;
  if (duration.minutes < 1 || duration.minutes > 600) {
    return { action: "esclarecer", message: "A duração do treino precisa ficar entre 1 e 600 minutos." };
  }
  const category = inferWorkoutCategory(activity);
  return {
    action: "registrar_treino",
    activity: capitalize(activity),
    category,
    modality: category === "luta" ? inferFightModality(activity) ?? "outra" : null,
    durationMinutes: duration.minutes,
    date: date ?? todayKey,
  };
}

function parseReading(t: Txt, todayKey: string): LocalCommand | null {
  const m = match(t, /^(?:li|leitura|lido)\s*:?\s+(\d+)\s*(?:paginas?|pags?|p\.?)\s+(?:de|do|da|em|no|na)\s+(.+)$/);
  if (!m) return null;
  const pagesRead = Number(m[1].f);
  let body = m[2];
  const duration = readDuration(body);
  if (duration) body = { raw: duration.rest.raw.replace(/\s+em$/i, ""), f: duration.rest.f.replace(/\s+em$/, "") };
  const { rest, date, invalidDate } = stripTrailing(body, todayKey, "past", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  const bookQuery = rest.raw.replace(/^["“']|["”']$/g, "").trim();
  if (!bookQuery) return null;
  if (pagesRead < 1 || pagesRead > 2000) return { action: "esclarecer", message: "Informe entre 1 e 2000 páginas." };
  return { action: "registrar_leitura", bookQuery, pagesRead, durationMinutes: duration?.minutes ?? null, date: date ?? todayKey };
}

function parseTask(t: Txt, todayKey: string): LocalCommand | null {
  const m =
    match(t, /^(?:cri(?:a|ar|e)|adiciona(?:r)?|nova|novo|add)\s+(?:uma\s+)?(?:tarefa|missao)\s*:?\s+(?:de\s+|para\s+|pra\s+)?(.+)$/) ??
    match(t, /^(?:tarefa|missao|todo)\s*:?\s+(.+)$/);
  if (!m) return null;
  const { rest, date, priority, invalidDate } = stripTrailing(m[1], todayKey, "future", true);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  if (!rest.raw) return null;
  return { action: "criar_tarefa", title: capitalize(rest.raw).slice(0, 200), dueDate: date, priority: priority ?? "Média" };
}

function parseGoal(t: Txt, todayKey: string): LocalCommand | null {
  const m =
    match(t, /^(?:cri(?:a|ar|e)|nova|adiciona(?:r)?)\s+(?:uma\s+)?meta\s*:?\s+(?:de\s+|para\s+)?(.+)$/) ?? match(t, /^meta\s*:?\s+(?:de\s+)?(.+)$/);
  if (!m) return null;
  const { rest, date, invalidDate } = stripTrailing(m[1], todayKey, "future", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  if (!rest.raw) return null;
  return { action: "criar_meta", title: capitalize(rest.raw).slice(0, 160), dueDate: date };
}

function parseProject(t: Txt): LocalCommand | null {
  const m =
    match(t, /^(?:cri(?:a|ar|e)|novo|adiciona(?:r)?)\s+(?:um\s+)?projeto\s*:?\s+(.+)$/) ?? match(t, /^projeto\s*:?\s+(.+)$/);
  if (!m || !m[1].raw) return null;
  return { action: "criar_projeto", name: capitalize(m[1].raw).slice(0, 160) };
}

function parseInbox(t: Txt): LocalCommand | null {
  const m = match(t, /^(?:nota|anotar|anota|capturar|captura|inbox|ideia|lembrete)\s*:?\s+(.+)$/);
  if (!m || !m[1].raw) return null;
  return { action: "capturar_inbox", content: m[1].raw.slice(0, 2000) };
}

function parseSleep(t: Txt, todayKey: string): LocalCommand | null {
  if (!/^dormi\b/.test(t.f)) return null;
  const m = /^dormi\s+(?:das?\s+)?(\d{1,2})(?:[:h](\d{2}))?\s*h?\s*(?:as|a|ate|-)\s*(\d{1,2})(?:[:h](\d{2}))?\s*h?(.*)$/.exec(t.f);
  if (!m) {
    // "dormi 7h" não diz QUANDO — inventar horários falsearia o registro.
    return { action: "esclarecer", message: 'Para registrar o sono preciso dos horários. Ex.: "dormi das 23h às 7h" ou "dormi 23:30-6:45 ontem".' };
  }
  const bh = Number(m[1]);
  const bm = Number(m[2] ?? 0);
  const wh = Number(m[3]);
  const wm = Number(m[4] ?? 0);
  if (bh > 23 || wh > 23 || bm > 59 || wm > 59) return { action: "esclarecer", message: "Horário inválido. Use algo como 23h ou 23:30." };
  const tail = slice(t, t.f.length - m[5].length);
  const { rest, date, invalidDate } = stripTrailing(tail, todayKey, "past", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  if (rest.f) return null;
  if (bh === wh && bm === wm) return { action: "esclarecer", message: "O horário de acordar precisa ser diferente do de dormir." };
  return { action: "registrar_sono", date: date ?? todayKey, bedTime: `${pad(bh)}:${pad(bm)}`, wakeTime: `${pad(wh)}:${pad(wm)}` };
}

function parseMood(t: Txt, todayKey: string): LocalCommand | null {
  const m = /^(?:humor|mood)\s*:?\s*(\d)(?:\s*\/\s*5)?(?:\s*,?\s*(?:e\s+)?energia\s*:?\s*(\d)(?:\s*\/\s*5)?)?(.*)$/.exec(t.f);
  if (!m) return null;
  const mood = Number(m[1]);
  const energy = m[2] ? Number(m[2]) : null;
  if (mood < 1 || mood > 5 || (energy !== null && (energy < 1 || energy > 5))) {
    return { action: "esclarecer", message: "Humor e energia vão de 1 a 5." };
  }
  if (energy === null) return { action: "esclarecer", message: 'Informe também a energia (1 a 5). Ex.: "humor 4 energia 3".' };
  const { rest, date, invalidDate } = stripTrailing(slice(t, t.f.length - m[3].length), todayKey, "past", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  if (rest.f) return null;
  return { action: "registrar_humor", mood, energy, date: date ?? todayKey };
}

function parseHabit(t: Txt, todayKey: string): LocalCommand | null {
  const m = match(t, /^(?:check-?in|marca(?:r)?\s+(?:o\s+)?habito|habito|contrato)\s*:?\s+(.+)$/);
  if (!m) return null;
  const { rest, date, invalidDate } = stripTrailing(m[1], todayKey, "past", false);
  if (invalidDate) return { action: "esclarecer", message: `Não entendi a data "${invalidDate}".` };
  const habitQuery = rest.raw.replace(/\s+(?:como\s+)?(?:feito|cumprido)$/i, "").trim();
  if (!habitQuery) return null;
  return { action: "marcar_habito", habitQuery, date: date ?? todayKey };
}

function parseComplete(t: Txt): LocalCommand | null {
  const m = match(t, /^(?:concluir|conclui|completar|completei)\s+(?:a\s+)?(?:tarefa\s+|missao\s+)?(.+)$/);
  if (!m || !m[1].raw) return null;
  return { action: "concluir_tarefa", taskQuery: m[1].raw };
}

/**
 * Tenta reconhecer um comando comum. `todayKey` é o dia de hoje no fuso
 * do usuário (todayKeyFor). Devolve null quando não há padrão claro.
 */
export function parseLocalCommand(input: string, todayKey: string): LocalCommand | null {
  const t = txt(input);
  if (!t.f || t.f.length > 500) return null;
  return (
    parseWater(t, todayKey) ??
    parseWorkout(t, todayKey) ??
    parseReading(t, todayKey) ??
    parseSleep(t, todayKey) ??
    parseMood(t, todayKey) ??
    parseTask(t, todayKey) ??
    parseGoal(t, todayKey) ??
    parseProject(t) ??
    parseInbox(t) ??
    parseHabit(t, todayKey) ??
    parseComplete(t)
  );
}
