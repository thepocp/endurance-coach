import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { desiredEvents, diffEvents, isOwn, OWN_PREFIX } from "./calendar.ts";
import { planVsActual } from "./compliance.ts";
import { loadConfig } from "./config.ts";
import { addDays, weekStart } from "./dates.ts";
import {
  createEvents,
  deleteEvents,
  fetchSnapshot,
  fetchToday,
  getEvent,
  listEvents,
} from "./intervals.ts";
import { Plan, workoutTotals } from "./plan.ts";
import { buildSummary, sportOf } from "./summary.ts";
import {
  completedTotals,
  planLimits,
  planTotals,
  validatePlan,
} from "./validate.ts";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set, start via bin/coach-mcp`);
  return value;
}

const apiKey = requireEnv("ICU_API_KEY");
const projectDir = requireEnv("CLAUDE_PROJECT_DIR");

const COMPARED_WEEKS = 4;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const planPath = (week: string) => `${projectDir}/plan/${week}.json`;
const reply = (value: unknown, isError = false) => ({
  isError,
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

async function readPlan(week: string): Promise<Plan> {
  return Plan.parse(JSON.parse(await Deno.readTextFile(planPath(week))));
}

async function recentPlans(today: string): Promise<Plan[]> {
  const plans: Plan[] = [];
  for (let i = COMPARED_WEEKS - 1; i >= 0; i--) {
    try {
      plans.push(await readPlan(addDays(weekStart(today), -7 * i)));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
  return plans;
}

async function previousWeeksDeload(week: string): Promise<boolean[]> {
  const deloads: boolean[] = [];
  for (let w = addDays(week, -7);; w = addDays(w, -7)) {
    try {
      deloads.unshift((await readPlan(w)).deload);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return deloads;
      throw e;
    }
  }
}

async function pushChanges(week: string) {
  const plan = await readPlan(week);
  const [today, existing] = await Promise.all([
    fetchToday(apiKey),
    listEvents(apiKey, week, addDays(week, 6)),
  ]);
  const changes = diffEvents(desiredEvents(plan), existing, today);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(changes)),
  );
  const token = [...new Uint8Array(digest).slice(0, 6)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return { plan, changes, token };
}

const server = new McpServer({ name: "endurance-coach", version: "0.1.0" });

server.registerTool("summary", {
  description:
    "Fresh training summary from intervals.icu: readiness, fitness, weekly totals per sport, recent activities, races, time off, planned workouts, and saved plans of the last weeks compared with what was done.",
  annotations: { readOnlyHint: true },
}, async () => {
  const { readiness } = await loadConfig(projectDir);
  const snapshot = await fetchSnapshot(apiKey);
  return reply({
    ...buildSummary(snapshot, readiness),
    planVsActual: (await recentPlans(snapshot.today)).map((plan) =>
      planVsActual(plan, snapshot.activities, snapshot.today)
    ),
  });
});

server.registerTool("save_plan", {
  description:
    "Validate a week plan against the training rules and current data (activities already done this week count toward the totals, planned workouts on past days do not), and save it to plan/<week>.json only if it passes. Returns either the violations or the saved totals, both with the current limits.",
  inputSchema: Plan.shape,
}, async (plan: Plan) => {
  const config = await loadConfig(projectDir);
  const snapshot = await fetchSnapshot(apiKey);
  const summary = buildSummary(snapshot, config.readiness);
  const ctl = summary.fitness?.ctl;
  if (typeof ctl !== "number") throw new Error("no CTL in wellness data");
  const doneThisWeek = snapshot.activities.filter((a) => {
    const day = a.start_date_local.slice(0, 10);
    return day >= plan.week && day <= snapshot.today;
  });
  const context = {
    rules: config.plan,
    today: snapshot.today,
    done: completedTotals(doneThisWeek),
    sportsDoneToday: doneThisWeek
      .filter((a) => a.start_date_local.slice(0, 10) === snapshot.today)
      .map((a) => sportOf(a.type)),
    ctl,
    runMinutesByWeek: summary.weeks
      .filter((w) => w.week < plan.week)
      .map((w) => w.run.minutes),
    runPaceZonesSet: summary.thresholds
      .some((t) => t.sport === "run" && !!t.thresholdPace),
    previousWeeksDeload: await previousWeeksDeload(plan.week),
    timeOff: summary.off,
  };
  const limits = planLimits(context, plan.deload);
  const totals = planTotals(plan, context);
  const violations = validatePlan(plan, context);
  if (violations.length) return reply({ violations, totals, limits }, true);
  await Deno.mkdir(`${projectDir}/plan`, { recursive: true });
  await Deno.writeTextFile(
    planPath(plan.week),
    JSON.stringify(plan, null, 2) + "\n",
  );
  return reply({ saved: `plan/${plan.week}.json`, totals, limits });
});

server.registerTool("push_preview", {
  description:
    "Show what push_apply would change in the intervals.icu calendar for a saved week plan. Only the coach's own future workouts are created or deleted. Returns the changes and a token for push_apply.",
  inputSchema: { week: date },
  annotations: { readOnlyHint: true },
}, async ({ week }: { week: string }) => {
  const { changes, token } = await pushChanges(week);
  return reply({ ...changes, token });
});

server.registerTool("push_apply", {
  description:
    "Apply exactly the changes shown by push_preview. Fails if the plan or the calendar changed since the preview.",
  inputSchema: { week: date, token: z.string() },
}, async ({ week, token }: { week: string; token: string }) => {
  const { plan, changes, token: current } = await pushChanges(week);
  if (token !== current) {
    throw new Error("changes differ from the preview, run push_preview again");
  }
  if (changes.delete.length) {
    await deleteEvents(apiKey, changes.delete.map((e) => e.id));
  }
  const created = changes.create.length
    ? await createEvents(apiKey, changes.create)
    : [];
  const expectedSecs = new Map(
    desiredEvents(plan).map((e, i) => [
      e.external_id,
      Math.round(workoutTotals(plan.workouts[i]).minutes * 60),
    ]),
  );
  const problems = changes.create.flatMap((wanted) => {
    const stored = created.find((e) => e.external_id === wanted.external_id);
    if (!stored) return [`${wanted.external_id}: not stored with its id`];
    return stored.moving_time === expectedSecs.get(wanted.external_id) ? [] : [
      `${wanted.external_id}: intervals.icu parsed ${stored.moving_time}s, planned ${
        expectedSecs.get(wanted.external_id)
      }s`,
    ];
  });
  return reply({
    created: created.length,
    deleted: changes.delete.length,
    problems,
  }, problems.length > 0);
});

const AddEvent = z.object({
  category: z.enum([
    "RACE_A",
    "RACE_B",
    "RACE_C",
    "HOLIDAY",
    "SICK",
    "INJURED",
  ]),
  date,
  lastDate: date.optional().describe("Last day of a multi-day event"),
  sport: z.enum(["run", "ride"]).optional().describe("Required for races"),
  name: z.string().min(1),
  distanceKm: z.number().positive().optional(),
});

server.registerTool("add_event", {
  description:
    "Add a race or time off (holiday, sickness, injury) to the intervals.icu calendar. Returns the event as stored.",
  inputSchema: AddEvent.shape,
}, async (input: z.infer<typeof AddEvent>) => {
  if (input.category.startsWith("RACE_") && !input.sport) {
    throw new Error("a race needs a sport");
  }
  const [stored] = await createEvents(apiKey, [{
    external_id: `${OWN_PREFIX}${input.category}-${input.date}`,
    category: input.category,
    start_date_local: `${input.date}T00:00:00`,
    // intervals.icu stores the end of a multi-day event as the day after.
    end_date_local: input.lastDate && `${addDays(input.lastDate, 1)}T00:00:00`,
    type: input.sport && (input.sport === "run" ? "Run" : "Ride"),
    name: input.name,
    distance: input.distanceKm && input.distanceKm * 1000,
  }]);
  return reply(stored);
});

server.registerTool("remove_event", {
  description:
    "Remove a calendar event that the coach created earlier. Events created by the athlete in intervals.icu cannot be removed.",
  inputSchema: { id: z.number().int() },
}, async ({ id }: { id: number }) => {
  const event = await getEvent(apiKey, id);
  if (!isOwn(event)) {
    throw new Error(`event ${id} was not created by the coach`);
  }
  await deleteEvents(apiKey, [id]);
  return reply({ deleted: id, name: event.name });
});

await server.connect(new StdioServerTransport());
