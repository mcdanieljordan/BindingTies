# FamilyOS — Build Plan (v1 draft)

Plan only. Nothing is built yet. Sources: `FamilyOS_Next.html`, `family-os-opensource-v3.html`, and the Market Analysis PDF.

---

## 1. The one-sentence product

**A free-to-start, works-offline family app where one shared calendar, reliable reminders (meds, timers, alarms), picture routines you can print, and a *cooperative* points system all live together, so the whole family wins as a team.**

Why this is open ground (from the PDF): calendars, chore apps, kid-routine apps and med reminders are four separate products today. Nobody combines them, the wall-screen products cost $540–$960 over 3 years, Maple shuts down Dec 31 2026, and the biggest complaints are paywalls after setup, broken two-way calendar sync, one-parent-does-all-the-work, sibling-competition fights, and no offline or printable options for non-readers.

> Caveat: a lot of the PDF's competitor numbers are cited from Sense's own blog (a competitor). Treat prices and ratings as "directionally right, verify before we market against them."

---

## 2. What the two prototypes give us (and where they fall short)

| | `FamilyOS_Next.html` | `family-os-opensource-v3.html` |
|---|---|---|
| Look & feel | Best. Dark, rounded, sidebar, mission-control feel. Midnight/Light themes. | Plain utility UI, numbered tabs. Looks like an admin tool. |
| Strongest ideas | Today dashboard, month calendar, mission/quest framing, meals, trips, notification toggle, backup, "what needs a connected app" honesty section | 84-icon Lucide picker, **1-click print**, Focus mode (one step at a time), Quest/Calm/Minimal skins, XP ledger, badges, reward store, kid PIN, sitter card, kiosk night-dim, natural-language event parsing (chrono), trip sharing with privacy toggles |
| Weak spots | Emoji icons (inconsistent, not printable well), no print studio, thin routines | Dense, text-heavy, not kid-friendly to look at |

**Both share the same fatal limits:** single HTML file, data in `localStorage` of one browser, no real accounts, no real sync (the "fan-out to Google/Outlook/Apple" is just a text box), and no way to fire a notification when the app is closed. They are good **design prototypes**, not a foundation. The plan is: keep their best ideas and look, rebuild properly.

---

## 3. Design principles (these decide every tradeoff)

1. **Team wins, nobody loses.** Shared family goals. No penalties, no demerits, no shame streaks. Optional friendly sibling challenge, off by default.
2. **A 4-year-old can use the kid side.** Pictures first, words second, one big tap target, numbered order, read-aloud.
3. **The "default parent" must not be the only one who works.** Every feature should make it easy for the *other* adult to see, claim and do things.
4. **Fast in, fast out.** Adding an event or reminder takes under 5 seconds. Typing a sentence is enough.
5. **Never lock up what's already set up.** Free tier is useful forever. Nothing created is held hostage behind a late paywall. Data exports anytime.
6. **Works offline, then syncs.** Taps always work instantly.
7. **Honest about reliability.** Medication alarms are the one place being wrong matters. We say plainly what the platform can and can't guarantee (see §6).
8. **Kid-safe by design.** No child emails, no ads, no third-party trackers, no face/voice biometrics, parent-owned child profiles.

---

## 4. Feature blueprint (the list you asked for)

### Big features (the pillars)

**A. Shared Family Calendar**
Color per person, day/week/month/agenda, assign who/driver, recurring events, "Today" glance. Quick-add by typing a sentence ("Soccer Maya Tue 5pm driver Dad remind 30m"). Two-way sync with Google and Outlook; Apple via on-device sharing (see §6).

**B. Reminders That Actually Get Noticed**
One-off and repeating reminders, per-person or "anyone." Escalation: gentle → louder → nudge a second adult. Location-free to start. "Leave by" alerts that count back from event time minus drive time.

**C. Medication & Care Reminders (safety-grade)**
User-entered schedule only (no dosing math, no advice, stays outside medical-device rules). "Given by Dad at 8:02" shared log so nobody double-doses. Missed-dose escalation to the other adult. Refill reminders. Care profiles for kids, grandparents, pets.

**D. Timers & Alarms**
Visual countdown timers (shrinking ring), named timers ("Shoes on"), multiple at once, family-visible. Repeating alarms (wake up, bedtime, leave for school). Per-step timers inside routines.

**E. Picture Routines & Checklists + Print Studio**
Routines as ordered picture cards (Morning / After School / Bedtime and custom). Big numbers 1-2-3, friendly icons or the child's own photos, optional recorded voice. Kid mode: one card at a time ("Focus"). **One tap prints** a clean black-and-white page (Letter/A4, portrait/landscape, 1/2/4 per page) with large pictures and check boxes. Same routine works on screen and on the fridge.

**F. Team Family Quests (cooperative gamification)**
Everyone's completed routines, chores and on-time moments feed a **shared Family Quest bar**. Family rewards (pizza night, movie, park trip). Personal stars too, but the headline is "we did it." Weekly team recap. Forgiving: streaks "pause," never reset to zero. Small point values, lighter weekends. Badges for effort and kindness, not just speed.

**G. Chores & Shared Ownership**
"Up for grabs" chores anyone can claim. Fair-share view showing who carries what (gentle, not a scoreboard). Ownership of recurring jobs (Fair-Play style) so planning stops living in one head. Optional allowance/savings tracking.

**H. Shared Lists**
Grocery (grouped by aisle), packing, to-dos. Real-time, works in the store with no signal, merges cleanly when two people edit. Meal ideas feeding the grocery list.

**I. Kitchen Wall Display (use any old tablet)**
Full-screen "Today" board: schedule, who's doing what, timers, routine quick-launch, next med. Night dim, auto-return to Today, screen-on guidance. No special hardware.

**J. Capture Anything**
Forward an email, snap a flyer or school calendar photo, paste text → proposed events show up for a **human check before saving** (flyer image shown beside the extracted fields so a wrong date is obvious).

**K. Sitter / Grandparent Card**
A link or printable page with emergency contacts, allergies, med times, bedtime routine, wifi, house rules. PIN-protected, expires. No account needed.

**L. Family Accounts & Privacy**
Parents have accounts; kids are parent-owned profiles with a picture-PIN. Roles (parent / teen / child / caregiver). Export and delete all data. Calm/low-stimulation mode.

**M. Learning Vault (added by you after the first draft)**
Per-child private vault for homework and grades. Save PDFs and photos (JPEG/PNG), tag by subject/type, add a "context" note (what it is, what helped, what to watch). Grades chart over time per subject. A profile page per child (diagnoses, strengths, triggers, what works) and goals with progress. One-click **Context Pack**: a clean Markdown summary shaped for a teacher, doctor, therapist or AI assistant, with sensitive items (medical, IEP/504, therapy) excluded unless you opt in. Built so a later AI helper can read the structured records instead of guessing. Suits families managing things like autism or LKS where many professionals need the same up-to-date picture.

### Smaller features (grouped)

**Calendar polish**
- Multi-calendar write-back (event updates both parents' calendars)
- ICS import / subscribe, ICS export
- "Who's driving" + pickup-conflict warning
- Birthday / holiday auto-layers, school-year import
- Weekly digest email/notification ("your week at a glance")
- Event templates (practice, appointment) and duplicate-last-week
- Countdown to special events ("12 days to Disney")
- Color-blind-safe palette option

**Reminder polish**
- Snooze presets, "remind me again when I get home"
- Quiet hours with override for meds
- Reminder from a shared list item
- Voice add ("Hey, remind Maya to…") where the platform allows
- Remind-by-name ("tell Sida")

**Medication polish**
- As-needed (PRN) log with minimum gap warning the user sets
- Photo of the label (stored privately, not analyzed)
- Doctor/pharmacy contacts, refill countdown
- Printable med chart for the fridge/sitter
- Shared supplement/vitamin routines

**Timer/alarm polish**
- Preset timers (teeth 2:00, reading 20:00, screen time)
- Sound and voice choices, gentle wake-up ramp
- "Time left until we leave" banner on kiosk
- Time-timer style visual (colored wedge) for non-readers

**Routine & print polish**
- 300+ icon library, searchable; add child's own photo
- Parent-recorded voice per step
- "First / Then" two-card board, "Now / Next / Later"
- Print: wall chart, wallet card, door-hanger, sticker-sheet, weekly chore chart, reward chart
- Routine templates by age (2–4, 5–8, 9–12, teen)
- Flip a routine for weekend/school-day, auto-pick by day
- Sensory settings: no sounds, no confetti, no flashing
- "Done" celebration options (quiet check, sticker, sound, confetti)

**Gamification polish**
- Family level ladder, themes (space, garden, pirate-ship) that evolve with team progress
- Age-tuned looks: playful (3–9), neutral (10+), calm
- XP ledger (transparent, parent can adjust)
- Reward store with team and personal rewards, parent approval
- Celebration moments for parents too ("Dad did 3 shared chores")
- Photo proof option, one-tap parent approve
- Weekend & vacation "pause" with no penalties

**Lists & meals**
- Aisle-grouped groceries, recent/frequent items
- Recipe-link-to-grocery, meal plan → shopping list
- Store-mode (big text, tap to cross off)

**Household & sharing**
- Multi-family trips/events with selective sharing (carry over from v3, later phase)
- Share a one-off event or plan with non-app friends (link + PDF)
- Guest roles (grandparent, sitter) with limited view
- Activity feed ("Mom added…")

**Platform & trust**
- Install to phone home screen, works offline
- Light/dark/auto, large-text and screen-reader support, reduce-motion
- Backup/restore, full export (JSON + ICS + PDF)
- Clear "what this app can't guarantee" page for alarms
- No ads, no data selling, plain-English privacy page

---

## 5. Recommended architecture

**A Progressive Web App (installable website) first, native wrapper later.** Reason: one codebase runs on iPhone, Android, laptop and the kitchen tablet, no app-store gate to start, and that matches the "use any device you already own" positioning.

| Layer | Choice | Why |
|---|---|---|
| UI | React + TypeScript + Vite | Familiar, huge ecosystem, fast |
| Styling | Tailwind + design tokens (themes: Midnight, Light, Calm, Kid-Bright) | Matches Next.html look, easy skins |
| Icons | Lucide (open-source) + custom photo upload | Printable, consistent |
| Local storage | IndexedDB via Dexie | Offline-first, far more reliable than `localStorage` |
| Sync + accounts | Supabase (Postgres, auth, realtime) | You already use it (Word Garden); row-level security gives per-family privacy |
| Push | Web Push + a small scheduler (Supabase edge function/cron) | The only way a reminder can arrive with the app closed |
| Natural language dates | chrono-node (as in v3) | Free, works offline |
| Print | CSS print stylesheets + generated PDF | Crisp black & white output |
| AI capture (later) | Claude vision via a server function, human review UI | Keeps keys off the device |
| Native wrap (later) | Capacitor | Unlocks iOS AlarmKit / Android exact alarms, App Store presence |

**Data model (core tables):** family, member (role, color, avatar, PIN hash), event, reminder, alarm, timer, medication, dose_log, routine, routine_step, routine_run, chore, quest, point_ledger, reward, list, list_item, caregiver_card, device. Every row has `family_id`, `updated_at`, and a soft-delete flag so sync stays simple.

**Sync approach:** each device writes locally first, queues changes, and merges on reconnect (last-write-wins per field; list items use add-wins so two people editing groceries never lose items).

---

## 6. The hard truths (so we plan around them, not get surprised)

1. **Browsers can't promise alarms.** A website can't ring like the Clock app when closed. Web Push can *notify* (iOS requires the app installed to the Home Screen, iOS 16.4+), but delivery isn't guaranteed and can't punch through Do Not Disturb.
   - Phase 1–3: push notifications + in-app alarms, labeled honestly. Medication feature carries a "backup: use your phone's alarm" notice and a second-adult escalation.
   - Phase 6: Capacitor wrapper uses iOS AlarmKit / Critical Alerts and Android exact alarms for true Clock-grade alarms.
2. **Calendar sync is uneven.** Google and Outlook have clean APIs. Apple/iCloud has none, so: CalDAV polling (~15 min, breaks when an Apple password changes) or on-device EventKit in the native app. Plan: ICS feed + Google/Outlook two-way first; Apple via native wrapper.
3. **Kids' privacy law (COPPA, amended).** Keep child profiles parent-owned, no child emails, no biometrics, no ad SDKs, parent-controlled data retention and delete. Needs a short legal read-through before public launch.
4. **Medication stays a reminder log, not medical advice.** No dose calculation, no interaction warnings. Keeps us out of regulated-device territory.
5. **Print is a feature, so test it.** Print differs by browser/printer; we'll test Chrome/Safari/Edge, Letter and A4.
6. **Kiosk on iPad isn't fully lockable from a website.** We provide setup guidance (Guided Access) rather than pretend.

---

## 7. Phased build

Each phase ends with something you can use and show.

**Phase 0 — Foundations (≈ 1 session)**
Decide name/branding, set up project (Vite+React+TS+Tailwind+Dexie), design tokens and 4 themes, family/member model, PWA install shell, navigation (Today · Calendar · Routines · Care · Family Quest · Lists · Settings).
*Done when:* installable empty app with working themes and add-family-members.

**Phase 1 — The daily loop (core value)**
Today dashboard, calendar (day/week/month/agenda), quick-add with natural language, assign person/driver, recurring events, color-coded members, local reminders while app is open.
*Done when:* you can run your real week from it on one device.

**Phase 2 — Routines + Print Studio (the hero feature)**
Routine builder with icon picker + photo upload, step numbers, Focus mode for kids, per-step timer ring, run history, templates by age, **one-tap print** (several layouts), Calm/sensory settings.
*Done when:* you print a bedtime chart a 4-year-old can follow without help.

**Phase 3 — Team Family Quests**
Shared quest bar, point ledger, forgiving streak "pause," up-for-grabs chores, family + personal rewards with parent approval, badges, weekly team recap, optional sibling challenge (off by default), evolving theme art.
*Done when:* a week of real use feels motivating, not nagging.

**Phase 4 — Accounts, sync, real push**
Supabase auth + family invite link, kid picture-PIN, realtime sync across devices, offline queue, Web Push + scheduler, shared lists with safe merging, activity feed.
*Done when:* two phones and a tablet stay in agreement, and a reminder arrives with the app closed.

**Phase 5 — Care & timers (safety layer)**
Medication schedules with "given by / when" lock, missed-dose escalation to second adult, refill reminders, PRN log, multi-timer panel, repeating alarms, kiosk Wall Display with night dim, sitter card (PIN, expiring link, printable).
*Done when:* two parents can't double-dose and the sitter needs no app.

**Phase 6 — Capture & calendar sync**
Google + Outlook two-way sync with write-back to both parents, ICS in/out, email-forward and photo-flyer capture with side-by-side human review.

**Phase 7 — Native wrapper & launch**
Capacitor build, AlarmKit/exact-alarm reliability, Apple calendar via EventKit, app-store listing, privacy policy/COPPA review, pricing + Free/Plus tiers, import/export, onboarding that gets a family running in 5 minutes.

*Nice-to-have after launch:* multi-family trip hub, meal planner, allowance banking, voice assistant integration.

---

## 8. Pricing idea (from the PDF, adjusted to our promises)

- **Free forever, ad-free:** calendar, lists, timers, one routine with print, small monthly AI-capture allowance.
- **Family plan (~$5–6/mo or ~$50–60/yr, unlimited members):** unlimited capture, multi-calendar two-way sync, quests with allowance, med escalation, sitter cards, kiosk.
- Optional one-time lifetime pass. Rule: **never remove something a family already built.**

---

## 9. Decisions I need from you before Phase 0

1. **Who is this for first?** Just your family (fast, private, simple) or a product you'd release publicly? This changes how much we invest in accounts, billing and legal.
2. **Platform:** web app (PWA) first as recommended, or do you specifically want a real iPhone app from day one?
3. **Which devices does your household actually use?** (iPhone/Android, the kitchen tablet.) Affects alarm and calendar decisions.
4. **Kids' ages**, so we tune the first routine templates and the kid look.
5. **Backend:** OK to use Supabase (you already do) for sync and push?
6. **Name:** keep "FamilyOS" or pick a warmer one?

## 10. How I'd proceed once you approve

Start at Phase 0 and move through Phase 2 first, since a good daily loop plus print routines is the part nobody else does well and the part you can test in your own kitchen immediately. I'll keep the Next.html look as the visual starting point and port the v3 ideas (icon picker, print, Focus mode, skins, XP ledger, sitter card) into the new structure.

---

## 11. Build status (updated Nov 20, 2026)

Decisions made: **PWA, your family first.** Local-first (no accounts yet); Supabase sync is the next stage.

| Phase | Status |
|---|---|
| 0 Foundations (Vite+React+TS, local IndexedDB, themes, installable PWA) | Done |
| 1 Daily loop (Today, calendar with sentence quick-add, recurring events, reminders while open) | Done |
| 2 Routines + Print Studio (icon picker, own photos, checklist, kid Focus mode with timer ring, print rows/cards) | Done |
| 3 Team Quests (shared bar, up-for-grabs chores, rewards, badges, bonus, points history, calm mode, lighter weekends) | Done |
| 5 Care (medicine log with "given by", timers, alarms, wall display with dim) | Done, minus second-adult escalation, which needs sync |
| M Learning Vault (files, grades chart, profile, goals, Context Pack) | Done (v1) |
| 4 Accounts, sync, real push | Code written, not connected: needs a Supabase project (creation was blocked). Local id/outbox part tested; server side untested. See `supabase/SETUP.md` |
| 6 Capture (flyer/email) and Google/Outlook sync | Later |
| 7 Native wrapper (true alarms), launch | Later |

Run it: `cd app && npm install && npm run dev`. App code is in `app/`.

Known gaps to tackle next: sync between devices, background push, sitter card, PNG app icons for iOS home screen, per-person PIN lock for kid mode, Vault file export as a single zip.
