import { z } from "zod";

export const startFocusSessionSchema = z.object({
  taskId: z.string().trim().min(1).optional().nullable(),
  projectId: z.string().trim().min(1).optional().nullable(),
  mode: z.enum(["pomodoro", "free_timer"]).default("pomodoro"),
  plannedMinutes: z.number().int().positive().max(480).optional(),
});

export const stopFocusSessionSchema = z.object({
  perceivedProductivity: z.number().int().min(1).max(5).optional(),
  distractions: z.number().int().min(0).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});
