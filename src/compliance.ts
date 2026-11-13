import { addDays } from "./dates.ts";
import type { Activity } from "./intervals.ts";
import { type Plan, workoutTotals } from "./plan.ts";
import { sportOf } from "./summary.ts";

const day = (dateTime: string) => dateTime.slice(0, 10);
const minutes = (secs: number | null | undefined) =>
  Math.round((secs || 0) / 60);

// Compares the elapsed part of a week plan with what was recorded. Planned
// workouts and activities are paired by day and sport, in order.
export function planVsActual(
  plan: Plan,
  activities: Activity[],
  today: string,
) {
  const lastDay = addDays(plan.week, 6);
  const unmatched = activities.filter((a) => {
    const date = day(a.start_date_local);
    return date >= plan.week && date <= lastDay && date <= today &&
      sportOf(a.type) !== "other";
  }).sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));

  const workouts = plan.workouts
    .filter((w) => w.date <= today)
    .map((w) => {
      const planned = workoutTotals(w);
      const index = unmatched.findIndex((a) =>
        day(a.start_date_local) === w.date && sportOf(a.type) === w.sport
      );
      const actual = index < 0 ? undefined : unmatched.splice(index, 1)[0];
      return {
        date: w.date,
        sport: w.sport,
        name: w.name,
        status: actual ? "done" : w.date === today ? "pending" : "missed",
        plannedMinutes: Math.round(planned.minutes),
        plannedLoad: Math.round(planned.load),
        actualMinutes: actual ? minutes(actual.moving_time) : null,
        actualLoad: actual ? actual.icu_training_load || 0 : null,
      };
    });

  const unplanned = unmatched.map((a) => ({
    date: day(a.start_date_local),
    sport: sportOf(a.type),
    minutes: minutes(a.moving_time),
    load: a.icu_training_load || 0,
  }));

  const due = workouts.filter((w) => w.status !== "pending");
  const sum = (values: (number | null)[]) =>
    values.reduce((a: number, b) => a + (b || 0), 0);
  return {
    week: plan.week,
    workouts,
    unplanned,
    totals: {
      plannedMinutes: sum(due.map((w) => w.plannedMinutes)),
      actualMinutes: sum(due.map((w) => w.actualMinutes)) +
        sum(unplanned.map((a) => a.minutes)),
      plannedLoad: sum(due.map((w) => w.plannedLoad)),
      actualLoad: sum(due.map((w) => w.actualLoad)) +
        sum(unplanned.map((a) => a.load)),
    },
  };
}
