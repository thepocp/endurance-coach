import { addDays } from "./dates.ts";
import type { ReadinessRules } from "./config.ts";
import type { Wellness } from "./intervals.ts";

const MIN_BASELINE_VALUES = 14;

export type Readiness = {
  status: "green" | "yellow" | "red" | "unknown";
  flags: string[];
  missing: string[];
};

function meanAndSd(values: number[]) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) /
    values.length;
  return { mean, sd: Math.sqrt(variance) };
}

function numbers(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number => typeof v === "number");
}

export function assessReadiness(
  wellness: Wellness[],
  today: string,
  rules: ReadinessRules,
): Readiness {
  const row = wellness.find((w) => w.id === today);
  const baseline = wellness.filter((w) =>
    w.id < today && w.id >= addDays(today, -rules.baselineDays)
  );
  const hrvHistory = numbers(baseline.map((w) => w.hrv));
  const rhrHistory = numbers(baseline.map((w) => w.restingHR));
  const flags: string[] = [];
  const missing: string[] = [];

  const hrv = row?.hrv;
  if (typeof hrv !== "number") missing.push("hrv_today");
  else if (hrvHistory.length < MIN_BASELINE_VALUES) {
    missing.push("hrv_baseline");
  } else {
    const { mean, sd } = meanAndSd(hrvHistory);
    if (hrv < mean - sd * rules.deviationSd) flags.push("hrv_low");
    const previousWeek = numbers(
      wellness.filter((w) => w.id >= addDays(today, -7) && w.id < today)
        .map((w) => w.hrv),
    );
    if (meanAndSd(previousWeek).mean < mean - sd * rules.deviationSd / 2) {
      flags.push("hrv_week_low");
    }
  }

  const rhr = row?.restingHR;
  if (typeof rhr !== "number") missing.push("resting_hr_today");
  else if (rhrHistory.length < MIN_BASELINE_VALUES) {
    missing.push("resting_hr_baseline");
  } else {
    const { mean, sd } = meanAndSd(rhrHistory);
    if (rhr > mean + sd * rules.deviationSd) flags.push("resting_hr_high");
  }

  const sleep = row?.sleepSecs;
  if (typeof sleep !== "number") missing.push("sleep_today");
  else if (sleep < rules.shortSleepHours * 3600) flags.push("sleep_short");

  const ctl = row?.ctl;
  const atl = row?.atl;
  if (typeof ctl !== "number" || typeof atl !== "number") missing.push("form");
  else if (ctl > 0 && (ctl - atl) / ctl < rules.deepFatigueFormRatio) {
    flags.push("form_deep_fatigue");
  }

  const noOvernightData = missing.includes("hrv_today") &&
    missing.includes("resting_hr_today");
  const status = noOvernightData
    ? "unknown"
    : flags.length >= 2
    ? "red"
    : flags.length === 1
    ? "yellow"
    : "green";
  return { status, flags, missing };
}
