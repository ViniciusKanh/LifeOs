/**
 * Regras do Tesouro & Recompensas — fonte única para backend (validação,
 * resgate, gemas e IA). XP nunca é gasto: só moedas e gemas são moedas de troca.
 */
export const REWARD_RARITIES = ["comum", "incomum", "raro", "epico", "lendario"] as const;
export type RewardRarity = (typeof REWARD_RARITIES)[number];

export const REWARD_CURRENCIES = ["coin", "gem"] as const;
export type RewardCurrency = (typeof REWARD_CURRENCIES)[number];

export const LIMIT_PERIODS = ["none", "day", "week", "month"] as const;
export type LimitPeriod = (typeof LIMIT_PERIODS)[number];

/** Artes pixel art internas (public/assets/rpg/rewards/<id>.webp). */
export const REWARD_ARTS = ["tv", "dessert", "pizza", "gamepad", "trail", "moon", "spa", "travel", "coffee", "book", "music", "gift"] as const;
export type RewardArt = (typeof REWARD_ARTS)[number];

/** Palavras-chave → arte (usado na IA e como sugestão automática). */
export const ART_KEYWORDS: Array<[RewardArt, RegExp]> = [
  ["tv", /s[eé]rie|netflix|epis[oó]dio|filme|cinema|tv|streaming|anime/i],
  ["gamepad", /game|jogo|videogame|console|jogar/i],
  ["pizza", /pizza|lanche|hamb[uú]rguer|delivery|jantar/i],
  ["dessert", /doce|sobremesa|bolo|sorvete|chocolate|a[cç]a[ií]/i],
  ["coffee", /caf[eé]|ch[aá]|cafeteria/i],
  ["book", /livro|leitura|ler|hq|quadrinho/i],
  ["music", /m[uú]sica|show|playlist|[aá]lbum|instrumento/i],
  ["spa", /spa|banho|massagem|skin|autocuidado|relax/i],
  ["moon", /dormir|sono|soneca|descans|dia leve|folga|pregui/i],
  ["trail", /passeio|parque|trilha|caminhada|praia|natureza|bike/i],
  ["travel", /viagem|viajar|bate.?volta|turismo|hotel/i],
];

export function artFor(text: string, fallback: RewardArt = "gift"): RewardArt {
  for (const [art, re] of ART_KEYWORDS) if (re.test(text)) return art;
  return fallback;
}

export const TREASURE_CONFIG = {
  /** Faixa aceita para custo (IA e formulário são normalizados a ela). */
  cost: { coin: { min: 1, max: 500 }, gem: { min: 1, max: 50 } },
  /** Referência de preço por porte (sugestão, nunca bloqueio). */
  priceBands: { pequena: [5, 15], media: [15, 30], grande: [30, 60], premium: [60, 150] },
  /** Fontes de gemas: somente marcos especiais, nunca tarefa comum. */
  gems: { perLevel: 1, campaignCompleted: 2, achievementTier: { gold: 1, platinum: 2 } as Record<string, number> },
  ai: {
    rateLimit: { windowMs: 60 * 60 * 1000, max: 5 },
    timeoutMs: 20_000,
    retries: 1,
    minSuggestions: 4,
    maxSuggestions: 8,
    maxFieldChars: 400,
  },
} as const;
