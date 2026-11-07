import { api } from "./api";

/** Espelho de /api/habilidades (Árvore de Habilidades 2.0). Nível, nota e prática vêm sempre do servidor. */

export type SkillDomain = "saude" | "educacao" | "pessoal" | "trabalho";
export type ProofKind = "quiz" | "desafio" | "misto";
export type LinkKind = "modalidade" | "formacao" | "disciplina" | "projeto";
export interface LevelDef {
  level: number;
  title: string;
  criteria: string;
}

export interface PersonalSkill {
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
  depth: number;
  path: string[];
  childCount: number;
  practice: { minutes: number; sessions: number; lastAt: string | null; label: string | null } | null;
  practiceNeeded: number | null;
  openProof: { id: string; targetLevel: number; status: string; expiresAt: string } | null;
  lastProof: { id: string; targetLevel: number; status: string; score: number | null; at: string } | null;
  retryAt: string | null;
}

export interface SkillTreeView {
  domains: Array<{ key: SkillDomain; label: string; hint: string; skills: number; levels: number; pct: number }>;
  skills: PersonalSkill[];
  stats: { skills: number; verifiedLevels: number; maxed: number; domainsVerified: number; branched: number; topLevel: number; proofsTaken: number; proofsPassed: number };
  ai: { available: boolean; enabled: boolean; message: string };
  rules: { passScore: number; passScores: number[]; expiresHours: number; retryCooldownHours: number; maxPerDay: number; maxDepth: number; maxSkills: number };
}

export interface SkillInput {
  name: string;
  description?: string | null;
  icon?: string;
  maxLevel?: number;
  levels?: Array<{ title: string; criteria: string }>;
  proofMode?: ProofKind;
  linkKind?: LinkKind | null;
  linkRef?: string | null;
  practiceMinutesPerLevel?: number | null;
}

export interface BranchNode {
  ref?: string;
  name: string;
  description?: string | null;
  icon?: string;
  maxLevel?: number;
  levels?: Array<{ title: string; criteria: string }>;
  proofMode?: ProofKind;
  children: BranchNode[];
}
export interface BranchProposal {
  domain: SkillDomain;
  parentId: string | null;
  summary: string;
  nodes: BranchNode[];
  count: number;
}

export interface ProofItem {
  id: string;
  type: "choice" | "open" | "challenge";
  prompt: string;
  options?: string[];
  rubric?: string[];
  format?: "texto" | "codigo";
  answerIndex?: number;
  explanation?: string;
  expected?: string;
}
export interface ItemResult {
  id: string;
  score: number;
  feedback: string;
  gaps: string[];
}
export interface Proof {
  id: string;
  skillId: string;
  targetLevel: number;
  kind: ProofKind;
  status: "aberta" | "corrigindo" | "aprovada" | "reprovada" | "expirada";
  passScore: number;
  score: number | null;
  createdAt: string;
  expiresAt: string;
  submittedAt: string | null;
  items: ProofItem[];
  answers: Record<string, string | number>;
  result: { items: ItemResult[]; summary: string; reward: { xp: number; coins: number } | null; newLevel: number | null } | null;
}
export interface ProofSummary {
  id: string;
  targetLevel: number;
  kind: ProofKind;
  status: Proof["status"];
  score: number | null;
  createdAt: string;
  submittedAt: string | null;
}
export interface SkillsSummary {
  stats: SkillTreeView["stats"];
  domains: Array<{ key: SkillDomain; label: string; levels: number; skills: number }>;
  top: Array<{ id: string; name: string; domain: SkillDomain; icon: string; level: number; maxLevel: number; title: string | null }>;
  recent: Array<{ name: string; domain: SkillDomain; level: number; score: number; at: string }>;
  openProofs: Array<{ id: string; skillId: string; name: string; domain: SkillDomain; level: number; expiresAt: string }>;
}
export interface ProofHistory {
  summary: { total: number; approved: number; failed: number; open: number; passRate: number | null; avgScore: number | null; bestScore: number | null; avgAttemptsToPass: number | null; firstAt: string | null; lastAt: string | null };
  series: Array<{ id: string; at: string; score: number; passScore: number; passed: boolean; skillName: string; domain: SkillDomain; level: number }>;
  months: Array<{ month: string; approved: number; failed: number; avgScore: number | null }>;
  bySkill: Array<{ skillId: string; name: string; path: string[]; domain: SkillDomain; level: number; maxLevel: number; attempts: number; approved: number; best: number; avg: number | null; last: string | null }>;
  items: Array<{ id: string; skillId: string; skillName: string; path: string[]; domain: SkillDomain; targetLevel: number; levelTitle: string | null; kind: ProofKind; status: Proof["status"]; score: number | null; passScore: number; createdAt: string; submittedAt: string | null; minutes: number | null }>;
}
export type LinkOptions = Record<LinkKind, Array<{ id: string; label: string }>>;

export const personalSkillsService = {
  tree: () => api.get<SkillTreeView>("/habilidades"),
  summary: (domain?: SkillDomain | null) => api.get<SkillsSummary>(`/habilidades/resumo${domain ? `?tronco=${domain}` : ""}`),
  links: () => api.get<LinkOptions>("/habilidades/vinculos"),
  history: (f: { skillId?: string | null; domain?: SkillDomain | null } = {}) => {
    const q = new URLSearchParams();
    if (f.skillId) q.set("habilidade", f.skillId);
    if (f.domain) q.set("tronco", f.domain);
    const qs = q.toString();
    return api.get<ProofHistory>(`/habilidades/historico${qs ? `?${qs}` : ""}`);
  },
  create: (input: SkillInput & { domain: SkillDomain; parentId?: string | null }) => api.post<PersonalSkill>("/habilidades", input),
  createBranch: (input: { domain: SkillDomain; parentId?: string | null; source: "manual" | "ia"; nodes: BranchNode[] }) => api.post<{ created: number; ids: string[] }>("/habilidades/galho", input),
  update: (id: string, patch: Partial<SkillInput> & { parentId?: string | null; domain?: SkillDomain }) => api.patch<PersonalSkill>(`/habilidades/${id}`, patch),
  remove: (id: string) => api.delete<{ removed: number }>(`/habilidades/${id}`),
  planBranch: (input: { goal: string; domain?: SkillDomain | null; parentId?: string | null; detail?: PlanDetail }) => api.post<BranchProposal>("/habilidades/ia/galho", input),
  suggestLevels: (input: { name: string; description?: string | null; domain: SkillDomain; maxLevel: number; path?: string[] }) => api.post<{ levels: LevelDef[] }>("/habilidades/ia/niveis", input),
  proofs: (skillId: string) => api.get<ProofSummary[]>(`/habilidades/${skillId}/provas`),
  startProof: (skillId: string, kind?: ProofKind) => api.post<Proof>(`/habilidades/${skillId}/provas`, kind ? { kind } : {}),
  proof: (id: string) => api.get<Proof>(`/habilidades/provas/${id}`),
  saveDraft: (id: string, answers: Record<string, string | number>) => api.put<{ ok: true }>(`/habilidades/provas/${id}/rascunho`, { answers }),
  submit: (id: string, answers: Record<string, string | number>) => api.post<Proof>(`/habilidades/provas/${id}/entregar`, { answers }),
  abandon: (id: string) => api.post<{ ok: true }>(`/habilidades/provas/${id}/abandonar`),
};

export const DOMAINS: SkillDomain[] = ["saude", "educacao", "pessoal", "trabalho"];
export const DOMAIN_LABEL: Record<SkillDomain, string> = { saude: "Saúde", educacao: "Educação", pessoal: "Pessoal", trabalho: "Trabalho" };
export type PlanDetail = "essencial" | "completo" | "detalhado";
export const PLAN_DETAIL_META: Record<PlanDetail, { label: string; hint: string }> = {
  essencial: { label: "Essencial", hint: "8–15 habilidades: só o núcleo" },
  completo: { label: "Completo", hint: "18–35: módulos e tópicos" },
  detalhado: { label: "Detalhado", hint: "35–65: trilha de curso inteira" },
};
export const PROOF_LABEL: Record<ProofKind, string> = { quiz: "Quiz (teoria)", desafio: "Desafio prático", misto: "Misto" };
export const LINK_LABEL: Record<LinkKind, string> = { modalidade: "Treino (luta/dança)", formacao: "Formação (Educação)", disciplina: "Disciplina (Educação)", projeto: "Projeto (Foco)" };
