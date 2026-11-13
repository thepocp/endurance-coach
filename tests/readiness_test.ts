import { assertEquals } from "@std/assert";
import { Config } from "../src/config.ts";
import { addDays } from "../src/dates.ts";
import type { Wellness } from "../src/intervals.ts";
import { assessReadiness } from "../src/readiness.ts";
import template from "../template/config.json" with { type: "json" };

const rules = Config.parse(template).readiness;

const TODAY = "2026-11-13";

function history(todayRow: Partial<Wellness> | undefined): Wellness[] {
  const past = Array.from({ length: 30 }, (_, i) => ({
    id: addDays(TODAY, i - 30),
    hrv: i % 2 ? 58 : 62,
    restingHR: i % 2 ? 51 : 53,
  }));
  return todayRow ? [...past, { id: TODAY, ...todayRow }] : past;
}

Deno.test("normal night is green", () => {
  const r = assessReadiness(
    history({ hrv: 60, restingHR: 52, sleepSecs: 8 * 3600, ctl: 30, atl: 32 }),
    TODAY,
    rules,
  );
  assertEquals(r, { status: "green", flags: [], missing: [] });
});

Deno.test("one deviation is yellow", () => {
  const r = assessReadiness(
    history({ hrv: 60, restingHR: 52, sleepSecs: 5 * 3600, ctl: 30, atl: 32 }),
    TODAY,
    rules,
  );
  assertEquals(r.status, "yellow");
  assertEquals(r.flags, ["sleep_short"]);
});

Deno.test("suppressed HRV with elevated resting HR is red", () => {
  const r = assessReadiness(
    history({ hrv: 40, restingHR: 60, sleepSecs: 8 * 3600, ctl: 30, atl: 32 }),
    TODAY,
    rules,
  );
  assertEquals(r.status, "red");
  assertEquals(r.flags, ["hrv_low", "resting_hr_high"]);
});

Deno.test("no overnight data is unknown, not green", () => {
  const r = assessReadiness(history(undefined), TODAY, rules);
  assertEquals(r.status, "unknown");
});
