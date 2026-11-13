import { assertEquals } from "@std/assert";
import { planVsActual } from "../src/compliance.ts";
import type { Activity } from "../src/intervals.ts";
import type { Plan, Workout } from "../src/plan.ts";

const easy = (
  date: string,
  sport: Workout["sport"],
  minutes: number,
): Workout => ({
  date,
  sport,
  name: `Easy ${sport}`,
  steps: [{ minutes, zone: 2, by: "hr" }],
});

const plan: Plan = {
  week: "2026-11-16",
  deload: false,
  note: "",
  workouts: [
    easy("2026-11-17", "run", 40),
    easy("2026-11-18", "ride", 60),
    easy("2026-11-19", "run", 30),
    easy("2026-11-21", "ride", 120),
  ],
};

const activity = (
  date: string,
  type: string,
  secs: number,
  load: number,
): Activity => ({
  start_date_local: `${date}T08:00:00`,
  type,
  moving_time: secs,
  icu_training_load: load,
});

const result = planVsActual(plan, [
  activity("2026-11-15", "Run", 3000, 45),
  activity("2026-11-17", "Run", 2700, 38),
  activity("2026-11-18", "Run", 1200, 15),
  activity("2026-11-18", "Walk", 3600, 10),
], "2026-11-19");

Deno.test("a planned workout is paired with the activity of that day and sport", () => {
  assertEquals(result.workouts[0], {
    date: "2026-11-17",
    sport: "run",
    name: "Easy run",
    status: "done",
    plannedMinutes: 40,
    plannedLoad: 33,
    actualMinutes: 45,
    actualLoad: 38,
  });
});

Deno.test("a past workout without an activity is missed, today's is pending, later ones are left out", () => {
  assertEquals(
    result.workouts.map((w) => [w.date, w.status]),
    [["2026-11-17", "done"], ["2026-11-18", "missed"], [
      "2026-11-19",
      "pending",
    ]],
  );
});

Deno.test("activities without a planned workout are reported as unplanned, other sports and other weeks are ignored", () => {
  assertEquals(result.unplanned, [
    { date: "2026-11-18", sport: "run", minutes: 20, load: 15 },
  ]);
});

Deno.test("totals cover what was due so far against everything recorded", () => {
  assertEquals(result.totals, {
    plannedMinutes: 100,
    actualMinutes: 65,
    plannedLoad: 82,
    actualLoad: 53,
  });
});
