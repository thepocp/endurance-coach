import { addDays, addMonths, daysBetween, weekStart } from "./dates.ts";
import type { Goals, ReadinessRules } from "./config.ts";
import type { Activity, Snapshot, Wellness } from "./intervals.ts";
import { EASY_ZONES, HARD_ZONE } from "./plan.ts";
import { assessReadiness } from "./readiness.ts";

const RECENT_DAYS = 14;
// Older history is folded into calendar months to keep the summary short.
const DETAILED_WEEKS = 6;
const PLANNED_DAYS = 14;
// Body weight swings by a kilogram from day to day, so it is read as an average.
const WEIGHT_AVERAGE_DAYS = 7;
const WEIGHT_TREND_DAYS = 28;
const OFF_CATEGORIES = ["HOLIDAY", "SICK", "INJURED"];
const HARD_ACTIVITY_MIN_SECS = 300;

type Sport = "run" | "ride" | "other";

export function sportOf(type: string | null | undefined): Sport {
  if (type?.includes("Run")) return "run";
  if (type?.includes("Ride")) return "ride";
  return "other";
}

const day = (dateTime: string) => dateTime.slice(0, 10);
const minutes = (secs: number | null | undefined) =>
  Math.round((secs || 0) / 60);
const km = (meters: number | null | undefined) =>
  Math.round((meters || 0) / 100) / 10;
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const mean = (values: number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const meanOf = (values: (number | null | undefined)[]) => {
  const present = values.filter((v) => typeof v === "number");
  return present.length ? mean(present) : undefined;
};
const roundTo = (value: number | null | undefined, digits: number) =>
  typeof value === "number"
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : undefined;

export function isHardActivity(a: Activity): boolean {
  const hardSecs = (a.icu_hr_zone_times || []).slice(HARD_ZONE - 1)
    .reduce((x, y) => x + y, 0);
  return hardSecs >= HARD_ACTIVITY_MIN_SECS;
}

// Runs use grade-adjusted meters per heartbeat, because few runners have
// power. Rides use the intervals.icu power-based efficiency factor, because
// speed on a bike depends on terrain and wind more than on fitness.
function efficiencyOf(a: Activity): number | undefined {
  const sport = sportOf(a.type);
  if (sport === "run" && a.gap && a.average_heartrate) {
    return a.gap * 60 / a.average_heartrate;
  }
  if (sport === "ride" && a.icu_efficiency_factor) {
    return a.icu_efficiency_factor;
  }
}

function emptyTotals() {
  return { sessions: 0, minutes: 0, km: 0, load: 0, longestMinutes: 0 };
}

function totalsOf(activities: Activity[]) {
  const sports = {
    run: emptyTotals(),
    ride: emptyTotals(),
    other: emptyTotals(),
  };
  const hrZoneSecs: number[] = [];
  const sportZoneSecs: Record<Sport, number[]> = {
    run: [],
    ride: [],
    other: [],
  };
  const easySessions: Record<Sport, Activity[]> = {
    run: [],
    ride: [],
    other: [],
  };
  for (const a of activities) {
    const sport = sportOf(a.type);
    const t = sports[sport];
    if (!isHardActivity(a)) easySessions[sport].push(a);
    t.sessions += 1;
    t.minutes += minutes(a.moving_time);
    t.km = Math.round((t.km + km(a.distance)) * 10) / 10;
    t.load += a.icu_training_load || 0;
    t.longestMinutes = Math.max(t.longestMinutes, minutes(a.moving_time));
    (a.icu_hr_zone_times || []).forEach((secs, zone) => {
      hrZoneSecs[zone] = (hrZoneSecs[zone] || 0) + secs;
      sportZoneSecs[sport][zone] = (sportZoneSecs[sport][zone] || 0) + secs;
    });
  }
  const zoneTotal = hrZoneSecs.reduce((a, b) => a + b, 0);
  const easySecs = hrZoneSecs.slice(0, EASY_ZONES).reduce((a, b) => a + b, 0);
  const withZones = (sport: Sport) => ({
    ...sports[sport],
    easyEfficiency: roundTo(meanOf(easySessions[sport].map(efficiencyOf)), 2),
    easyDecoupling: roundTo(
      meanOf(easySessions[sport].map((a) => a.decoupling)),
      1,
    ),
    hrZoneMinutes: sportZoneSecs[sport].map(minutes),
  });
  return {
    run: withZones("run"),
    ride: withZones("ride"),
    other: withZones("other"),
    hrZoneMinutes: hrZoneSecs.map(minutes),
    easyShare: zoneTotal ? Math.round(easySecs / zoneTotal * 100) / 100 : null,
  };
}

function groupBy(activities: Activity[], key: (date: string) => string) {
  const groups = new Map<string, Activity[]>();
  for (const a of activities) {
    const k = key(day(a.start_date_local));
    groups.set(k, [...(groups.get(k) || []), a]);
  }
  return groups;
}

// Every week from the first activity to the current one, empty weeks included.
export function weeklyTotals(activities: Activity[], today: string) {
  const byWeek = groupBy(activities, weekStart);
  const firstWeek = [...byWeek.keys()].sort()[0] || weekStart(today);
  const weeks = [];
  for (let w = firstWeek; w <= weekStart(today); w = addDays(w, 7)) {
    weeks.push({ week: w, ...totalsOf(byWeek.get(w) || []) });
  }
  return weeks;
}

// Every finished month from the first activity on, empty months included.
function monthlyTotals(
  activities: Activity[],
  wellness: Wellness[],
  today: string,
) {
  const month = (date: string) => date.slice(0, 7);
  const byMonth = groupBy(activities, month);
  const thisMonth = month(today);
  const firstMonth = [...byMonth.keys()].sort()[0] || thisMonth;
  const months = [];
  for (let m = firstMonth; m < thisMonth; m = addMonths(m, 1)) {
    const { run, ride, other, easyShare } = totalsOf(byMonth.get(m) || []);
    const rows = wellness.filter((w) => month(w.id) === m);
    const weights = rows.flatMap((w) =>
      typeof w.weight === "number" ? [w.weight] : []
    );
    months.push({
      month: m,
      run: withoutZones(run),
      ride: withoutZones(ride),
      other: withoutZones(other),
      easyShare,
      ctl: rows.findLast((w) => typeof w.ctl === "number")?.ctl,
      vo2max: rows.findLast((w) => typeof w.vo2max === "number")?.vo2max,
      weightKg: weights.length ? round1(mean(weights)) : undefined,
    });
  }
  return months;
}

function withoutZones(
  { hrZoneMinutes: _, ...totals }: ReturnType<typeof totalsOf>["run"],
) {
  return totals;
}

export function buildSummary(
  { today, athlete, activities, wellness, events }: Snapshot,
  rules: ReadinessRules,
  goals: Goals = {},
) {
  const latest = wellness.findLast((w) => typeof w.ctl === "number");
  const vo2max = wellness.flatMap((w) =>
    typeof w.vo2max === "number" ? [{ date: w.id, value: w.vo2max }] : []
  );
  const latestVo2max = vo2max.at(-1);
  const weights = wellness.flatMap((w) =>
    typeof w.weight === "number" ? [{ date: w.id, kg: w.weight }] : []
  );
  const latestWeight = weights.at(-1);
  const weightUpTo = (end: string) => {
    const kg = weights
      .filter((w) =>
        w.date > addDays(end, -WEIGHT_AVERAGE_DAYS) && w.date <= end
      )
      .map((w) => w.kg);
    return kg.length ? mean(kg) : undefined;
  };
  const weightNow = latestWeight && weightUpTo(latestWeight.date);
  const weightBefore = latestWeight &&
    weightUpTo(addDays(latestWeight.date, -WEIGHT_TREND_DAYS));
  const weightFirst = weights.length &&
    weightUpTo(addDays(weights[0].date, WEIGHT_AVERAGE_DAYS - 1));
  const weightPerWeek = weightNow && weightBefore
    ? (weightNow - weightBefore) / (WEIGHT_TREND_DAYS / 7)
    : undefined;

  return {
    today,
    readiness: assessReadiness(wellness, today, rules),
    fitness: latest && {
      date: latest.id,
      ctl: latest.ctl,
      atl: latest.atl,
      rampRate: latest.rampRate,
    },
    vo2max: latestVo2max && {
      ...latestVo2max,
      since: vo2max[0].date,
      change: round1(latestVo2max.value - vo2max[0].value),
      goal: goals.vo2max,
      toGoal: goals.vo2max && round1(goals.vo2max - latestVo2max.value),
      atGoalWeight: weightNow && goals.weightKg &&
        round1(latestVo2max.value * weightNow / goals.weightKg),
    },
    weight: latestWeight && weightNow && weightFirst && {
      date: latestWeight.date,
      kg: latestWeight.kg,
      weekAverageKg: round1(weightNow),
      since: weights[0].date,
      change: round1(weightNow - weightFirst),
      perWeekKg: weightPerWeek === undefined
        ? undefined
        : round2(weightPerWeek),
      fastLoss: weightPerWeek === undefined
        ? undefined
        : -weightPerWeek > weightNow * rules.fastWeightLossShare,
      goal: goals.weightKg,
      toGoal: goals.weightKg && round1(goals.weightKg - weightNow),
    },
    thresholds: athlete.sportSettings
      .filter((s) => s.types.some((t) => sportOf(t) !== "other"))
      .map((s) => ({
        sport: sportOf(s.types.find((t) => sportOf(t) !== "other")),
        lthr: s.lthr,
        maxHr: s.max_hr,
        hrZones: s.hr_zones,
        thresholdPace: s.threshold_pace,
        paceUnits: s.pace_units,
        settingsUpdatedDaysAgo: s.updated &&
          daysBetween(day(s.updated), today),
      })),
    weeks: weeklyTotals(activities, today).slice(-DETAILED_WEEKS),
    months: monthlyTotals(activities, wellness, today),
    recent: activities
      .filter((a) => day(a.start_date_local) > addDays(today, -RECENT_DAYS))
      .map((a) => ({
        date: day(a.start_date_local),
        sport: sportOf(a.type),
        minutes: minutes(a.moving_time),
        km: km(a.distance),
        load: a.icu_training_load,
        avgHr: a.average_heartrate,
        rpe: a.icu_rpe,
        feel: a.feel,
        efficiency: roundTo(efficiencyOf(a), 2),
        decoupling: roundTo(a.decoupling, 1),
      })),
    races: events
      .filter((e) =>
        e.category.startsWith("RACE_") && day(e.start_date_local) >= today
      )
      .map((e) => ({
        id: e.id,
        date: day(e.start_date_local),
        priority: e.category.slice("RACE_".length),
        sport: sportOf(e.type),
        name: e.name,
        km: km(e.distance),
      })),
    // The stored end of a multi-day event is kept as is. If it is the day
    // after the last one, time off reads one day longer, which errs on the
    // side of rest.
    off: events
      .filter((e) =>
        OFF_CATEGORIES.includes(e.category) &&
        day(e.end_date_local || e.start_date_local) >= today
      )
      .map((e) => ({
        id: e.id,
        category: e.category,
        start: day(e.start_date_local),
        end: day(e.end_date_local || e.start_date_local),
      })),
    planned: events
      .filter((e) =>
        e.category === "WORKOUT" && day(e.start_date_local) >= today &&
        day(e.start_date_local) <= addDays(today, PLANNED_DAYS)
      )
      .map((e) => ({
        date: day(e.start_date_local),
        sport: sportOf(e.type),
        name: e.name,
        minutes: minutes(e.moving_time),
        load: e.icu_training_load,
      })),
  };
}
