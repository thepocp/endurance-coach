import { assertEquals, assertStringIncludes } from "@std/assert";
import { Config } from "../src/config.ts";
import type { Plan, Workout } from "../src/plan.ts";
import {
  completedTotals,
  type PlanContext,
  validatePlan,
} from "../src/validate.ts";
import template from "../template/config.json" with { type: "json" };

const ctx: PlanContext = {
  ctl: 40,
  runMinutesByWeek: [200, 200, 200, 200],
  rules: Config.parse(template).plan,
  today: "2026-11-16",
  done: completedTotals([]),
  sportsDoneToday: [],
  runPaceZonesSet: true,
  previousWeeksDeload: [],
  timeOff: [],
};

const easy = (
  date: string,
  sport: Workout["sport"],
  minutes: number,
): Workout => ({
  date,
  sport,
  name: "easy",
  steps: [{ minutes, zone: 2, by: "hr" }],
});

const intervals = (date: string, sport: Workout["sport"]): Workout => ({
  date,
  sport,
  name: "intervals",
  steps: [
    { minutes: 15, zone: 2, by: "hr" },
    {
      repeat: 4,
      steps: [{ minutes: 3, zone: 5, by: sport === "run" ? "pace" : "feel" }, {
        minutes: 2,
        zone: 1,
        by: "hr",
      }],
    },
    { minutes: 10, zone: 1, by: "hr" },
  ],
});

const week = (workouts: Workout[], deload = false): Plan => ({
  week: "2026-11-16",
  deload,
  note: "",
  workouts,
});

const balanced = [
  intervals("2026-11-17", "run"),
  intervals("2026-11-18", "ride"),
  easy("2026-11-19", "run", 40),
  easy("2026-11-20", "run", 30),
  easy("2026-11-21", "ride", 120),
  easy("2026-11-22", "run", 75),
];

function onlyViolation(plan: Plan, context: PlanContext = ctx): string {
  const violations = validatePlan(plan, context);
  assertEquals(violations.length, 1, violations.join("; "));
  return violations[0];
}

Deno.test("balanced week passes", () => {
  assertEquals(validatePlan(week(balanced), ctx), []);
});

Deno.test("workout outside the week is rejected", () => {
  assertStringIncludes(
    onlyViolation(week([easy("2026-11-23", "ride", 30)])),
    "outside the plan week",
  );
});

Deno.test("athlete's weekly hours cap is enforced", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), {
      ...ctx,
      rules: { ...ctx.rules, maxWeeklyHours: 5 },
    }),
    "athlete's cap",
  );
});

Deno.test("load is capped relative to current fitness", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), { ...ctx, ctl: 25 }),
    "estimated load",
  );
});

Deno.test("deload week has a lower load cap", () => {
  assertStringIncludes(
    onlyViolation(week(balanced, true), {
      ...ctx,
      runMinutesByWeek: [300, 300, 300],
    }),
    "estimated load",
  );
});

Deno.test("run volume is capped by recent run history", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), {
      ...ctx,
      runMinutesByWeek: [100, 100, 100],
    }),
    "run volume",
  );
});

Deno.test("too much time above Z2 is rejected", () => {
  const tempo: Workout = {
    date: "2026-11-21",
    sport: "ride",
    name: "tempo",
    steps: [{ minutes: 90, zone: 3, by: "hr" }],
  };
  assertStringIncludes(
    onlyViolation(week([tempo, easy("2026-11-22", "ride", 60)])),
    "Z1-Z2",
  );
});

Deno.test("third hard workout is rejected", () => {
  assertStringIncludes(
    onlyViolation(week([...balanced, intervals("2026-11-20", "ride")])),
    "hard workouts",
  );
});

Deno.test("hard days back to back in one sport are rejected", () => {
  const plan = week([
    intervals("2026-11-17", "ride"),
    intervals("2026-11-18", "ride"),
    easy("2026-11-21", "ride", 150),
  ]);
  assertStringIncludes(onlyViolation(plan), "consecutive days");
});

Deno.test("long run may not dominate the running week", () => {
  const plan = week([
    easy("2026-11-17", "run", 30),
    easy("2026-11-19", "run", 30),
    easy("2026-11-22", "run", 120),
  ]);
  assertStringIncludes(onlyViolation(plan), "longest run");
});

Deno.test("fourth loading week in a row is rejected", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), {
      ...ctx,
      previousWeeksDeload: [false, false, false],
    }),
    "must be a deload",
  );
});

Deno.test("workout during time off is rejected", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), {
      ...ctx,
      timeOff: [{ category: "SICK", start: "2026-11-10", end: "2026-11-17" }],
    }),
    "SICK time off",
  );
});

Deno.test("pace targets need pace zones", () => {
  assertStringIncludes(
    onlyViolation(week(balanced), { ...ctx, runPaceZonesSet: false }),
    "threshold pace",
  );
});

Deno.test("pace targets are rejected for rides", () => {
  const paced: Workout = {
    date: "2026-11-21",
    sport: "ride",
    name: "paced ride",
    steps: [{ minutes: 60, zone: 2, by: "pace" }],
  };
  assertStringIncludes(onlyViolation(week([paced])), "runs only");
});

Deno.test("activities already done this week count toward the rules", () => {
  const done = completedTotals([
    {
      start_date_local: "2026-11-17T08:00:00",
      type: "Run",
      moving_time: 1260,
      icu_training_load: 14,
      icu_hr_zone_times: [1260],
    },
    {
      start_date_local: "2026-11-18T08:00:00",
      type: "Run",
      moving_time: 1620,
      icu_training_load: 19,
      icu_hr_zone_times: [1620],
    },
  ]);
  assertStringIncludes(
    onlyViolation(week([easy("2026-11-22", "run", 70)]), {
      ...ctx,
      today: "2026-11-21",
      done,
    }),
    "longest run is 59%",
  );
});

Deno.test("planned days before today are replaced by what was done", () => {
  const plan = week([
    intervals("2026-11-17", "run"),
    intervals("2026-11-18", "ride"),
    intervals("2026-11-20", "ride"),
    easy("2026-11-21", "ride", 150),
  ]);
  assertEquals(validatePlan(plan, { ...ctx, today: "2026-11-19" }), []);
});

Deno.test("today's workout is not counted twice once it is done", () => {
  const done = completedTotals([{
    start_date_local: "2026-11-21T09:00:00",
    type: "Ride",
    moving_time: 9000,
    icu_training_load: 120,
    icu_hr_zone_times: [9000],
  }]);
  const plan = week([
    easy("2026-11-21", "ride", 150),
    easy("2026-11-22", "ride", 120),
  ]);
  assertEquals(
    validatePlan(plan, {
      ...ctx,
      today: "2026-11-21",
      done,
      sportsDoneToday: ["ride"],
    }),
    [],
  );
});

Deno.test("a short longest run is not treated as a long run", () => {
  const plan = week([
    easy("2026-11-17", "run", 20),
    easy("2026-11-19", "run", 25),
    easy("2026-11-22", "run", 50),
  ]);
  assertEquals(validatePlan(plan, ctx), []);
});
