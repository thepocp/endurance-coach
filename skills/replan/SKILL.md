---
name: replan
description: Plan or rebuild the rest of the current week or the coming weeks, for example when the current week has no plan yet, or after a new race, illness, injury, travel or missed sessions.
---

# Replan

1. Call `summary` and read the current `plan/<week>.json`, `profile.md` and the
   journal.
2. If the athlete reports a race or time off that is not in `summary` yet, add
   it with `add_event` first. Events the athlete created in intervals.icu are
   theirs to change there.
3. If the current week has no saved plan and days remain in it, plan those days
   now. That needs no other reason, so do not ask the athlete what changed.
4. Rebuild only what is still ahead. Days already done stay as they are, and
   missed sessions are not stacked onto the remaining days.
5. Save with `save_plan`, show the athlete what changed and why, then
   `push_preview` and `push_apply`.
6. Append the reason and the change to `journal/<week>.md` and update "Current
   state" in `profile.md`.
