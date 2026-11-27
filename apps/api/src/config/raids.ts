import type { ActivityKind } from "../services/activitySignals.js";

/**
 * Balanceamento da Raid semanal. Valores são parâmetros de jogo, não métricas reais.
 *
 * Vida do chefe = clamp(MIN_HP, MAX_HP, média semanal de dano das últimas
 * BASELINE_WEEKS semanas × EFFORT_TARGET × fator de dificuldade × fator de nível).
 * Assim o chefe acompanha o ritmo real: quem faz muito enfrenta um chefe maior,
 * quem está começando enfrenta um chefe derrotável com poucas atividades.
 */
export const RAID_RULES = {
  baselineWeeks: 4,
  /** Pede um pouco mais do que a média recente (meta de esforço). */
  effortTarget: 1.05,
  minHp: 1500,
  maxHp: 60000,
  /** Usuário sem histórico: ~3 tarefas por dia útil. */
  noHistoryHp: 2500,
  difficulty: { leve: 0.8, normal: 1, desafiador: 1.25 } as const,
  /** +0,5% de vida por nível do herói (até o nível 60). */
  levelHpPct: 0.005,
  levelCap: 60,
  /** Cura: % da vida máxima por dia sem atividade, no máximo uma vez por dia. */
  healPctPerIdleDay: 0.04,
  /** Teto da cura na semana inteira, para nunca impedir a vitória sistematicamente. */
  healCapPctPerWeek: 0.12,
  /** Recompensa da derrota (multiplicada pela dificuldade). Entregue uma vez por Raid. */
  reward: { xp: 220, coins: 45 },
} as const;

/** Dano-base por atividade e limite diário de golpes daquele tipo (anti-repetição artificial). */
export const RAID_DAMAGE: Record<ActivityKind, { base: number; dailyCap: number; byDuration?: number }> = {
  tarefa: { base: 100, dailyCap: 15 },
  habito: { base: 50, dailyCap: 10 },
  leitura: { base: 120, dailyCap: 4, byDuration: 30 },
  treino: { base: 180, dailyCap: 3, byDuration: 45 },
  estudo: { base: 150, dailyCap: 4, byDuration: 45 },
  commit: { base: 80, dailyCap: 15 },
  pr: { base: 200, dailyCap: 5 },
  release: { base: 250, dailyCap: 2 },
  artigo_lido: { base: 120, dailyCap: 5 },
  artigo_fichado: { base: 160, dailyCap: 3 },
  exploracao: { base: 60, dailyCap: 5 },
  // Um golpe por dia, proporcional ao tempo real no editor (fator de duração limitado).
  programacao: { base: 150, dailyCap: 1, byDuration: 60 },
};

export type RaidFamily = "tarefas" | "habitos" | "leitura" | "treinos" | "estudo" | "codigo" | "exploracao";

/** Efeitos semanais em rodízio determinístico (índice da semana). */
export const RAID_EFFECTS: Array<{ key: string; name: string; description: string; families: RaidFamily[]; pct: number }> = [
  { key: "foco", name: "Foco Aprimorado", description: "Leitura, estudo e artigos causam 20% mais dano nesta Raid.", families: ["leitura", "estudo"], pct: 20 },
  { key: "forja", name: "Forja Acesa", description: "Commits, PRs, releases e tempo programando causam 20% mais dano nesta Raid.", families: ["codigo"], pct: 20 },
  { key: "ferro", name: "Corpo de Ferro", description: "Treinos causam 20% mais dano nesta Raid.", families: ["treinos"], pct: 20 },
  { key: "disciplina", name: "Disciplina", description: "Tarefas e hábitos causam 15% mais dano nesta Raid.", families: ["tarefas", "habitos"], pct: 15 },
];

export interface BossDef {
  key: string;
  name: string;
  title: string;
  lore: string;
}

/** Catálogo de chefes. Novos chefes entram aqui (o visual fica em engine/scenes.ts). */
export const BOSSES: BossDef[] = [
  {
    key: "golem_inercia",
    name: "Golem da Inércia",
    title: "Raid Semanal",
    lore: "O Golem da Inércia se alimenta da falta de ação. Cada registro real é um golpe; dias parados o fazem se recompor.",
  },
];
