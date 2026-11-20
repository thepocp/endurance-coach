import { assertEquals } from "@std/assert";
import { Config } from "../src/config.ts";
import type { Snapshot } from "../src/intervals.ts";
import { buildSummary } from "../src/summary.ts";
import template from "../template/config.json" with { type: "json" };

const snapshot: Snapshot = {
  today: "2026-11-13",
  athlete: {
    timezone: "Europe/Berlin",
    sportSettings: [{
      types: ["Run", "TrailRun"],
      lthr: 165,
      max_hr: 185,
      updated: "2026-09-01T10:00:00.000+00:00",
    }],
  },
  activities: [
    {
      start_date_local: "2026-10-28T09:00:00",
      type: "Run",
      moving_time: 7200,
      distance: 18000,
      icu_training_load: 82,
      icu_hr_zone_times: [3600, 2880, 720],
    },
    {
      start_date_local: "2026-11-10T18:00:00",
      type: "Ride",
      moving_time: 3600,
      distance: 27000,
      icu_training_load: 40,
      icu_hr_zone_times: [3600],
    },
    {
      start_date_local: "2026-11-12T08:00:00",
      type: "Run",
      moving_time: 1800,
      distance: 4500,
      icu_training_load: 20,
      icu_hr_zone_times: [1500, 300],
    },
  ],
  wellness: [
    { id: "2026-10-14", weight: 95.5 },
    { id: "2026-10-26", weight: 94 },
    { id: "2026-10-28", vo2max: 46, weight: 93 },
    { id: "2026-11-05", weight: 92.5 },
    { id: "2026-11-10", vo2max: 47.5, weight: 92 },
    { id: "2026-11-12", ctl: 28, atl: 12, rampRate: -4.2, weight: 91 },
  ],
  events: [
    {
      id: 1,
      category: "RACE_A",
      start_date_local: "2027-04-11T00:00:00",
      type: "Run",
      name: "Marathon",
      distance: 42195,
    },
    {
      id: 2,
      category: "RACE_B",
      start_date_local: "2026-10-01T00:00:00",
      type: "Ride",
    },
    {
      id: 3,
      category: "SICK",
      start_date_local: "2026-11-01T00:00:00",
      end_date_local: "2026-11-14T00:00:00",
    },
    {
      id: 4,
      category: "WORKOUT",
      start_date_local: "2026-11-14T00:00:00",
      type: "Ride",
      moving_time: 5400,
    },
    {
      id: 5,
      category: "WORKOUT",
      start_date_local: "2026-12-20T00:00:00",
      type: "Run",
    },
  ],
};
const rules = Config.parse(template).readiness;
const summary = buildSummary(snapshot, rules);
const withGoals = buildSummary(snapshot, rules, { vo2max: 60, weightKg: 85 });

Deno.test("activities are grouped into Monday-based weeks per sport, empty weeks included", () => {
  assertEquals(summary.weeks.map((w) => w.week), [
    "2026-10-26",
    "2026-11-02",
    "2026-11-09",
  ]);
  const week = summary.weeks[2];
  assertEquals(week.run, {
    sessions: 1,
    minutes: 30,
    km: 4.5,
    load: 20,
    longestMinutes: 30,
    hrZoneMinutes: [25, 5],
  });
  assertEquals(week.ride.minutes, 60);
  assertEquals(week.hrZoneMinutes, [85, 5]);
});

Deno.test("history before the last six weeks is folded into finished calendar months", () => {
  const long = buildSummary({
    ...snapshot,
    activities: [
      { start_date_local: "2026-08-20T09:00:00", type: "Ride" },
      ...snapshot.activities,
    ],
  }, rules);
  assertEquals(long.weeks.map((w) => w.week)[0], "2026-10-05");
  assertEquals(long.weeks.length, 6);
  assertEquals(long.months.map((m) => m.month), [
    "2026-08",
    "2026-09",
    "2026-10",
  ]);
  assertEquals(long.months[2], {
    month: "2026-10",
    run: { sessions: 1, minutes: 120, km: 18, load: 82, longestMinutes: 120 },
    ride: { sessions: 0, minutes: 0, km: 0, load: 0, longestMinutes: 0 },
    other: { sessions: 0, minutes: 0, km: 0, load: 0, longestMinutes: 0 },
    easyShare: 0.9,
    ctl: undefined,
    vo2max: 46,
    weightKg: 94.2,
  });
});

Deno.test("easy share is the Z1-Z2 fraction of heart rate zone time", () => {
  assertEquals(summary.weeks[0].easyShare, 0.9);
});

Deno.test("calendar keeps future races, current time off and near-term workouts", () => {
  assertEquals(summary.races, [
    {
      id: 1,
      date: "2027-04-11",
      priority: "A",
      sport: "run",
      name: "Marathon",
      km: 42.2,
    },
  ]);
  assertEquals(summary.off, [
    { id: 3, category: "SICK", start: "2026-11-01", end: "2026-11-14" },
  ]);
  assertEquals(summary.planned.map((p) => p.date), ["2026-11-14"]);
});

Deno.test("fitness comes from the latest wellness row that has it", () => {
  assertEquals(summary.fitness, {
    date: "2026-11-12",
    ctl: 28,
    atl: 12,
    rampRate: -4.2,
  });
});

Deno.test("VO2max is the last reading with its change, the distance to the goal and its value at the goal weight", () => {
  assertEquals(withGoals.vo2max, {
    date: "2026-11-10",
    value: 47.5,
    since: "2026-10-28",
    change: 1.5,
    goal: 60,
    toGoal: 12.5,
    atGoalWeight: 51.1,
  });
});

Deno.test("weight is a seven-day average with its four-week rate, a fast loss flag and the distance to the goal", () => {
  assertEquals(withGoals.weight, {
    date: "2026-11-12",
    kg: 91,
    weekAverageKg: 91.5,
    since: "2026-10-14",
    change: -4,
    perWeekKg: -1,
    fastLoss: true,
    goal: 85,
    toGoal: -6.5,
  });
});

Deno.test("thresholds carry the age of the sport settings", () => {
  assertEquals(summary.thresholds[0].settingsUpdatedDaysAgo, 73);
});
