# endurance-coach

[![CI](https://github.com/thepocp/endurance-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/thepocp/endurance-coach/actions/workflows/ci.yml)

A personal running and cycling coach that runs in Claude Code on top of
[intervals.icu](https://intervals.icu). Claude does the coaching, code does the
arithmetic and enforces the rules, and intervals.icu syncs the planned workouts
to your watch.

## How it works

- **Plugin (this repository)**: an MCP server and three skills. No personal data
  lives here.
- **Data folder (yours, private)**: athlete profile, training rules, week plans
  and a decision journal, under git. Coach sessions run in this folder.

| Tool           | What it does                                         | Permission |
| -------------- | ---------------------------------------------------- | ---------- |
| `summary`      | Readiness, fitness, weekly totals, races, time off   | allowed    |
| `save_plan`    | Validates a week plan and saves it only if it passes | allowed    |
| `push_preview` | Shows the calendar changes for a saved plan          | allowed    |
| `push_apply`   | Applies exactly the previewed changes                | asks       |
| `add_event`    | Adds a race or time off                              | asks       |
| `remove_event` | Removes an event the coach created                   | asks       |

Skills: `/endurance-coach:weekly`, `/endurance-coach:today`,
`/endurance-coach:replan`.

## Security model

- The intervals.icu API key stays in the macOS keychain. `bin/coach-mcp` hands
  it to the server process, and Claude never sees it.
- The server runs under Deno with network access to `intervals.icu` only, read
  access to the data folder and write access to its `plan/` folder.
- In the data folder Claude has no shell and no web access, and cannot edit its
  own settings, instructions, the rules or the saved plans.
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

3. Fill in `profile.md`, in your own language, and review `config.json`.
4. Start a session in the data folder and accept the trust prompt:

   ```sh
   claude --plugin-dir /path/to/endurance-coach
   ```

## Training rules

The rules live in `config.json` in the data folder. You edit them, the coach
cannot.

| Key                              | Meaning                                                           |
| -------------------------------- | ----------------------------------------------------------------- |
| `plan.maxWeeklyHours`            | Hard cap on planned hours per week                                |
| `plan.minEasyShare`              | Minimum share of planned time in Z1 and Z2                        |
| `plan.maxLoadRatio`              | Planned weekly load relative to current fitness (7 x CTL)         |
| `plan.deloadLoadRatio`           | The same ratio for a deload week                                  |
| `plan.maxHardWorkouts`           | Sessions per week with time in Z4 or above                        |
| `plan.maxLongRunShare`           | Longest run as a share of weekly run time                         |
| `plan.longRunFromMinutes`        | Runs shorter than this are not checked against the long run share |
| `plan.loadingWeeksBeforeDeload`  | Loading weeks in a row before a deload is required                |
| `readiness.baselineDays`         | Days of history behind the HRV and resting HR baseline            |
| `readiness.deviationSd`          | Standard deviations from baseline that raise a flag               |
| `readiness.shortSleepHours`      | Sleep below this raises a flag                                    |
| `readiness.deepFatigueFormRatio` | Form (CTL minus ATL) relative to CTL that raises a flag           |

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
