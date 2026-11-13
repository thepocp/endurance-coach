# Working on endurance-coach

## Layout

- `src/` is the MCP server. `mcp.ts` and `intervals.ts` do the I/O. Everything
  else is pure functions over data and is where the logic and the tests go.
- `skills/` holds the coaching procedures, `template/` the data folder a user
  copies, `bin/coach-mcp` the launcher that reads the API key from the keychain.

## Rules

- This repository holds no personal data. Athlete data, plans and journals live
  in the user's own data folder. Test fixtures are synthetic.
- Everything here is written in English.
- Numbers shown to the athlete are computed in code, never by the model.
- Training rules and thresholds belong in `template/config.json` and the
  `Config` schema, not in constants. Update the README table with them.
- Calendar writes go through `push_apply`, `add_event` or `remove_event`, which
  touch only events whose `external_id` starts with `coach-`.
- Never read, print or log the API key, and do not call `security` yourself.
- The Deno permission flags in `bin/coach-mcp` are part of the security model.
  Widen them only when a feature needs it, and say so in the README.

## Checks

```sh
deno task check
deno task test
```
