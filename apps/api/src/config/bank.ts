/**
 * Banco: planos de investimento para as moedas (coin_ledger) ganhas em
 * missões, contratos e projetos. É pura gamificação — moeda do jogo, nunca
 * dinheiro real (o LifeOS não tem módulo financeiro de verdade de propósito).
 * Prazo fixo, sem risco, sem sorte: o jogador deposita, espera o prazo e
 * recebe o principal + bônus. Taxa e prazo ficam só aqui; o depósito
 * congela os valores vigentes no momento em que foi feito (bankService.ts),
 * então mudar um plano aqui nunca afeta quem já investiu.
 */
export interface BankPlan {
  id: string;
  label: string;
  flavor: string;
  /** Bônus em pontos-base (100 bps = 1%) pago sobre o principal ao final do prazo. */
  rateBps: number;
  termDays: number;
  minAmount: number;
  maxAmount: number;
  /** Quantos depósitos ativos deste plano o jogador pode ter ao mesmo tempo. */
  maxActive: number;
}

export const BANK_PLANS: BankPlan[] = [
  {
    id: "cofre-aventureiro",
    label: "Cofre do Aventureiro",
    flavor: "Guarda moedas num baú trancado por alguns dias — risco zero, retorno modesto.",
    rateBps: 500, // +5%
    termDays: 3,
    minAmount: 10,
    maxAmount: 2000,
    maxActive: 5,
  },
  {
    id: "rota-mercador",
    label: "Rota do Mercador",
    flavor: "Financia uma caravana de comércio. Prazo médio, retorno melhor.",
    rateBps: 1200, // +12%
    termDays: 7,
    minAmount: 50,
    maxAmount: 5000,
    maxActive: 3,
  },
  {
    id: "fundo-dragao",
    label: "Fundo do Dragão",
    flavor: "Empresta moedas para expedições de alto risco e alta recompensa. Prazo longo.",
    rateBps: 3000, // +30%
    termDays: 21,
    minAmount: 200,
    maxAmount: 20000,
    maxActive: 2,
  },
];

export function getBankPlan(planId: string): BankPlan | undefined {
  return BANK_PLANS.find((p) => p.id === planId);
}

/** Principal + bônus, arredondado para baixo (nunca gera moeda fracionada). */
export function computePayout(amount: number, rateBps: number): number {
  return amount + Math.floor((amount * rateBps) / 10_000);
}
