import { z } from "zod";

export const Config = z.strictObject({
  plan: z.strictObject({
    maxWeeklyHours: z.number().positive(),
    minEasyShare: z.number().min(0).max(1),
    maxLoadRatio: z.number().positive(),
    deloadLoadRatio: z.number().positive(),
    maxHardWorkouts: z.number().int().min(0),
    maxLongRunShare: z.number().min(0).max(1),
    longRunFromMinutes: z.number().positive(),
    loadingWeeksBeforeDeload: z.number().int().positive(),
  }),
  readiness: z.strictObject({
    baselineDays: z.number().int().positive(),
    deviationSd: z.number().positive(),
    shortSleepHours: z.number().positive(),
    deepFatigueFormRatio: z.number().negative(),
  }),
});

export type PlanRules = z.infer<typeof Config>["plan"];
export type ReadinessRules = z.infer<typeof Config>["readiness"];

export async function loadConfig(projectDir: string) {
  return Config.parse(
    JSON.parse(await Deno.readTextFile(`${projectDir}/config.json`)),
  );
}
