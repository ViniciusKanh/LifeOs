import type { Client, InStatement } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  DOMAIN_META,
  LINK_KINDS,
  PROOF_KINDS,
  PROOF_RULES,
  SKILL_DOMAINS,
  SKILL_ICONS,
  SKILL_LIMITS,
  defaultLevels,
  type LevelDef,
  type LinkKind,
  type ProofKind,
  type SkillDomain,
} from "../config/personalSkills.js";
import { TECHNIQUE_MODALITIES } from "./healthService.js";

/* ============================================================
 * Árvore de Habilidades 2.0 — habilidades do próprio usuário.
 *
 * Quatro troncos fixos (Saúde, Educação, Pessoal, Trabalho); dentro deles o
 * usuário cria habilidades e sub-habilidades (ex.: Pessoal › Machine Learning
 * › pandas). O nível NÃO é editável: só sobe por prova aprovada
 * (skillProofService). A prática exibida vem das fontes reais vinculadas
 * (treinos, estudos, foco), nunca de números digitados.
 * ============================================================ */

export class SkillError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface SkillRecord {
  id: string;
  parentId: string | null;
  domain: SkillDomain;
  name: string;
  description: string | null;
  icon: string;
  maxLevel: number;
  level: number;
  levels: LevelDef[];
  proofMode: ProofKind;
  linkKind: LinkKind | null;
  linkRef: string | null;
  practiceMinutesPerLevel: number | null;
  source: "manual" | "ia";
  position: number;
  lastLevelAt: string | null;
  createdAt: string;
}

export interface SkillView extends SkillRecord {
  depth: number;
  path: string[];
  childCount: number;
  practice: { minutes: number; sessions: number; lastAt: string | null; label: string | null } | null;
  /** Prática exigida para a próxima prova (null = sem requisito de prática). */
  practiceNeeded: number | null;
  openProof: { id: string; targetLevel: number; status: string; expiresAt: string } | null;
  lastProof: { id: string; targetLevel: number; status: string; score: number | null; at: string } | null;
  /** Momento a partir do qual pode tentar de novo (após reprovação recente). */
  retryAt: string | null;
}

const parseLevels = (raw: unknown, maxLevel: number): LevelDef[] => {
  try {
    const arr = JSON.parse(String(raw ?? "[]")) as unknown;
    if (Array.isArray(arr) && arr.length) return sanitizeLevels(arr, maxLevel);
  } catch {
    /* JSON corrompido → critérios padrão */
  }
  return defaultLevels(maxLevel);
};

/** Garante exatamente `maxLevel` níveis, com textos limitados; faltantes recebem o padrão. */
export function sanitizeLevels(raw: unknown[], maxLevel: number): LevelDef[] {
  const base = defaultLevels(maxLevel);
  return base.map((d, i) => {
    const r = raw[i] as { title?: unknown; criteria?: unknown } | undefined;
    const title = typeof r?.title === "string" && r.title.trim() ? r.title.trim().slice(0, 40) : d.title;
    const criteria = typeof r?.criteria === "string" && r.criteria.trim() ? r.criteria.trim().slice(0, SKILL_LIMITS.criteriaMax) : d.criteria;
    return { level: i + 1, title, criteria };
  });
}

export const iconOrDefault = (v: unknown) => ((SKILL_ICONS as readonly string[]).includes(String(v)) ? String(v) : "sparkles");

function toRecord(r: Record<string, unknown>): SkillRecord {
  const maxLevel = Number(r.max_level);
  return {
    id: String(r.id),
    parentId: r.parent_id ? String(r.parent_id) : null,
    domain: String(r.domain) as SkillDomain,
    name: String(r.name),
    description: r.description ? String(r.description) : null,
    icon: String(r.icon),
    maxLevel,
    level: Number(r.level),
    levels: parseLevels(r.levels_json, maxLevel),
    proofMode: String(r.proof_mode) as ProofKind,
    linkKind: r.link_kind ? (String(r.link_kind) as LinkKind) : null,
    linkRef: r.link_ref ? String(r.link_ref) : null,
    practiceMinutesPerLevel: r.practice_minutes_per_level == null ? null : Number(r.practice_minutes_per_level),
    source: String(r.source) === "ia" ? "ia" : "manual",
    position: Number(r.position ?? 0),
    lastLevelAt: r.last_level_at ? String(r.last_level_at) : null,
    createdAt: String(r.created_at),
  };
}

export async function loadSkills(db: Client, ownerId: string): Promise<SkillRecord[]> {
  const r = await db.execute({ sql: "SELECT * FROM personal_skills WHERE owner_id = ? ORDER BY domain, position, created_at", args: [ownerId] });
  return r.rows.map((x) => toRecord(x as unknown as Record<string, unknown>));
}

export async function getSkill(db: Client, ownerId: string, id: string): Promise<SkillRecord> {
  const r = await db.execute({ sql: "SELECT * FROM personal_skills WHERE id = ? AND owner_id = ?", args: [id, ownerId] });
  if (!r.rows[0]) throw new SkillError(404, "Habilidade não encontrada.");
  return toRecord(r.rows[0] as unknown as Record<string, unknown>);
}

/* ─────────────────────────── prática (fontes reais) ─────────────────────────── */

type Practice = NonNullable<SkillView["practice"]>;

/** Minutos e sessões medidos na origem vinculada. Cada consulta filtra por owner_id. */
export async function practiceFor(db: Client, ownerId: string, skills: SkillRecord[]): Promise<Map<string, Practice>> {
  const out = new Map<string, Practice>();
  const linked = skills.filter((s) => s.linkKind && s.linkRef);
  if (!linked.length) return out;
  const refs = (k: LinkKind) => [...new Set(linked.filter((s) => s.linkKind === k).map((s) => s.linkRef!))];
  const agg = new Map<string, { minutes: number; sessions: number; lastAt: string | null }>();
  const add = (kind: LinkKind, rows: Array<Record<string, unknown>>) => {
    for (const r of rows) agg.set(`${kind}:${String(r.ref)}`, { minutes: Number(r.minutes ?? 0), sessions: Number(r.sessions ?? 0), lastAt: r.last_at ? String(r.last_at) : null });
  };
  const inList = (n: number) => Array(n).fill("?").join(",");
  const queries: Array<Promise<void>> = [];
  const mod = refs("modalidade");
  if (mod.length)
    queries.push(
      db
        .execute({ sql: `SELECT modality AS ref, COALESCE(SUM(duration_minutes), 0) AS minutes, COUNT(*) AS sessions, MAX(performed_at) AS last_at FROM workouts WHERE owner_id = ? AND modality IN (${inList(mod.length)}) GROUP BY modality`, args: [ownerId, ...mod] })
        .then((r) => add("modalidade", r.rows as unknown as Array<Record<string, unknown>>)),
    );
  const edu = refs("formacao");
  if (edu.length)
    queries.push(
      db
        .execute({ sql: `SELECT education_id AS ref, COALESCE(SUM(duration_minutes), 0) AS minutes, COUNT(*) AS sessions, MAX(occurred_at) AS last_at FROM study_sessions WHERE owner_id = ? AND education_id IN (${inList(edu.length)}) GROUP BY education_id`, args: [ownerId, ...edu] })
        .then((r) => add("formacao", r.rows as unknown as Array<Record<string, unknown>>)),
    );
  const sub = refs("disciplina");
  if (sub.length)
    queries.push(
      db
        .execute({ sql: `SELECT subject_id AS ref, COALESCE(SUM(duration_minutes), 0) AS minutes, COUNT(*) AS sessions, MAX(occurred_at) AS last_at FROM study_sessions WHERE owner_id = ? AND subject_id IN (${inList(sub.length)}) GROUP BY subject_id`, args: [ownerId, ...sub] })
        .then((r) => add("disciplina", r.rows as unknown as Array<Record<string, unknown>>)),
    );
  const proj = refs("projeto");
  if (proj.length)
    queries.push(
      db
        .execute({ sql: `SELECT project_id AS ref, COALESCE(SUM(actual_minutes), 0) AS minutes, COUNT(*) AS sessions, MAX(started_at) AS last_at FROM focus_sessions WHERE owner_id = ? AND project_id IN (${inList(proj.length)}) AND actual_minutes IS NOT NULL GROUP BY project_id`, args: [ownerId, ...proj] })
        .then((r) => add("projeto", r.rows as unknown as Array<Record<string, unknown>>)),
    );
  await Promise.all(queries);
  const labels = await linkLabels(db, ownerId, linked);
  for (const s of linked) {
    const a = agg.get(`${s.linkKind}:${s.linkRef}`) ?? { minutes: 0, sessions: 0, lastAt: null };
    out.set(s.id, { ...a, label: labels.get(`${s.linkKind}:${s.linkRef}`) ?? null });
  }
  return out;
}

const MODALITY_LABELS: Record<string, string> = {
  muay_thai: "Muay Thai", jiu_jitsu: "Jiu-jitsu", boxe: "Boxe", mma: "MMA", judo: "Judô", kickboxing: "Kickboxing", karate: "Karatê", wrestling: "Wrestling", capoeira: "Capoeira", outra: "Outra luta",
  forro: "Forró", samba: "Samba", salsa: "Salsa", zouk: "Zouk", bachata: "Bachata", hip_hop: "Hip hop", ballet: "Balé", jazz: "Jazz", contemporanea: "Dança contemporânea", danca_outra: "Outra dança",
};

async function linkLabels(db: Client, ownerId: string, skills: SkillRecord[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const s of skills) if (s.linkKind === "modalidade") m.set(`modalidade:${s.linkRef}`, MODALITY_LABELS[s.linkRef!] ?? s.linkRef!);
  const ids = (k: LinkKind) => [...new Set(skills.filter((s) => s.linkKind === k).map((s) => s.linkRef!))];
  const q = async (k: LinkKind, sql: string) => {
    const list = ids(k);
    if (!list.length) return;
    const r = await db.execute({ sql: sql.replace("$IN", Array(list.length).fill("?").join(",")), args: [ownerId, ...list] });
    for (const row of r.rows) m.set(`${k}:${String(row.id)}`, String(row.label));
  };
  await Promise.all([
    q("formacao", "SELECT id, course_name AS label FROM educations WHERE owner_id = ? AND id IN ($IN)"),
    q("disciplina", "SELECT id, name AS label FROM subjects WHERE owner_id = ? AND id IN ($IN)"),
    q("projeto", "SELECT id, name AS label FROM projects WHERE owner_id = ? AND id IN ($IN)"),
  ]);
  return m;
}

/** Opções reais de vínculo para o formulário (só do próprio usuário). */
export async function linkOptions(db: Client, ownerId: string) {
  const [edu, sub, proj] = await Promise.all([
    db.execute({ sql: "SELECT id, course_name AS label FROM educations WHERE owner_id = ? ORDER BY course_name", args: [ownerId] }),
    db.execute({ sql: "SELECT s.id, s.name AS label FROM subjects s WHERE s.owner_id = ? ORDER BY s.name LIMIT 200", args: [ownerId] }),
    db.execute({ sql: "SELECT id, name AS label FROM projects WHERE owner_id = ? AND archived_at IS NULL ORDER BY name LIMIT 200", args: [ownerId] }),
  ]);
  const map = (rows: typeof edu.rows) => rows.map((r) => ({ id: String(r.id), label: String(r.label) }));
  return {
    modalidade: TECHNIQUE_MODALITIES.map((k) => ({ id: k, label: MODALITY_LABELS[k] ?? k })),
    formacao: map(edu.rows),
    disciplina: map(sub.rows),
    projeto: map(proj.rows),
  };
}

async function assertLink(db: Client, ownerId: string, kind: LinkKind | null, ref: string | null) {
  if (!kind) return;
  if (!ref) throw new SkillError(400, "Escolha a origem da prática.");
  if (kind === "modalidade") {
    if (!(TECHNIQUE_MODALITIES as readonly string[]).includes(ref)) throw new SkillError(400, "Modalidade inválida.");
    return;
  }
  const table = { formacao: "educations", disciplina: "subjects", projeto: "projects" }[kind];
  const r = await db.execute({ sql: `SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ?`, args: [ref, ownerId] });
  if (!r.rows.length) throw new SkillError(400, "Origem da prática não encontrada.");
}

/* ─────────────────────────── visão da árvore ─────────────────────────── */

export function practiceNeededFor(s: Pick<SkillRecord, "practiceMinutesPerLevel" | "level" | "maxLevel" | "linkKind">): number | null {
  if (!s.linkKind || !s.practiceMinutesPerLevel || s.level >= s.maxLevel) return null;
  return s.practiceMinutesPerLevel * (s.level + 1);
}

/** Datas do SQLite ("YYYY-MM-DD HH:MM:SS") são UTC. */
export const sqlTimeMs = (v: string) => Date.parse(v.includes("T") ? v : `${v.replace(" ", "T")}Z`);
const addHours = (iso: string, h: number) => new Date(sqlTimeMs(iso) + h * 3_600_000).toISOString();

export async function treeView(db: Client, ownerId: string, aiStatus: { available: boolean; enabled: boolean; message: string }) {
  const skills = await loadSkills(db, ownerId);
  const [practice, proofs, passed] = await Promise.all([
    practiceFor(db, ownerId, skills),
    db.execute({
      sql: `SELECT a.id, a.skill_id, a.target_level, a.status, a.score, a.created_at, a.submitted_at, a.expires_at FROM skill_assessments a
             WHERE a.owner_id = ? AND a.created_at = (SELECT MAX(b.created_at) FROM skill_assessments b WHERE b.owner_id = a.owner_id AND b.skill_id = a.skill_id)`,
      args: [ownerId],
    }),
    db.execute({ sql: "SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'aprovada' THEN 1 ELSE 0 END) AS ok FROM skill_assessments WHERE owner_id = ? AND status IN ('aprovada', 'reprovada')", args: [ownerId] }),
  ]);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const children = new Map<string, number>();
  for (const s of skills) if (s.parentId) children.set(s.parentId, (children.get(s.parentId) ?? 0) + 1);
  const lastBySkill = new Map(proofs.rows.map((r) => [String(r.skill_id), r]));
  const now = Date.now();

  const views: SkillView[] = skills.map((s) => {
    const path: string[] = [];
    let cur: SkillRecord | undefined = s;
    let guard = 0;
    while (cur && guard++ < 12) {
      path.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const last = lastBySkill.get(s.id);
    const open = last && (last.status === "aberta" || last.status === "corrigindo") && sqlTimeMs(String(last.expires_at)) > now;
    const retryAt = last && last.status === "reprovada" && last.submitted_at ? addHours(String(last.submitted_at), PROOF_RULES.retryCooldownHours) : null;
    return {
      ...s,
      depth: path.length,
      path,
      childCount: children.get(s.id) ?? 0,
      practice: practice.get(s.id) ?? null,
      practiceNeeded: practiceNeededFor(s),
      openProof: open ? { id: String(last.id), targetLevel: Number(last.target_level), status: String(last.status), expiresAt: String(last.expires_at) } : null,
      lastProof: last ? { id: String(last.id), targetLevel: Number(last.target_level), status: String(last.status), score: last.score == null ? null : Number(last.score), at: String(last.submitted_at ?? last.created_at) } : null,
      retryAt: retryAt && Date.parse(retryAt) > now ? retryAt : null,
    };
  });

  const stats = skillStats(skills);
  return {
    domains: SKILL_DOMAINS.map((d) => {
      const list = skills.filter((s) => s.domain === d);
      const levels = list.reduce((a, s) => a + s.level, 0);
      const max = list.reduce((a, s) => a + s.maxLevel, 0);
      return { key: d, label: DOMAIN_META[d].label, hint: DOMAIN_META[d].hint, skills: list.length, levels, pct: max ? Math.round((levels / max) * 100) : 0 };
    }),
    skills: views,
    stats: { ...stats, proofsTaken: Number(passed.rows[0]?.n ?? 0), proofsPassed: Number(passed.rows[0]?.ok ?? 0) },
    ai: aiStatus,
    rules: { passScore: PROOF_RULES.passScore, expiresHours: PROOF_RULES.expiresHours, retryCooldownHours: PROOF_RULES.retryCooldownHours, maxPerDay: PROOF_RULES.maxPerDay, maxDepth: SKILL_LIMITS.maxDepth, maxSkills: SKILL_LIMITS.maxSkills },
  };
}

/** Fatos agregados (conquistas, Códex, Perfil). Função pura sobre os registros. */
export function skillStats(skills: Pick<SkillRecord, "id" | "parentId" | "domain" | "level" | "maxLevel">[]) {
  const children = new Map<string, number>();
  for (const s of skills) if (s.parentId) children.set(s.parentId, (children.get(s.parentId) ?? 0) + 1);
  return {
    skills: skills.length,
    verifiedLevels: skills.reduce((a, s) => a + s.level, 0),
    maxed: skills.filter((s) => s.level > 0 && s.level >= s.maxLevel).length,
    domainsVerified: new Set(skills.filter((s) => s.level > 0).map((s) => s.domain)).size,
    branched: [...children.values()].filter((n) => n >= 3).length,
    topLevel: skills.reduce((a, s) => Math.max(a, s.level), 0),
  };
}

/* ─────────────────────────── criação e edição ─────────────────────────── */

export interface SkillInput {
  name: string;
  description?: string | null;
  icon?: string;
  maxLevel?: number;
  levels?: Array<{ title?: string; criteria?: string }>;
  proofMode?: ProofKind;
  linkKind?: LinkKind | null;
  linkRef?: string | null;
  practiceMinutesPerLevel?: number | null;
}

function depthOf(byId: Map<string, SkillRecord>, id: string | null): number {
  let d = 0;
  let cur = id ? byId.get(id) : undefined;
  while (cur && d < 20) {
    d += 1;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return d;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function insertStatement(ownerId: string, id: string, domain: SkillDomain, parentId: string | null, input: SkillInput, position: number, source: "manual" | "ia"): InStatement {
  const maxLevel = Math.min(10, Math.max(1, Math.round(input.maxLevel ?? 5)));
  const levels = sanitizeLevels(input.levels ?? [], maxLevel);
  const proof = (PROOF_KINDS as readonly string[]).includes(String(input.proofMode)) ? input.proofMode! : "quiz";
  return {
    sql: `INSERT INTO personal_skills (id, owner_id, parent_id, domain, name, description, icon, max_level, levels_json, proof_mode, link_kind, link_ref, practice_minutes_per_level, source, position)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      ownerId,
      parentId,
      domain,
      input.name.trim().slice(0, SKILL_LIMITS.nameMax),
      input.description?.trim().slice(0, SKILL_LIMITS.descriptionMax) || null,
      iconOrDefault(input.icon),
      maxLevel,
      JSON.stringify(levels),
      proof,
      input.linkKind ?? null,
      input.linkKind ? input.linkRef ?? null : null,
      input.linkKind && input.practiceMinutesPerLevel ? Math.round(input.practiceMinutesPerLevel) : null,
      source,
      position,
    ],
  };
}

export async function createSkill(db: Client, ownerId: string, domain: SkillDomain, parentId: string | null, input: SkillInput) {
  const created = await createTree(db, ownerId, domain, parentId, [{ ...input, children: [] }], "manual");
  return created[0]!;
}

export interface TreeNodeInput extends SkillInput {
  children?: TreeNodeInput[];
}

/**
 * Cria um galho inteiro (habilidade + sub-habilidades) num único batch: ou
 * entra tudo, ou nada. Usado pela criação manual e pela proposta da IA já
 * confirmada pelo usuário.
 */
export async function createTree(db: Client, ownerId: string, domain: SkillDomain, parentId: string | null, nodes: TreeNodeInput[], source: "manual" | "ia"): Promise<string[]> {
  if (!(SKILL_DOMAINS as readonly string[]).includes(domain)) throw new SkillError(400, "Tronco inválido.");
  const skills = await loadSkills(db, ownerId);
  const byId = new Map(skills.map((s) => [s.id, s]));
  if (parentId) {
    const parent = byId.get(parentId);
    if (!parent) throw new SkillError(404, "Habilidade-mãe não encontrada.");
    if (parent.domain !== domain) throw new SkillError(400, "A sub-habilidade precisa ficar no mesmo tronco da habilidade-mãe.");
  }
  let count = 0;
  const walkCount = (list: TreeNodeInput[]) => list.forEach((n) => ((count += 1), walkCount(n.children ?? [])));
  walkCount(nodes);
  if (!count) throw new SkillError(400, "Nada para criar.");
  if (skills.length + count > SKILL_LIMITS.maxSkills) throw new SkillError(400, `Limite de ${SKILL_LIMITS.maxSkills} habilidades atingido.`);

  const stmts: InStatement[] = [];
  const ids: string[] = [];
  const baseDepth = depthOf(byId, parentId);
  const siblingsOf = (pid: string | null) => skills.filter((s) => s.parentId === pid && s.domain === domain);

  const walk = async (list: TreeNodeInput[], pid: string | null, depth: number, existing: SkillRecord[]) => {
    if (depth > SKILL_LIMITS.maxDepth) throw new SkillError(400, `A árvore aceita até ${SKILL_LIMITS.maxDepth} níveis de profundidade.`);
    if (existing.length + list.length > SKILL_LIMITS.maxChildren) throw new SkillError(400, `Cada habilidade aceita até ${SKILL_LIMITS.maxChildren} sub-habilidades.`);
    const names = new Set(existing.map((s) => norm(s.name)));
    let position = existing.reduce((a, s) => Math.max(a, s.position + 1), 0);
    for (const n of list) {
      const name = n.name?.trim();
      if (!name) throw new SkillError(400, "Dê um nome para a habilidade.");
      if (names.has(norm(name))) throw new SkillError(409, `Já existe “${name}” neste galho.`);
      names.add(norm(name));
      await assertLink(db, ownerId, n.linkKind ?? null, n.linkRef ?? null);
      const id = nanoid();
      ids.push(id);
      stmts.push(insertStatement(ownerId, id, domain, pid, n, position++, source));
      if (n.children?.length) await walk(n.children, id, depth + 1, []);
    }
  };
  await walk(nodes, parentId, baseDepth + 1, siblingsOf(parentId));
  await db.batch(stmts, "write");
  return ids;
}

export async function updateSkill(db: Client, ownerId: string, id: string, patch: Partial<SkillInput> & { parentId?: string | null; domain?: SkillDomain; position?: number }) {
  const s = await getSkill(db, ownerId, id);
  const skills = await loadSkills(db, ownerId);
  const byId = new Map(skills.map((x) => [x.id, x]));
  let parentId = s.parentId;
  let domain = s.domain;

  if (patch.parentId !== undefined && patch.parentId !== s.parentId) {
    if (patch.parentId) {
      const parent = byId.get(patch.parentId);
      if (!parent) throw new SkillError(404, "Habilidade-mãe não encontrada.");
      // Sem ciclos: a nova mãe não pode estar dentro do galho que está sendo movido.
      let cur: SkillRecord | undefined = parent;
      while (cur) {
        if (cur.id === s.id) throw new SkillError(400, "Uma habilidade não pode ficar dentro de uma das próprias sub-habilidades.");
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      domain = parent.domain;
    }
    parentId = patch.parentId;
  }
  if (patch.domain && patch.domain !== domain) {
    if (parentId) throw new SkillError(400, "Só habilidades da raiz mudam de tronco — mova a habilidade para a raiz antes.");
    domain = patch.domain;
  }
  // Profundidade do galho movido (subárvore inteira).
  const subtreeDepth = (sid: string): number => 1 + Math.max(0, ...skills.filter((x) => x.parentId === sid).map((x) => subtreeDepth(x.id)));
  if (depthOf(byId, parentId) + subtreeDepth(s.id) > SKILL_LIMITS.maxDepth) throw new SkillError(400, `A árvore aceita até ${SKILL_LIMITS.maxDepth} níveis de profundidade.`);

  const name = patch.name !== undefined ? patch.name.trim().slice(0, SKILL_LIMITS.nameMax) : s.name;
  if (!name) throw new SkillError(400, "Dê um nome para a habilidade.");
  if (skills.some((x) => x.id !== s.id && x.parentId === parentId && x.domain === domain && norm(x.name) === norm(name))) throw new SkillError(409, `Já existe “${name}” neste galho.`);

  // O nível máximo nunca fica abaixo do nível já comprovado.
  const maxLevel = patch.maxLevel !== undefined ? Math.min(10, Math.max(1, Math.round(patch.maxLevel))) : s.maxLevel;
  if (maxLevel < s.level) throw new SkillError(400, `O nível máximo não pode ficar abaixo do nível comprovado (${s.level}).`);
  const levels = sanitizeLevels(patch.levels ?? s.levels, maxLevel);
  const linkKind = patch.linkKind !== undefined ? patch.linkKind : s.linkKind;
  const linkRef = patch.linkRef !== undefined ? patch.linkRef : s.linkRef;
  await assertLink(db, ownerId, linkKind, linkRef);
  const practiceMin = patch.practiceMinutesPerLevel !== undefined ? patch.practiceMinutesPerLevel : s.practiceMinutesPerLevel;
  const proof = patch.proofMode && (PROOF_KINDS as readonly string[]).includes(patch.proofMode) ? patch.proofMode : s.proofMode;

  const stmts: InStatement[] = [
    {
      sql: `UPDATE personal_skills SET parent_id = ?, domain = ?, name = ?, description = ?, icon = ?, max_level = ?, levels_json = ?, proof_mode = ?,
              link_kind = ?, link_ref = ?, practice_minutes_per_level = ?, position = ?, updated_at = datetime('now')
             WHERE id = ? AND owner_id = ?`,
      args: [
        parentId,
        domain,
        name,
        patch.description !== undefined ? patch.description?.trim().slice(0, SKILL_LIMITS.descriptionMax) || null : s.description,
        patch.icon !== undefined ? iconOrDefault(patch.icon) : s.icon,
        maxLevel,
        JSON.stringify(levels),
        proof,
        linkKind,
        linkKind ? linkRef : null,
        linkKind && practiceMin ? Math.round(practiceMin) : null,
        patch.position ?? s.position,
        s.id,
        ownerId,
      ],
    },
  ];
  // Mudou de tronco: o galho inteiro acompanha.
  if (domain !== s.domain) {
    stmts.push({
      sql: `WITH RECURSIVE sub(id) AS (SELECT id FROM personal_skills WHERE parent_id = ? AND owner_id = ?
              UNION ALL SELECT p.id FROM personal_skills p JOIN sub ON p.parent_id = sub.id WHERE p.owner_id = ?)
            UPDATE personal_skills SET domain = ?, updated_at = datetime('now') WHERE owner_id = ? AND id IN (SELECT id FROM sub)`,
      args: [s.id, ownerId, ownerId, domain, ownerId],
    });
  }
  await db.batch(stmts, "write");
  return getSkill(db, ownerId, id);
}

/** Remove a habilidade e todo o galho abaixo (com as provas). */
export async function deleteSkill(db: Client, ownerId: string, id: string) {
  await getSkill(db, ownerId, id);
  const sub = `WITH RECURSIVE sub(id) AS (SELECT id FROM personal_skills WHERE id = ? AND owner_id = ?
                 UNION ALL SELECT p.id FROM personal_skills p JOIN sub ON p.parent_id = sub.id WHERE p.owner_id = ?)`;
  const count = await db.execute({ sql: `${sub} SELECT COUNT(*) AS n FROM sub`, args: [id, ownerId, ownerId] });
  await db.batch(
    [
      { sql: `${sub} DELETE FROM skill_assessments WHERE owner_id = ? AND skill_id IN (SELECT id FROM sub)`, args: [id, ownerId, ownerId, ownerId] },
      { sql: `${sub} DELETE FROM personal_skills WHERE owner_id = ? AND id IN (SELECT id FROM sub)`, args: [id, ownerId, ownerId, ownerId] },
    ],
    "write",
  );
  return { removed: Number(count.rows[0]?.n ?? 0) };
}

/** Resumo compacto para Perfil do Herói, Build e Códex. */
export async function skillsSummary(db: Client, ownerId: string) {
  const skills = await loadSkills(db, ownerId);
  const stats = skillStats(skills);
  const top = [...skills]
    .filter((s) => s.level > 0)
    .sort((a, b) => b.level - a.level || (b.lastLevelAt ?? "").localeCompare(a.lastLevelAt ?? ""))
    .slice(0, 6)
    .map((s) => ({ id: s.id, name: s.name, domain: s.domain, icon: s.icon, level: s.level, maxLevel: s.maxLevel, title: s.levels[s.level - 1]?.title ?? null }));
  const recent = await db.execute({
    sql: `SELECT a.target_level, a.score, a.submitted_at, s.name, s.domain FROM skill_assessments a JOIN personal_skills s ON s.id = a.skill_id AND s.owner_id = a.owner_id
           WHERE a.owner_id = ? AND a.status = 'aprovada' ORDER BY a.submitted_at DESC LIMIT 3`,
    args: [ownerId],
  });
  return {
    stats,
    domains: SKILL_DOMAINS.map((d) => ({ key: d, label: DOMAIN_META[d].label, levels: skills.filter((s) => s.domain === d).reduce((a, s) => a + s.level, 0), skills: skills.filter((s) => s.domain === d).length })),
    top,
    recent: recent.rows.map((r) => ({ name: String(r.name), domain: String(r.domain), level: Number(r.target_level), score: Number(r.score ?? 0), at: String(r.submitted_at) })),
  };
}

export const linkKindValid = (v: unknown): v is LinkKind => (LINK_KINDS as readonly string[]).includes(String(v));
