---
name: weekly
description: Weekly review and plan for the coming week. Use on Sunday or whenever the athlete asks to plan a week.
---

# Weekly review and plan

1. Call `summary`. Read `profile.md`, the last journal entries and the previous
   plan in `plan/`.
2. Review the finished week against its plan using `planVsActual` from
   `summary`: what was done, missed or added, how planned and actual time and
   load compare, how load, easy share, RPE and readiness moved. Missed key
   sessions are not made up later.
3. If days remain in the current week and it has no saved plan, plan those days
   first as the current week's plan (workouts only from today on), then continue
   with the coming week. Each week is saved and pushed separately.
4. Decide the coming week:
   - Where it sits in the block (loading week 1 to 3 or deload) and in the
     season (base, build, peak, taper) given the races in `summary`. A races get
     a full taper, B races a short one, C races are trained through. Challenge
     two A races closer than about six weeks.
   - Start from the athlete's weekly template and fixed commitments in
     `profile.md`, then fit it to the limits and to time off in the calendar.
   - After illness, injury or a break, volume comes back first and intensity
     last.
   - Schedule a threshold test when zones are older than about eight weeks or
     missing.
5. Call `save_plan`. If it returns violations, change the plan and call it
   again.
6. Show the athlete the week as a table (day, sport, session, duration, purpose)
   with the totals and limits, and explain the reasoning in a few lines.
7. When the athlete agrees, call `push_preview`, show the changes, then call
   `push_apply` with the token.
8. Append the decisions and their reasons to `journal/<week>.md` and update
   "Current state" in `profile.md`.
