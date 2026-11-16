import { z } from "zod";
import { ZONES } from "./plan.ts";

const zone = z.number().int().min(1).max(ZONES);

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
    maxZoneBySport: z.strictObject({
      run: zone.optional(),
      ride: zone.optional(),
    }).optional(),
  }),
  readiness: z.strictObject({
    baselineDays: z.number().int().positive(),
    deviationSd: z.number().positive(),
    shortSleepHours: z.number().positive(),
    deepFatigueFormRatio: z.number().negative(),
    fastWeightLossShare: z.number().positive(),
  }),
  goals: z.strictObject({
    vo2max: z.number().positive().optional(),
    weightKg: z.number().positive().optional(),
  }).optional(),
});

export type PlanRules = z.infer<typeof Config>["plan"];
export type ReadinessRules = z.infer<typeof Config>["readiness"];
export type Goals = NonNullable<z.infer<typeof Config>["goals"]>;

export async function loadConfig(projectDir: string) {
  return Config.parse(
    JSON.parse(await Deno.readTextFile(`${projectDir}/config.json`)),
  );
}
