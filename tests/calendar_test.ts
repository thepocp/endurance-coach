import { assertEquals } from "@std/assert";
import { desiredEvents, diffEvents, workoutText } from "../src/calendar.ts";
import type { Event } from "../src/intervals.ts";
import type { Plan } from "../src/plan.ts";

const plan: Plan = {
  week: "2026-11-16",
  deload: false,
  note: "",
  workouts: [
    {
      date: "2026-11-17",
      sport: "run",
      name: "Hill sprints",
      steps: [
        { minutes: 15, zone: 2, by: "hr" },
        {
          repeat: 6,
          steps: [
            { minutes: 0.5, zone: 6, by: "feel" },
            { minutes: 1.5, zone: 1, by: "hr" },
          ],
        },
        { minutes: 10, zone: 1, by: "hr" },
      ],
    },
    {
      date: "2026-11-21",
      sport: "ride",
      name: "Long ride",
      steps: [{ minutes: 120, zone: 2, by: "hr" }],
    },
  ],
};

const stored = (
  id: number,
  external_id: string | null,
  patch: Partial<Event>,
): Event => ({
  id,
  external_id,
  category: "WORKOUT",
  start_date_local: "2026-11-21T00:00:00",
  type: "Ride",
  name: "Long ride",
  description: "- 120m Z2 HR",
  ...patch,
});

Deno.test("workout text isolates repeats with blank lines", () => {
  assertEquals(
    workoutText(plan.workouts[0]),
    "- 15m Z2 HR\n\n6x\n- Very hard 30s\n- 1m30 Z1 HR\n\n- 10m Z1 HR",
  );
});

Deno.test("unchanged own events are kept, changed ones replaced", () => {
  const changes = diffEvents(desiredEvents(plan), [
    stored(1, "coach-2026-11-21-ride-1", {}),
    stored(2, "coach-2026-11-17-run-1", {
      start_date_local: "2026-11-17T00:00:00",
      type: "Run",
      name: "Old intervals",
    }),
  ], "2026-11-16");
  assertEquals(changes.create.map((e) => e.name), ["Hill sprints"]);
  assertEquals(changes.delete, [{
    id: 2,
    date: "2026-11-17",
    name: "Old intervals",
  }]);
  assertEquals(changes.unchanged, 1);
});

Deno.test("the athlete's own events are never deleted", () => {
  const changes = diffEvents([], [
    stored(1, null, {}),
    stored(2, "garmin-123", {}),
  ], "2026-11-16");
  assertEquals(changes.delete, []);
});

Deno.test("past days are not touched", () => {
  const changes = diffEvents(desiredEvents(plan), [
    stored(2, "coach-2026-11-17-run-1", {
      start_date_local: "2026-11-17T00:00:00",
      name: "Old intervals",
    }),
  ], "2026-11-20");
  assertEquals(changes.create.map((e) => e.name), ["Long ride"]);
  assertEquals(changes.delete, []);
});
