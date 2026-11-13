import { assertEquals } from "@std/assert";
import { Config } from "../src/config.ts";
import { buildSummary } from "../src/summary.ts";
import template from "../template/config.json" with { type: "json" };

const summary = buildSummary({
  today: "2026-11-13",
  athlete: {
    timezone: "Europe/Berlin",
    sportSettings: [{ types: ["Run", "TrailRun"], lthr: 165, max_hr: 185 }],
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
  wellness: [{ id: "2026-11-12", ctl: 28, atl: 12, rampRate: -4.2 }],
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
}, Config.parse(template).readiness);

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
  });
  assertEquals(week.ride.minutes, 60);
  assertEquals(week.hrZoneMinutes, [85, 5]);
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
