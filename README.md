# endurance-coach

[![CI](https://github.com/thepocp/endurance-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/thepocp/endurance-coach/actions/workflows/ci.yml)

A personal running and cycling coach that runs in Claude Code on top of
[intervals.icu](https://intervals.icu). Claude does the coaching, code does the
arithmetic and enforces the rules, and intervals.icu syncs the planned workouts
to your watch.

## How it works

- **Plugin (this repository)**: an MCP server, the coaching rules it sends to
  the model, a session-start hook that describes the data folder to the model,
  and three skills. No personal data lives here.
- **Data folder (yours, private)**: athlete profile, training rules, week plans
  and a decision journal with monthly summaries, under git. Coach sessions run
  in this folder. Every fact lives in one place: measurements, zones and the
  calendar in intervals.icu, rules and goal numbers in `config.json`, and only
  what intervals.icu does not know in `profile.md`.

| Tool           | What it does                                                                                                                                                                      | Permission |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `summary`      | Readiness, fitness, VO2max, weight, weekly and monthly totals, aerobic efficiency, races, time off, plan versus actual with time in zones, coach workouts changed in the calendar | allowed    |
| `save_plan`    | Validates a week plan and saves it only if it passes                                                                                                                              | allowed    |
| `push_preview` | Shows the calendar changes for a saved plan                                                                                                                                       | allowed    |
| `push_apply`   | Applies exactly the previewed changes                                                                                                                                             | asks       |
| `add_event`    | Adds a race or time off                                                                                                                                                           | asks       |
| `remove_event` | Removes an event the coach created                                                                                                                                                | asks       |

Skills: `/endurance-coach:weekly`, `/endurance-coach:today`,
`/endurance-coach:replan`.

## Security model

- The intervals.icu API key stays in the macOS keychain. `bin/coach-mcp` hands
  it to the server process, and Claude never sees it.
- The server runs under Deno with network access to `intervals.icu` only, read
  access to the data folder and write access to its `plan/` folder.
- In the data folder Claude has no shell and no web access, and cannot edit its
  own settings, instructions, the rules or the saved plans. These permissions
  are copied from the template, and every session warns when the copy differs
  from the plugin's template.
- Calendar writes need your confirmation. The coach creates and deletes only
  events it created itself (`external_id` starting with `coach-`), and only from
  today onwards.
- Free text from intervals.icu (activity names, descriptions) is not passed to
  the model.

Your training and health summaries are still sent to the model as part of the
conversation.

To make macOS ask for confirmation every time the key is read, store it with an
empty trusted application list (`-T ""`) and never choose "Always Allow".

## Setup

Requires macOS, [Deno](https://deno.com) 2 and Claude Code.

1. Create an API key in intervals.icu under Settings, Developer Settings, and
   store it in the keychain:

   ```sh
   security add-generic-password -s endurance-coach -a intervals.icu -w
   ```

2. Create your data folder from the template:

   ```sh
   cp -R template ~/coach-data && cd ~/coach-data && git init
   ```

3. Set your `language` in `config.json`, review the rules there and fill in
   `profile.md`.
4. Start a session in the data folder and accept the trust prompt:

   ```sh
   claude --plugin-dir /path/to/endurance-coach
   ```

## Training rules

The rules live in `config.json` in the data folder. You edit them, the coach
cannot.

| Key                              | Meaning                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `language`                       | Language the coach talks and writes in, read at session start     |
| `plan.maxWeeklyHours`            | Hard cap on planned hours per week                                |
| `plan.minEasyShare`              | Minimum share of planned time in Z1 and Z2                        |
| `plan.maxLoadRatio`              | Planned weekly load relative to current fitness (7 x CTL)         |
| `plan.deloadLoadRatio`           | The same ratio for a deload week                                  |
| `plan.maxHardWorkouts`           | Hard sessions per week                                            |
| `plan.hardWorkoutFromMinutes`    | Minutes in Z4 or above that make a planned session hard           |
| `plan.maxLongRunShare`           | Longest run as a share of weekly run time                         |
| `plan.longRunFromMinutes`        | Runs shorter than this are not checked against the long run share |
| `plan.loadingWeeksBeforeDeload`  | Loading weeks in a row before a deload is required                |
| `plan.maxZoneBySport`            | Optional highest zone per sport, for example `{ "ride": 2 }`      |
| `readiness.baselineDays`         | Days of history behind the HRV and resting HR baseline            |
| `readiness.deviationSd`          | Standard deviations from baseline that raise a flag               |
| `readiness.shortSleepHours`      | Sleep below this raises a flag                                    |
| `readiness.subjectiveFlagFrom`   | Self-reported score (1 best to 4 worst) that raises a flag        |
| `readiness.deepFatigueFormRatio` | Form (CTL minus ATL) relative to CTL that raises a flag           |
| `readiness.fastWeightLossShare`  | Weekly weight loss as a share of body weight that raises a flag   |
| `goals.vo2max`                   | Optional VO2max target, `summary` reports the distance to it      |
| `goals.weightKg`                 | Optional body weight target, reported the same way                |

VO2max and weight are the values synced to intervals.icu wellness. Weight is
read as a seven-day average.

Soreness, fatigue, stress, mood, motivation and injury are the scores you enter
in intervals.icu wellness. Each one at `subjectiveFlagFrom` or worse raises a
readiness flag, the same as low HRV or short sleep.

Run volume is capped by the same load ratio against your recent weekly run
minutes. Limits are recomputed from fresh data on every save, so they grow as
fitness grows.

## Limitations

- macOS only, because the API key is read from the macOS keychain.
- Running and cycling only. Strength work is not planned or tracked.
- The planned load is an estimate from time in zone. intervals.icu computes the
  real value once the workout is in the calendar.

This is a training tool, not medical advice.

## Development

```sh
deno task check
deno task test
```

See [AGENTS.md](AGENTS.md) for the conventions.

## License

[MIT](LICENSE)
