import type { LifeDim } from "@/types";

/**
 * Rótulos e cores das 6 dimensões do Life Score (espelho de
 * apps/api/src/config/lifeScore.ts). Use daqui em vez de mapas locais.
 * Metas, Leitura e Profissional saíram na 0.5.38 — snapshots antigos com
 * essas chaves caem no rótulo genérico (a chave crua).
 */
export const LIFE_DIM_LABEL: Record<LifeDim, string> = {
  productivity: "Produtividade",
  health: "Saúde",
  habits: "Hábitos",
  education: "Educação",
  knowledge: "Conhecimento",
  code: "Código",
};

/** Tom do design system RPG por dimensão (paleta: azul produtividade, verde saúde, rosa leitura...). */
export const LIFE_DIM_TONE: Record<LifeDim, "blue" | "green" | "cyan" | "purple" | "pink" | "orange"> = {
  productivity: "blue",
  health: "green",
  habits: "cyan",
  education: "purple",
  knowledge: "pink",
  code: "orange",
};

/** Para onde levar o usuário ao tocar numa dimensão. */
export const LIFE_DIM_LINK: Record<LifeDim, string> = {
  productivity: "/tarefas",
  health: "/saude",
  habits: "/habitos",
  education: "/educacao",
  knowledge: "/biblioteca",
  code: "/forja-codigo",
};
