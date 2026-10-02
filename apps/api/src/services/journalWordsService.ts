import type { getDb } from "../db/client.js";
import { stripHtml } from "./journalService.js";

type Db = ReturnType<typeof getDb>;

/**
 * Nuvem de palavras do Diário — 100% automática (sem IA): conta as
 * palavras que o usuário realmente escreveu (texto do dia, "o que levo
 * para amanhã", gratidão e histórias das mídias), descartando palavras
 * vazias do português e as que ele escolheu esconder.
 */

export type WordCloudPeriod = "30" | "90" | "365" | "all";

export interface WordCloudWord {
  word: string;
  /** Ocorrências no período. */
  count: number;
  /** Quantas entradas (dias) usam a palavra. */
  days: number;
  /** Datas mais recentes em que aparece (até 6), para abrir o dia. */
  recentDates: string[];
}

export interface WordCloudResult {
  period: WordCloudPeriod;
  entries: number;
  totalWords: number;
  distinctWords: number;
  words: WordCloudWord[];
  /** Palavras que ganharam espaço nos últimos 30 dias vs. os 90 anteriores — só com amostra mínima. */
  rising: Array<{ word: string; recentPct: number; previousPct: number }>;
  excluded: string[];
}

// Palavras vazias (artigos, preposições, pronomes, verbos auxiliares e
// marcadores de tempo genéricos de diário). Comparadas já sem acento.
const STOPWORDS = new Set(
  `a o as os um uma uns umas de do da dos das no na nos nas em num numa ao aos pelo pela pelos pelas por para pra pro pras pros
  com sem sob sobre entre ate apos ante contra desde perante e ou mas porem contudo todavia que se como quando onde porque pois
  porque entao logo tambem ja ainda so apenas mais menos muito muita muitos muitas pouco pouca poucos poucas bem mal nao sim
  eu tu ele ela nos vos eles elas me te lhe lhes mim ti si comigo contigo conosco voce voces meu minha meus minhas teu tua teus
  tuas seu sua seus suas nosso nossa nossos nossas dele dela deles delas esse essa esses essas este esta estes estas isso isto
  aquele aquela aqueles aquelas aquilo outro outra outros outras todo toda todos todas tudo nada algo alguem ninguem cada qual
  quais quem qualquer mesmo mesma mesmos mesmas tal tais tanto tanta tantos tantas ser sou es somos sao era eram fui foi fomos
  foram seria seja sejam sido sendo estar estou esta estamos estao estava estavam estive esteve estivemos estiveram estado
  ter tenho tem temos tinha tinham tive teve tivemos tiveram tido tendo haver ha havia houve hei fazer faco faz fiz fez fizemos
  fazendo feito ir vou vai vamos vao ia fui indo ido poder posso pode podia pude pôde dever devo deve vez vezes coisa coisas
  dia dias hoje ontem amanha agora depois antes sempre nunca aqui ali la la cá ca assim tipo ate entao etc ne né pq tbm vc vcs
  ai ah oh eh hum uhm acho achei sei ficar fiquei ficou dar deu dei ver vi viu disse diz falar falei`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => normalizeWord(w))
);

/** Subtítulos inseridos pela migração 0050 — saem antes de contar, para não virarem "palavras". */
const MIGRATION_HEADINGS = /<p><strong>(Intenção do dia|O que me fez bem|Desafios|Para um dia mais leve|O que me ajudou)<\/strong><\/p>/g;

export function normalizeWord(word: string): string {
  return word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Quebra o texto em palavras com letras (aceita acentos e hífen interno), mínimo de 3 letras. */
export function tokenize(text: string): string[] {
  return (text.match(/\p{L}+(?:-\p{L}+)*/gu) ?? []).filter((w) => w.length >= 3);
}

function periodStart(period: WordCloudPeriod): string | null {
  if (period === "all") return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Number(period));
  return d.toISOString().slice(0, 10);
}

const TEXT_COLUMNS = ["thoughts", "night_takeaway", "intention", "challenges", "lighter_plan", "feel_good", "night_helped"] as const;

interface EntryText {
  date: string;
  text: string;
}

async function loadEntryTexts(db: Db, ownerId: string, from: string | null, journalId: string | null): Promise<EntryText[]> {
  const where = ["e.owner_id = ?"];
  const args: Array<string> = [ownerId];
  if (from) {
    where.push("e.entry_date >= ?");
    args.push(from);
  }
  if (journalId) {
    // A coleção também precisa ser do mesmo dono — nunca lê diário de outro usuário.
    where.push("e.id IN (SELECT jej.entry_id FROM journal_entry_journals jej JOIN journals j ON j.id = jej.journal_id WHERE jej.journal_id = ? AND j.owner_id = ?)");
    args.push(journalId, ownerId);
  }
  const res = await db.execute({
    sql: `SELECT e.id, e.entry_date, ${TEXT_COLUMNS.map((c) => `e.${c}`).join(", ")}, e.gratitude,
            (SELECT GROUP_CONCAT(COALESCE(m.caption, '') || ' ' || COALESCE(m.story, ''), ' ')
               FROM journal_entry_media m WHERE m.entry_id = e.id AND m.owner_id = e.owner_id) AS media_text
          FROM journal_entries e WHERE ${where.join(" AND ")} ORDER BY e.entry_date DESC`,
    args,
  });

  const out: EntryText[] = [];
  for (const row of res.rows as unknown as Array<Record<string, unknown>>) {
    const parts: string[] = [];
    for (const col of TEXT_COLUMNS) {
      const html = row[col];
      if (typeof html === "string" && html) parts.push(stripHtml(html.replace(MIGRATION_HEADINGS, " ")));
    }
    try {
      const g = JSON.parse((row.gratitude as string) || "[]") as unknown[];
      parts.push(g.filter((x): x is string => typeof x === "string").join(" "));
    } catch {
      // gratidão malformada: ignora
    }
    if (typeof row.media_text === "string") parts.push(row.media_text);
    const text = parts.join(" ").trim();
    if (text) out.push({ date: String(row.entry_date), text });
  }
  return out;
}

async function listExclusions(db: Db, ownerId: string): Promise<string[]> {
  const res = await db.execute({ sql: "SELECT word FROM journal_word_exclusions WHERE owner_id = ? ORDER BY word", args: [ownerId] });
  return (res.rows as unknown as Array<{ word: string }>).map((r) => r.word);
}

interface Tally {
  count: number;
  dates: string[];
  forms: Map<string, number>;
}

function tally(entries: EntryText[], skip: Set<string>): { map: Map<string, Tally>; total: number } {
  const map = new Map<string, Tally>();
  let total = 0;
  for (const entry of entries) {
    const seen = new Set<string>();
    for (const raw of tokenize(entry.text)) {
      const key = normalizeWord(raw);
      if (STOPWORDS.has(key) || skip.has(key)) continue;
      total += 1;
      let t = map.get(key);
      if (!t) {
        t = { count: 0, dates: [], forms: new Map() };
        map.set(key, t);
      }
      t.count += 1;
      const form = raw.toLowerCase();
      t.forms.set(form, (t.forms.get(form) ?? 0) + 1);
      if (!seen.has(key)) {
        seen.add(key);
        t.dates.push(entry.date);
      }
    }
  }
  return { map, total };
}

/** Forma mais usada da palavra (preserva acento: "família" em vez de "familia"). */
function displayForm(t: Tally): string {
  let best = "";
  let n = -1;
  for (const [form, c] of t.forms) if (c > n) [best, n] = [form, c];
  return best;
}

const MIN_ENTRIES_FOR_RISING = 4;

export async function getJournalWordCloud(
  db: Db,
  ownerId: string,
  period: WordCloudPeriod,
  journalId: string | null,
  limit = 60
): Promise<WordCloudResult> {
  const excluded = await listExclusions(db, ownerId);
  const skip = new Set(excluded);
  const entries = await loadEntryTexts(db, ownerId, periodStart(period), journalId);
  const { map, total } = tally(entries, skip);

  const words = [...map.values()]
    .map((t) => ({ word: displayForm(t), count: t.count, days: t.dates.length, recentDates: t.dates.slice(0, 6) }))
    // Uma palavra que só aparece uma vez em um único dia é ruído quando há bastante texto.
    .filter((w) => entries.length < 5 || w.count >= 2)
    .sort((a, b) => b.count - a.count || b.days - a.days || a.word.localeCompare(b.word, "pt-BR"))
    .slice(0, limit);

  // "Em alta": participação da palavra nos últimos 30 dias vs. nos 90 dias anteriores.
  const recentFrom = periodStart("30")!;
  const prevFromDate = new Date(`${recentFrom}T00:00:00Z`);
  prevFromDate.setUTCDate(prevFromDate.getUTCDate() - 90);
  const prevFrom = prevFromDate.toISOString().slice(0, 10);
  const windowEntries = await loadEntryTexts(db, ownerId, prevFrom, journalId);
  const recentEntries = windowEntries.filter((e) => e.date >= recentFrom);
  const previousEntries = windowEntries.filter((e) => e.date < recentFrom);
  let rising: WordCloudResult["rising"] = [];
  if (recentEntries.length >= MIN_ENTRIES_FOR_RISING && previousEntries.length >= MIN_ENTRIES_FOR_RISING) {
    const recent = tally(recentEntries, skip);
    const previous = tally(previousEntries, skip);
    rising = [...recent.map.entries()]
      .filter(([, t]) => t.count >= 3 && t.dates.length >= 2)
      .map(([key, t]) => {
        const recentPct = (t.count / Math.max(recent.total, 1)) * 100;
        const previousPct = ((previous.map.get(key)?.count ?? 0) / Math.max(previous.total, 1)) * 100;
        return { word: displayForm(t), recentPct: Math.round(recentPct * 100) / 100, previousPct: Math.round(previousPct * 100) / 100 };
      })
      .filter((r) => r.recentPct >= r.previousPct * 2 && r.recentPct - r.previousPct >= 0.3)
      .sort((a, b) => b.recentPct - b.previousPct - (a.recentPct - a.previousPct))
      .slice(0, 6);
  }

  return { period, entries: entries.length, totalWords: total, distinctWords: map.size, words, rising, excluded };
}

export async function excludeJournalWord(db: Db, ownerId: string, word: string): Promise<void> {
  await db.execute({
    sql: "INSERT OR IGNORE INTO journal_word_exclusions (owner_id, word) VALUES (?, ?)",
    args: [ownerId, normalizeWord(word.trim())],
  });
}

export async function restoreJournalWord(db: Db, ownerId: string, word: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM journal_word_exclusions WHERE owner_id = ? AND word = ?", args: [ownerId, normalizeWord(word.trim())] });
}
