---
name: triage-feedback
description: Use when Tomer pastes feedback, a bug report, or a feature request from Amit or the Tehila staff (often a forwarded WhatsApp message or a voice-to-text transcription, sometimes with screenshots/videos) — e.g. "עמית כותב...", "אילנית שואלת...", "נסיה — ...", "תמפה ותעבור על הכל, תנתח, תדרג ואז נחליט". Breaks it into numbered items, investigates each, ranks them, and waits for Tomer's go before changing code.
---

# Triage staff feedback (Tehila CRM)

Tomer's standing request for incoming feedback: **"תמפה, תנתח, תדרג ואז נחליט מה התיעדוף"**.
Map → analyze → rank → he decides. Do not jump into code before he picks.

## 1. Parse

- Voice transcriptions are messy ("Faure", "תמיר" = תומר). Rewrite each request as one clear line in Hebrew.
- Split into **numbered items** — one concern per item, even if the message runs them together.
- Note **who** sent it (role matters: same complaint from OFFICE vs CEO points at different permissions).
- If there are screenshots or videos, look at them before classifying. Videos: extract frames.
- Items that repeat an earlier "fixed" issue → flag as **חוזר** (recurring). Those go to the top.

## 2. Investigate each item (read-only)

For each item, find out before ranking:
- **Type:** תקלה (bug) / שיפור (feature) / שאלת שימוש (how-to — no code needed) / החלטה עסקית (needs Amit).
- **Root cause or location:** file/table/policy involved. For bugs, try to reproduce with the
  `repro-as-user` skill — a reproduced bug ranks above a suspected one.
- **Blast radius:** who's blocked. A role that can't do its core job (open a case, create a referral,
  upload a file) is critical — "זה השלב ההתחלתי, בלי זה אי אפשר להתקדם".
- **Effort:** קל / בינוני / כבד, plus whether it needs a DB migration.

Parallelize independent investigations with Explore agents when there are 4+ items.

## 3. Present (to Tomer, in Hebrew)

One table, sorted by priority:

| # | מי | מה | סוג | דחיפות | מאמץ | הערות |
|---|---|---|---|---|---|---|

Priority order: חוזר → חוסם עבודה → אובדן נתונים/אבטחה → תקלות → שיפורים → קוסמטיקה.

Then:
- **Questions only Amit can answer** → hand to the `staff-whatsapp` skill, ready to forward.
- **How-to items** → the answer for the staff member, also via `staff-whatsapp`.
- A recommended batch ("ממליץ להתחיל ב-1, 2, 4 ביחד").

## 4. Wait, then execute

After Tomer picks ("תעשה הכל לפי הסדר" counts as approval for all of it, in order):
- Work item by item; keep a todo list so nothing is silently dropped (he has had to ask
  "מה עם סעיפים 5 ו-6?" before).
- Each fix → verify with `repro-as-user` → ship via `push-to-prod` (no extra "לדחוף?" question).
- End with a status per item (✅ / ⏳ / ❓) and offer the `staff-whatsapp` summary.
