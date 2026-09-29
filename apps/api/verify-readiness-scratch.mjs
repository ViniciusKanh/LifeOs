import { computeReadiness } from "./src/services/dataReadinessService.ts";
console.log(JSON.stringify(computeReadiness({
  activeGoalsCount: 0, goalsWithEnoughProgressCount: 0,
  activeTasksCount: 5, tasksWithEstimateCount: 1,
  tasksWithDueDateCount: 2, goalsWithDueDateCount: 0,
  invalidTimestampCount: 0, signalCategoriesWithRecentData: 4,
  totalScore: 82
}), null, 2));
