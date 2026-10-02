/**
 * Conversão de exportações de outros apps em tarefas do LifeOS — tudo no
 * navegador, para o usuário revisar antes de importar:
 * - Todoist: CSV de exportação/modelo (TYPE, CONTENT, DESCRIPTION, PRIORITY, DATE…)
 * - Notion: CSV de um banco de dados (colunas Name/Nome, Status, Date/Prazo…)
 * - Google Tasks: JSON do Google Takeout (Tasks.json)
 * - CSV genérico: detecta colunas por nome (título, descrição, prazo, prioridade, status, projeto)
 */

export type ImportSource = "todoist" | "notion" | "google_tasks" | "csv";
export type ImportPriority = "Baixa" | "Média" | "Alta";
export type ImportStatus = "Backlog" | "A Fazer" | "Em Andamento" | "Em Revisão" | "Concluído";

export interface ImportedTask {
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: ImportPriority;
  status: ImportStatus;
  projectName: string | null;
}

export interface ImportResult {
  source: ImportSource;
  tasks: ImportedTask[];
  skipped: number;
  warnings: string[];
}

/** CSV com aspas, vírgula ou ponto e vírgula, quebras de linha dentro de aspas e BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const MONTHS_EN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTHS_PT: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

const pad = (n: number) => String(n).padStart(2, "0");
function valid(y: number, m: number, d: number): string | null {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Datas em ISO, dd/mm/aaaa, "October 5, 2026" ou "5 de out de 2026". Texto livre ("toda segunda") vira null. */
export function parseLooseDate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return valid(+m[3], +m[2], +m[1]);
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(s);
  if (m && MONTHS_EN[m[1].toLowerCase()]) return valid(+m[3], MONTHS_EN[m[1].toLowerCase()], +m[2]);
  m = /^(\d{1,2}) (?:de )?([a-zç]{3})[a-zç]*\.? (?:de )?(\d{4})/i.exec(s);
  if (m && MONTHS_PT[m[2].toLowerCase()]) return valid(+m[3], MONTHS_PT[m[2].toLowerCase()], +m[1]);
  return null;
}

function normalizeHeader(h: string) {
  return h.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function findCol(headers: string[], names: string[]): number {
  const norm = headers.map(normalizeHeader);
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export function mapStatus(raw: string | null | undefined): ImportStatus {
  const s = normalizeHeader(raw ?? "");
  if (!s) return "A Fazer";
  if (/(done|complete|conclu|feito|finaliz)/.test(s) || ["x", "true", "sim", "yes", "1"].includes(s)) return "Concluído";
  if (/(progress|andamento|fazendo|doing)/.test(s)) return "Em Andamento";
  if (/(review|revis)/.test(s)) return "Em Revisão";
  if (/(backlog|someday|algum dia|ideia)/.test(s)) return "Backlog";
  return "A Fazer";
}

export function mapPriority(raw: string | null | undefined): ImportPriority {
  const s = normalizeHeader(raw ?? "");
  if (/(alta|high|urgent|p1|critica)/.test(s)) return "Alta";
  if (/(baixa|low|p4)/.test(s)) return "Baixa";
  return "Média";
}

function clean(title: string) {
  return title.replace(/\s+/g, " ").trim().slice(0, 200);
}

function parseTodoist(rows: string[][], fileName: string): ImportResult {
  const [h, ...body] = rows;
  const iType = findCol(h, ["type"]);
  const iContent = findCol(h, ["content"]);
  const iDesc = findCol(h, ["description"]);
  const iPrio = findCol(h, ["priority"]);
  const iDate = findCol(h, ["date", "deadline"]);
  const projectFromFile = fileName.replace(/\.csv$/i, "").replace(/[_-]+/g, " ").trim() || null;
  let section: string | null = null;
  const tasks: ImportedTask[] = [];
  let skipped = 0;
  const warnings: string[] = [];
  let looseDates = 0;
  for (const r of body) {
    const type = (r[iType] ?? "").trim().toLowerCase();
    if (type === "section") {
      section = clean(r[iContent] ?? "") || null;
      continue;
    }
    if (type && type !== "task") {
      skipped++;
      continue;
    }
    const title = clean(r[iContent] ?? "");
    if (!title) {
      skipped++;
      continue;
    }
    const rawDate = iDate >= 0 ? r[iDate] : "";
    const due = parseLooseDate(rawDate);
    if (rawDate?.trim() && !due) looseDates++;
    // No CSV do Todoist, PRIORITY 1 é a mais alta (p1) e 4 a mais baixa.
    const p = Number(r[iPrio]);
    const priority: ImportPriority = p === 1 ? "Alta" : p === 4 ? "Baixa" : "Média";
    const desc = [iDesc >= 0 ? r[iDesc]?.trim() : "", rawDate?.trim() && !due ? `Data original no Todoist: ${rawDate.trim()}` : ""].filter(Boolean).join("\n");
    tasks.push({ title, description: desc || null, dueDate: due, priority, status: "A Fazer", projectName: section ? `${projectFromFile ?? "Todoist"} · ${section}` : projectFromFile });
  }
  if (looseDates) warnings.push(`${looseDates} data(s) em texto livre (ex.: "toda segunda") foram para a descrição.`);
  return { source: "todoist", tasks, skipped, warnings };
}

function parseGenericCsv(rows: string[][], source: ImportSource): ImportResult {
  const [h, ...body] = rows;
  const iTitle = findCol(h, ["name", "nome", "title", "titulo", "tarefa", "task", "content"]);
  if (iTitle < 0) return { source, tasks: [], skipped: body.length, warnings: ["Não encontrei a coluna do título (Name/Nome/Title/Tarefa)."] };
  const iDesc = findCol(h, ["description", "descricao", "notes", "notas", "detalhes"]);
  const iDue = findCol(h, ["due", "due date", "date", "data", "prazo", "vencimento", "deadline"]);
  const iPrio = findCol(h, ["priority", "prioridade"]);
  const iStatus = findCol(h, ["status", "estado", "done", "concluida", "completed", "feito"]);
  const iProject = findCol(h, ["project", "projeto", "list", "lista", "area"]);
  const tasks: ImportedTask[] = [];
  let skipped = 0;
  for (const r of body) {
    const title = clean(r[iTitle] ?? "");
    if (!title) {
      skipped++;
      continue;
    }
    tasks.push({
      title,
      description: iDesc >= 0 ? r[iDesc]?.trim() || null : null,
      dueDate: iDue >= 0 ? parseLooseDate(r[iDue]) : null,
      priority: iPrio >= 0 ? mapPriority(r[iPrio]) : "Média",
      status: iStatus >= 0 ? mapStatus(r[iStatus]) : "A Fazer",
      // Notion exporta relações como "Nome (https://www.notion.so/…)"; fica só o nome.
      projectName: iProject >= 0 ? (r[iProject] ?? "").replace(/\s*\(https?:\/\/[^)]+\)/g, "").split(",")[0].trim() || null : null,
    });
  }
  return { source, tasks, skipped, warnings: [] };
}

interface GoogleTaskList {
  title?: string;
  items?: Array<{ title?: string; notes?: string; due?: string; status?: string; deleted?: boolean }>;
}

function parseGoogleTasks(json: unknown): ImportResult {
  const lists = (json as { items?: GoogleTaskList[] })?.items;
  if (!Array.isArray(lists)) return { source: "google_tasks", tasks: [], skipped: 0, warnings: ["Este JSON não parece ser o Tasks.json do Google Takeout."] };
  const tasks: ImportedTask[] = [];
  let skipped = 0;
  for (const list of lists) {
    for (const t of list.items ?? []) {
      const title = clean(t.title ?? "");
      if (!title || t.deleted) {
        skipped++;
        continue;
      }
      tasks.push({
        title,
        description: t.notes?.trim() || null,
        dueDate: parseLooseDate(t.due),
        priority: "Média",
        status: t.status === "completed" ? "Concluído" : "A Fazer",
        projectName: list.title?.trim() || null,
      });
    }
  }
  return { source: "google_tasks", tasks, skipped, warnings: [] };
}

/** Detecta o formato pelo conteúdo do arquivo e converte. */
export function parseImportFile(fileName: string, text: string): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return parseGoogleTasks(JSON.parse(trimmed));
    } catch {
      return { source: "google_tasks", tasks: [], skipped: 0, warnings: ["JSON inválido."] };
    }
  }
  const rows = parseCsv(text);
  if (rows.length < 2) return { source: "csv", tasks: [], skipped: 0, warnings: ["O arquivo não tem linhas para importar."] };
  const headers = rows[0].map(normalizeHeader);
  if (headers.includes("type") && headers.includes("content")) return parseTodoist(rows, fileName);
  const looksNotion = headers.includes("name") && (headers.includes("status") || headers.includes("tags") || headers.includes("created time"));
  return parseGenericCsv(rows, looksNotion ? "notion" : "csv");
}
