import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dailyReviewSchema = z.object({
  reviewDate: z.string().regex(DATE_RE, "Data deve estar no formato YYYY-MM-DD"),
  completionPct: z.number().int().min(0).max(100).optional(),
  highlights: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const weeklyReviewSchema = z.object({
  weekStartDate: z.string().regex(DATE_RE, "Data deve estar no formato YYYY-MM-DD"),
  whatWorked: z.string().trim().max(2000).optional(),
  whatDidntWork: z.string().trim().max(2000).optional(),
  whatToImprove: z.string().trim().max(2000).optional(),
  nextPriorities: z.string().trim().max(2000).optional(),
});
