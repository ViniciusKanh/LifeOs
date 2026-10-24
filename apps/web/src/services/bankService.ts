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

export interface CreditInfo {
  score: number;
  scoreMin: number;
  scoreMax: number;
  tier: { label: string; maxAmount: number; rateBps: number };
  termDays: number;
  lateFeeBps: number;
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
  ledger: (limit = 40) => api.get<{ entries: LedgerEntry[] }>(`/bank/ledger?limit=${limit}`),
  requestLoan: (amount: number) => api.post<LoanSuccess>("/bank/loans", { amount }),
  repayLoan: (loanId: string) => api.post<RepaySuccess>(`/bank/loans/${loanId}/repay`),
};
