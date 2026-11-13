import type { Event, NewEvent } from "./intervals.ts";
import type { Plan, Step, Workout } from "./plan.ts";

export const OWN_PREFIX = "coach-";

const FEEL_CUES = [
  "Very easy",
  "Easy",
  "Steady",
  "Comfortably hard",
  "Hard",
  "Very hard",
  "All out",
];

const day = (dateTime: string) => dateTime.slice(0, 10);

function duration(minutes: number): string {
  const secs = Math.round(minutes * 60);
  if (secs < 60) return `${secs}s`;
  return secs % 60 ? `${Math.floor(secs / 60)}m${secs % 60}` : `${secs / 60}m`;
}

function stepLine(step: Step): string {
  if (step.by === "feel") {
    return `- ${FEEL_CUES[step.zone - 1]} ${duration(step.minutes)}`;
  }
  const unit = step.by === "hr" ? "HR" : "Pace";
  return `- ${duration(step.minutes)} Z${step.zone} ${unit}`;
}

// A blank line ends a repeat block in the intervals.icu workout syntax, so
// every repeat is isolated by blank lines from the steps around it.
export function workoutText(workout: Workout): string {
  const sections: string[][] = [];
  let plain: string[] | undefined;
  for (const block of workout.steps) {
    if ("repeat" in block) {
      plain = undefined;
      sections.push([`${block.repeat}x`, ...block.steps.map(stepLine)]);
    } else {
      if (!plain) sections.push(plain = []);
      plain.push(stepLine(block));
    }
  }
  return sections.map((lines) => lines.join("\n")).join("\n\n");
}

export function desiredEvents(plan: Plan): NewEvent[] {
  const counts = new Map<string, number>();
  return plan.workouts.map((w) => {
    const key = `${w.date}-${w.sport}`;
    const n = (counts.get(key) || 0) + 1;
    counts.set(key, n);
    return {
      external_id: `${OWN_PREFIX}${key}-${n}`,
      category: "WORKOUT",
      start_date_local: `${w.date}T00:00:00`,
      type: w.sport === "run" ? "Run" : "Ride",
      name: w.name,
      description: workoutText(w),
    };
  });
}

export function isOwn(event: Event): boolean {
  return !!event.external_id?.startsWith(OWN_PREFIX);
}

export function diffEvents(
  desired: NewEvent[],
  existing: Event[],
  today: string,
) {
  const ours = existing.filter((e) =>
    e.category === "WORKOUT" && isOwn(e) && day(e.start_date_local) >= today
  );
  const upcoming = desired.filter((d) => day(d.start_date_local) >= today);
  const same = (d: NewEvent, e: Event) =>
    e.external_id === d.external_id &&
    day(e.start_date_local) === day(d.start_date_local) &&
    e.type === d.type && e.name === d.name && e.description === d.description;
  const create = upcoming.filter((d) => !ours.some((e) => same(d, e)));
  return {
    create,
    delete: ours
      .filter((e) => !upcoming.some((d) => same(d, e)))
      .map((e) => ({ id: e.id, date: day(e.start_date_local), name: e.name })),
    unchanged: upcoming.length - create.length,
  };
}
