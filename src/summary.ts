import { addDays, weekStart } from "./dates.ts";
import type { ReadinessRules } from "./config.ts";
import type { Activity, Snapshot } from "./intervals.ts";
import { EASY_ZONES } from "./plan.ts";
import { assessReadiness } from "./readiness.ts";

const RECENT_DAYS = 14;
const PLANNED_DAYS = 14;
const OFF_CATEGORIES = ["HOLIDAY", "SICK", "INJURED"];

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

function emptyTotals() {
  return { sessions: 0, minutes: 0, km: 0, load: 0, longestMinutes: 0 };
}

function summarizeWeek(activities: Activity[]) {
  const sports = {
    run: emptyTotals(),
    ride: emptyTotals(),
    other: emptyTotals(),
  };
  const hrZoneSecs: number[] = [];
  for (const a of activities) {
    const t = sports[sportOf(a.type)];
    t.sessions += 1;
    t.minutes += minutes(a.moving_time);
    t.km = Math.round((t.km + km(a.distance)) * 10) / 10;
    t.load += a.icu_training_load || 0;
    t.longestMinutes = Math.max(t.longestMinutes, minutes(a.moving_time));
    (a.icu_hr_zone_times || []).forEach((secs, zone) => {
      hrZoneSecs[zone] = (hrZoneSecs[zone] || 0) + secs;
    });
  }
  const zoneTotal = hrZoneSecs.reduce((a, b) => a + b, 0);
  const easySecs = hrZoneSecs.slice(0, EASY_ZONES).reduce((a, b) => a + b, 0);
  return {
    ...sports,
    hrZoneMinutes: hrZoneSecs.map(minutes),
    easyShare: zoneTotal ? Math.round(easySecs / zoneTotal * 100) / 100 : null,
  };
}

export function buildSummary(
  { today, athlete, activities, wellness, events }: Snapshot,
  rules: ReadinessRules,
) {
  const byWeek = new Map<string, Activity[]>();
  for (const a of activities) {
    const week = weekStart(day(a.start_date_local));
    byWeek.set(week, [...(byWeek.get(week) || []), a]);
  }
  const firstWeek = [...byWeek.keys()].sort()[0] || weekStart(today);
  const weekKeys: string[] = [];
  for (let w = firstWeek; w <= weekStart(today); w = addDays(w, 7)) {
    weekKeys.push(w);
  }
  const latest = wellness.findLast((w) => typeof w.ctl === "number");

  return {
    today,
    readiness: assessReadiness(wellness, today, rules),
    fitness: latest && {
      date: latest.id,
      ctl: latest.ctl,
      atl: latest.atl,
      rampRate: latest.rampRate,
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
      })),
    weeks: weekKeys.map((week) => ({
      week,
      ...summarizeWeek(byWeek.get(week) || []),
    })),
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
