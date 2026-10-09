---
name: staff-whatsapp
description: Use whenever Tomer asks for a message, summary, update, or question to send to Amit or the Tehila staff (Ilanit/Ilana, Nesia, Eran, the team WhatsApp group) — e.g. "תסכם לי שאשלח לעמית", "מה לכתוב לאילנית", "תנסח הודעה לקבוצה", "מה לשאול את עמית", "סיכום למה שבוצע ומה פתוח". Produces a ready-to-paste Hebrew WhatsApp message for non-technical readers.
---

# Staff WhatsApp message (Tehila CRM)

Tomer copies these straight into WhatsApp. Every past miss was one of the rules below —
he had to correct "בעברית!!!" more than ten times, plus wrong gender and too-technical wording.

## Hard rules

1. **Hebrew only.** Not one English sentence. Technical terms get a plain-Hebrew replacement
   (deploy → "עדכון למערכת", RLS/permissions → "הרשאות", bug → "תקלה", cache → "רענון").
   If your Hebrew starts garbling, stop and tell Tomer in English — don't send him broken Hebrew to forward.
2. **Readers are not technical.** Amit is the CEO, not a developer. No file names, commit hashes,
   table names, error codes, SQL, "migration", "Vercel", "Supabase".
3. **Address each person in the right grammatical gender:**

   | Person | Role | Address as |
   |---|---|---|
   | עמית | מנכ"ל | זכר |
   | אילנית (אילנה, reception@) | משרד | **נקבה** |
   | נסיה | יועצת שירות | **נקבה** |
   | ערן | פחחות | זכר |
   | the whole group | — | רבים ("תעשו רענון") |

   Anyone not in this table: ask Tomer, or phrase gender-neutrally. Never guess from the name.
4. **WhatsApp format.** Plain text that pastes as-is: short lines, `*bold*` for headers (WhatsApp syntax,
   not markdown `**`), numbered items, minimal emoji (✅ done / ⏳ open / ❓ question). No tables, no
   markdown links, no images (WhatsApp won't copy them — if a visual is needed, say so and offer a
   screenshot file Tomer can attach separately).
5. **Short.** If it doesn't fit on one phone screen, cut it. Detail goes to Tomer, not to the staff.
6. **Put the message in a single code block** so Tomer can copy it in one click. Anything for
   Tomer himself (caveats, what to verify first) goes *outside* the block.

## Structure (use only the sections that apply)

```
*עדכון מערכת – DD/MM*

✅ *מה תוקן / נוסף*
1. <מה המשתמש יראה עכשיו, במילים שלו>

👉 *מה צריך לעשות*
1. <פעולה מעשית: לרענן, לצאת ולהיכנס, להיכנס לכתובת X>

❓ *שאלה*
1. <שאלה סגורה, עדיף כן/לא או בחירה בין 2 אפשרויות>
```

## Before writing

- Only report something as fixed if it was verified live in production (see `repro-as-user`
  and `push-to-prod`). If it was pushed but not yet confirmed — don't put it under ✅.
- If the message tells someone to do something (refresh, re-login, new URL), double-check the
  instruction is correct for *their* device/role.
- Dates in DD/MM format.

## Questions for Amit

When Claude needs a business decision: turn it into closed questions with concrete options from
the user's point of view ("כשאילנית מוחקת הפנייה – למחוק לגמרי, או להעביר לארכיון?"), never
"how should the RLS policy behave".
