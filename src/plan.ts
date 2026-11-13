import { z } from "zod";
import { weekStart } from "./dates.ts";

const ZONE_INTENSITY = [0.55, 0.7, 0.83, 0.95, 1.05, 1.15, 1.2];
export const EASY_ZONES = 2;
export const HARD_ZONE = 4;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Step = z.object({
  minutes: z.number().positive(),
  zone: z.number().int().min(1).max(ZONE_INTENSITY.length),
  by: z.enum(["hr", "pace", "feel"]),
});

const Block = z.union([
  Step,
  z.object({
    repeat: z.number().int().min(2),
    steps: z.array(Step).min(1),
  }),
]);

const Workout = z.object({
  date,
  sport: z.enum(["run", "ride"]),
  name: z.string().min(1),
  steps: z.array(Block).min(1),
});

export const Plan = z.object({
  week: date.refine((d) => weekStart(d) === d, "week must be a Monday"),
  deload: z.boolean(),
  note: z.string(),
  workouts: z.array(Workout),
});

export type Step = z.infer<typeof Step>;
export type Workout = z.infer<typeof Workout>;
export type Plan = z.infer<typeof Plan>;

export function workoutSteps(workout: Workout) {
  return workout.steps.flatMap((b) =>
    "repeat" in b ? Array.from({ length: b.repeat }, () => b.steps).flat() : [b]
  );
}

export function workoutTotals(workout: Workout) {
  const steps = workoutSteps(workout);
  let minutes = 0;
  let easyMinutes = 0;
  let load = 0;
  for (const s of steps) {
    minutes += s.minutes;
    if (s.zone <= EASY_ZONES) easyMinutes += s.minutes;
    load += s.minutes / 60 * ZONE_INTENSITY[s.zone - 1] ** 2 * 100;
  }
  return {
    minutes,
    easyMinutes,
    load,
    hard: steps.some((s) => s.zone >= HARD_ZONE),
  };
}
