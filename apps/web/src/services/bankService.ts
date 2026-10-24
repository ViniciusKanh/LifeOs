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
}

export interface BankDeposit {
  id: string;
  planId: string;
  planLabel: string;
  amount: number;
  rateBps: number;
  termDays: number;
  payout: number;
  status: "active" | "claimed";
  createdAt: string;
  maturesAt: string;
  claimedAt: string | null;
}

export interface BankSummary {
  balance: number;
  plans: BankPlan[];
  active: BankDeposit[];
  claimable: BankDeposit[];
  history: BankDeposit[];
  totals: { invested: number; earned: number; activeCount: number };
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

export const bankService = {
  summary: () => api.get<BankSummary>("/bank"),
  deposit: (planId: string, amount: number) => api.post<DepositSuccess>("/bank/deposits", { planId, amount }),
  claim: (depositId: string) => api.post<ClaimSuccess>(`/bank/deposits/${depositId}/claim`),
};
