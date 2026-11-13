import { z } from "zod";
import { addDays, localDate, weekStart } from "./dates.ts";

const API = "https://intervals.icu/api/v1/athlete/0";
const HISTORY_DAYS = 90;

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

const Athlete = z.object({
  timezone: z.string(),
  sportSettings: z.array(z.object({
    types: z.array(z.string()),
    lthr: z.number().nullish(),
    max_hr: z.number().nullish(),
    hr_zones: z.array(z.number()).nullish(),
    threshold_pace: z.number().nullish(),
    pace_units: z.string().nullish(),
  })),
});

const Activity = z.object({
  start_date_local: localDateTime,
  type: z.string().nullish(),
  moving_time: z.number().nullish(),
  distance: z.number().nullish(),
  icu_training_load: z.number().nullish(),
  average_heartrate: z.number().nullish(),
  icu_rpe: z.number().nullish(),
  feel: z.number().nullish(),
  icu_hr_zone_times: z.array(z.number()).nullish(),
});

const Wellness = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ctl: z.number().nullish(),
  atl: z.number().nullish(),
  rampRate: z.number().nullish(),
  restingHR: z.number().nullish(),
  hrv: z.number().nullish(),
  sleepSecs: z.number().nullish(),
  sleepScore: z.number().nullish(),
  weight: z.number().nullish(),
});

const Event = z.object({
  id: z.number(),
  external_id: z.string().nullish(),
  description: z.string().nullish(),
  category: z.string(),
  start_date_local: localDateTime,
  end_date_local: localDateTime.nullish(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  moving_time: z.number().nullish(),
  distance: z.number().nullish(),
  icu_training_load: z.number().nullish(),
});

export type Athlete = z.infer<typeof Athlete>;
export type Activity = z.infer<typeof Activity>;
export type Wellness = z.infer<typeof Wellness>;
export type Event = z.infer<typeof Event>;

export type Snapshot = {
  today: string;
  athlete: Athlete;
  activities: Activity[];
  wellness: Wellness[];
  events: Event[];
};

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  const url = new URL(API + path);
  url.search = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`API_KEY:${apiKey}`)}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`intervals.icu ${method} ${path}: HTTP ${res.status}`);
  }
  return schema.parse(await res.json());
}

function get<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  return request(apiKey, "GET", path, params, schema);
}

export async function fetchToday(apiKey: string): Promise<string> {
  const athlete = await get(apiKey, "", {}, Athlete);
  return localDate(athlete.timezone, new Date());
}

export function listEvents(apiKey: string, oldest: string, newest: string) {
  return get(apiKey, "/events", { oldest, newest }, z.array(Event));
}

export function getEvent(apiKey: string, id: number) {
  return get(apiKey, `/events/${id}`, {}, Event);
}

export type NewEvent = {
  category: string;
  start_date_local: string;
  end_date_local?: string;
  type?: string;
  name: string;
  description?: string;
  distance?: number;
  external_id: string;
};

export function createEvents(apiKey: string, events: NewEvent[]) {
  return request(
    apiKey,
    "POST",
    "/events/bulk",
    { upsertOnUid: "false", updatePlanApplied: "false" },
    z.array(Event),
    events,
  );
}

export function deleteEvents(apiKey: string, ids: number[]) {
  return request(
    apiKey,
    "PUT",
    "/events/bulk-delete",
    {},
    z.unknown(),
    ids.map((id) => ({ id })),
  );
}

export async function fetchSnapshot(apiKey: string): Promise<Snapshot> {
  const athlete = await get(apiKey, "", {}, Athlete);
  const today = localDate(athlete.timezone, new Date());
  const oldest = weekStart(addDays(today, -HISTORY_DAYS));
  const [activities, wellness, events] = await Promise.all([
    get(apiKey, "/activities", { oldest, newest: today }, z.array(Activity)),
    get(apiKey, "/wellness", { oldest, newest: today }, z.array(Wellness)),
    get(
      apiKey,
      "/events",
      { oldest: addDays(today, -30), newest: addDays(today, 365) },
      z.array(Event),
    ),
  ]);
  return { today, athlete, activities, wellness, events };
}
