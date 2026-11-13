import type { PlanRules } from "./config.ts";
import { addDays } from "./dates.ts";
import type { Activity } from "./intervals.ts";
import {
  EASY_ZONES,
  HARD_ZONE,
  type Plan,
  workoutSteps,
  workoutTotals,
} from "./plan.ts";
import { sportOf } from "./summary.ts";

const MIN_RUNS_FOR_LONG_RUN_SHARE = 3;
const HARD_ACTIVITY_MIN_SECS = 300;
// Lets an athlete with little or no recent history start from something.
const FLOOR_WEEK_LOAD = 100;
const FLOOR_RUN_MINUTES = 60;
// Weekly equivalent of the 42-day time constant behind CTL.
const CHRONIC_WEEKLY_ALPHA = 1 - Math.exp(-7 / 42);

export type WeekTotals = {
  minutes: number;
  easyMinutes: number;
  load: number;
  runMinutes: number;
  longestRunMinutes: number;
  runs: number;
  hardWorkouts: number;
};

export type PlanContext = {
  rules: PlanRules;
  today: string;
  // What the athlete already did in the plan week, today included.
  done: WeekTotals;
  sportsDoneToday: string[];
  ctl: number;
  runMinutesByWeek: number[];
  runPaceZonesSet: boolean;
  previousWeeksDeload: boolean[];
  timeOff: { category: string; start: string; end: string }[];
};

export function planLimits(ctx: PlanContext, deload: boolean) {
  const runChronic = ctx.runMinutesByWeek.reduce(
    (chronic, week) => chronic + (week - chronic) * CHRONIC_WEEKLY_ALPHA,
    ctx.runMinutesByWeek[0] || 0,
  );
  const ratio = deload ? ctx.rules.deloadLoadRatio : ctx.rules.maxLoadRatio;
  return {
    maxLoad: Math.round(Math.max(ctx.ctl * 7 * ratio, FLOOR_WEEK_LOAD)),
    maxRunMinutes: Math.round(Math.max(runChronic * ratio, FLOOR_RUN_MINUTES)),
    maxMinutes: ctx.rules.maxWeeklyHours * 60,
  };
}

export function completedTotals(activities: Activity[]): WeekTotals {
  const totals: WeekTotals = {
    minutes: 0,
    easyMinutes: 0,
    load: 0,
    runMinutes: 0,
    longestRunMinutes: 0,
    runs: 0,
    hardWorkouts: 0,
  };
  for (const a of activities) {
    const minutes = (a.moving_time || 0) / 60;
    const zoneSecs = a.icu_hr_zone_times || [];
    const secsIn = (zones: number[]) => zones.reduce((x, y) => x + y, 0);
    totals.minutes += minutes;
    totals.easyMinutes += Math.min(
      minutes,
      secsIn(zoneSecs.slice(0, EASY_ZONES)) / 60,
    );
    totals.load += a.icu_training_load || 0;
    if (secsIn(zoneSecs.slice(HARD_ZONE - 1)) >= HARD_ACTIVITY_MIN_SECS) {
      totals.hardWorkouts += 1;
    }
    if (sportOf(a.type) === "run") {
      totals.runs += 1;
      totals.runMinutes += minutes;
      totals.longestRunMinutes = Math.max(totals.longestRunMinutes, minutes);
    }
  }
  return totals;
}

// Past days count as done and later days as planned. Today's workout counts
// as planned until an activity in that sport shows up.
function isAhead(w: Plan["workouts"][number], ctx: PlanContext): boolean {
  return w.date > ctx.today ||
    (w.date === ctx.today && !ctx.sportsDoneToday.includes(w.sport));
}

export function planTotals(plan: Plan, ctx: PlanContext): WeekTotals {
  const { done } = ctx;
  const ahead = plan.workouts.filter((w) => isAhead(w, ctx));
  const totals = ahead.map(workoutTotals);
  const sum = (pick: (t: typeof totals[number]) => number) =>
    totals.reduce((a, t) => a + pick(t), 0);
  const runs = totals.filter((_, i) => ahead[i].sport === "run");
  return {
    minutes: Math.round(done.minutes + sum((t) => t.minutes)),
    easyMinutes: Math.round(done.easyMinutes + sum((t) => t.easyMinutes)),
    load: Math.round(done.load + sum((t) => t.load)),
    runMinutes: Math.round(
      done.runMinutes + runs.reduce((a, t) => a + t.minutes, 0),
    ),
    longestRunMinutes: Math.round(
      Math.max(done.longestRunMinutes, ...runs.map((t) => t.minutes)),
    ),
    runs: done.runs + runs.length,
    hardWorkouts: done.hardWorkouts + totals.filter((t) => t.hard).length,
  };
}

export function validatePlan(plan: Plan, ctx: PlanContext): string[] {
  const { rules } = ctx;
  const violations: string[] = [];
  const totals = planTotals(plan, ctx);
  const limits = planLimits(ctx, plan.deload);

  for (const w of plan.workouts) {
    if (w.date < plan.week || w.date > addDays(plan.week, 6)) {
      violations.push(`${w.date} "${w.name}" is outside the plan week`);
    }
    const off = ctx.timeOff.find((o) => w.date >= o.start && w.date <= o.end);
    if (off) {
      violations.push(
        `${w.date} "${w.name}" falls on ${off.category} time off in the calendar`,
      );
    }
    const paced = workoutSteps(w).some((s) => s.by === "pace");
    if (paced && w.sport !== "run") {
      violations.push(`${w.date} "${w.name}": pace targets are for runs only`);
    } else if (paced && !ctx.runPaceZonesSet) {
      violations.push(
        `${w.date} "${w.name}": pace targets need a run threshold pace set in intervals.icu`,
      );
    }
  }
  if (totals.minutes > limits.maxMinutes) {
    violations.push(
      `total ${totals.minutes} min exceeds the athlete's cap of ${limits.maxMinutes} min`,
    );
  }
  if (totals.load > limits.maxLoad) {
    violations.push(
      `estimated load ${totals.load} exceeds ${limits.maxLoad} allowed at CTL ${
        Math.round(ctx.ctl)
      }`,
    );
  }
  if (totals.runMinutes > limits.maxRunMinutes) {
    violations.push(
      `run volume ${totals.runMinutes} min exceeds ${limits.maxRunMinutes} min allowed by recent run history`,
    );
  }
  if (
    totals.minutes && totals.easyMinutes / totals.minutes < rules.minEasyShare
  ) {
    violations.push(
      `only ${
        Math.round(totals.easyMinutes / totals.minutes * 100)
      }% of time is in Z1-Z2, need at least ${rules.minEasyShare * 100}%`,
    );
  }
  if (totals.hardWorkouts > rules.maxHardWorkouts) {
    violations.push(
      `${totals.hardWorkouts} hard workouts, at most ${rules.maxHardWorkouts} per week`,
    );
  }
  const hard = plan.workouts.filter((w) =>
    isAhead(w, ctx) && workoutTotals(w).hard
  );
  for (const a of hard) {
    if (
      hard.some((b) => b.sport === a.sport && b.date === addDays(a.date, 1))
    ) {
      violations.push(
        `hard ${a.sport} workouts on consecutive days from ${a.date}`,
      );
    }
  }
  if (
    totals.runs >= MIN_RUNS_FOR_LONG_RUN_SHARE &&
    totals.longestRunMinutes >= rules.longRunFromMinutes &&
    totals.longestRunMinutes / totals.runMinutes > rules.maxLongRunShare
  ) {
    violations.push(
      `longest run is ${
        Math.round(totals.longestRunMinutes / totals.runMinutes * 100)
      }% of weekly run time, at most ${rules.maxLongRunShare * 100}%`,
    );
  }
  if (
    !plan.deload &&
    ctx.previousWeeksDeload.length >= rules.loadingWeeksBeforeDeload &&
    ctx.previousWeeksDeload.slice(-rules.loadingWeeksBeforeDeload)
      .every((d) => !d)
  ) {
    violations.push(
      `${rules.loadingWeeksBeforeDeload} loading weeks in a row, this week must be a deload`,
    );
  }
  return violations;
}
