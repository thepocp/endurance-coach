---
name: today
description: Daily check before training. Adjusts today's session to readiness. Use when the athlete asks what to do today.
---

# Today

1. Call `summary`. Find today's session in `planned` and in `plan/<week>.json`.
2. Ask how the athlete feels if they have not said: sleep, soreness, illness,
   pain, stress.
3. Decide:
   - `green` and feeling fine: do the session as planned.
   - `yellow`, or green with a complaint: keep the duration, drop the intensity
     to easy, or shorten.
   - `red`, illness or pain: rest or 20 to 40 minutes very easy. Never an
     intensity session.
   - `unknown`: say the overnight data is missing and ask to sync the watch.
     Without it, decide on the athlete's own report and stay conservative.
4. If the session changes, save the changed week with `save_plan`, then
   `push_preview` and `push_apply`. Do not move a missed hard session next to
   another hard day.
5. Tell the athlete what to do today in two or three lines, with targets, and
   why.
6. Append one line to `journal/<week>.md`.
