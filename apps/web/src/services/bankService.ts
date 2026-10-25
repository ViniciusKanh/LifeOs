import { api } from "./api";

export interface BankPlan {
  id: string;
  label: string;
  flavor: string;
  rateBps: number;
  termDays: number;
  minAmount: number;
  maxAmount: number;
  maxActive: number;
  taxBps: number;
  /** false só no Cofre Livre: resgate a qualquer momento paga bônus proporcional ao tempo, nunca zero. true (prazo fixo) perde o bônus inteiro ao sair antes do prazo. */
  earlyWithdrawalPenalty: boolean;
}

export interface BankDeposit {
  id: string;
  planId: string;
  planLabel: string;
  amount: number;
  rateBps: number;
  termDays: number;
  taxBps: number;
  payout: number;
  netPayout: number;
  status: "active" | "claimed";
  createdAt: string;
  maturesAt: string;
  claimedAt: string | null;
  /** true quando o resgate quebrou o prazo fixo antes do vencimento (sem bônus nos planos de prazo fixo; proporcional no Cofre Livre). */
  earlyWithdrawn: boolean;
  /** O que foi de fato recebido no resgate — difere de netPayout quando foi antecipado. null enquanto ainda ativo. */
  actualPayout: number | null;
  /** Imposto de fato cobrado no resgate — difere de payout-netPayout quando foi antecipado/proporcional. null enquanto ainda ativo. */
  actualTax: number | null;
}

export interface BankLoan {
  id: string;
  amount: number;
  rateBps: number;
  termDays: number;
  totalDue: number;
  lateFeeBps: number;
  status: "active" | "repaid";
  createdAt: string;
  dueAt: string;
  repaidAt: string | null;
  repaidAmount: number | null;
  overdue: boolean;
}

export interface LoanTier {
  minScore: number;
  label: string;
  maxAmount: number;
  rateBps: number;
}

export interface CreditInfo {
  score: number;
  scoreMin: number;
  scoreMax: number;
  tier: { label: string; maxAmount: number; rateBps: number };
  termDays: number;
  lateFeeBps: number;
  /** Tabela completa de níveis de crédito -- alimenta o Simulador de empréstimo. */
  tiers: LoanTier[];
}

export interface AutoInvestRule {
  enabled: boolean;
  pctBps: number;
  planId: string;
}

export interface BankSummary {
  balance: number;
  plans: BankPlan[];
  active: BankDeposit[];
  claimable: BankDeposit[];
  history: BankDeposit[];
  totals: { invested: number; earned: number; taxPaid: number; activeCount: number };
  credit: CreditInfo;
  loan: { active: BankLoan | null; history: BankLoan[] };
  autoInvest: AutoInvestRule;
}

export interface BankHistoryPoint {
  date: string;
  score: number | null;
  balance: number | null;
}

export interface BankStatementMonth {
  month: string;
  earned: number;
  taxPaid: number;
  interestPaid: number;
  lateFeePaid: number;
}

export interface LedgerEntry {
  id: string;
  amount: number;
  sourceType: string;
  eventType: string;
  label: string | null;
  createdAt: string;
}

export interface DepositSuccess {
  deposit: BankDeposit;
  balance: number;
}

export interface ClaimSuccess {
  deposit: BankDeposit;
  payout: number;
  balance: number;
}

export interface LoanSuccess {
  loan: BankLoan;
  balance: number;
}

export interface RepaySuccess {
  loan: BankLoan;
  paid: number;
  balance: number;
}

export const bankService = {
  summary: () => api.get<BankSummary>("/bank"),
  deposit: (planId: string, amount: number) => api.post<DepositSuccess>("/bank/deposits", { planId, amount }),
  claim: (depositId: string) => api.post<ClaimSuccess>(`/bank/deposits/${depositId}/claim`),
  claimEarly: (depositId: string) => api.post<ClaimSuccess>(`/bank/deposits/${depositId}/claim-early`),
  ledger: (limit = 40) => api.get<{ entries: LedgerEntry[] }>(`/bank/ledger?limit=${limit}`),
  requestLoan: (amount: number) => api.post<LoanSuccess>("/bank/loans", { amount }),
  repayLoan: (loanId: string) => api.post<RepaySuccess>(`/bank/loans/${loanId}/repay`),
  history: (days = 60) => api.get<{ days: number; points: BankHistoryPoint[] }>(`/bank/history?days=${days}`),
  statement: (months = 12) => api.get<{ months: BankStatementMonth[] }>(`/bank/statement?months=${months}`),
  updateAutoInvest: (input: AutoInvestRule) => api.put<{ ok: true; autoInvest: AutoInvestRule }>("/bank/auto-invest", input),
};
