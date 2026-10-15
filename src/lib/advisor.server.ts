import 'server-only';
import { readFile } from 'fs/promises';
import path from 'path';

// "🤖 התייעצות" (Amit, 2026-10-15): Claude as the system's advisor for the
// CEO. It knows the system from the repo's own docs (bundled with the
// /requests route — next.config outputFileTracingIncludes), answers in plain
// Hebrew, cannot change anything, and files change requests (which wait for
// Tomer's approval). Prompt caching keeps the large docs block cheap.

export const ADVISOR_MODEL = 'claude-sonnet-5-5';
const DOCS = ['docs/reference/modules-and-gotchas.md', 'docs/reference/automation-notifications.md'];

let knowledge: string | null = null;
async function loadKnowledge(): Promise<string> {
  if (knowledge !== null) return knowledge;
  const parts: string[] = [];
  for (const rel of DOCS) {
    try {
      parts.push(`### ${rel}\n${await readFile(path.join(process.cwd(), rel), 'utf8')}`);
    } catch {
      // a missing doc only narrows what the advisor knows
    }
  }
  knowledge = parts.join('\n\n');
  return knowledge;
}

const INSTRUCTIONS = `אתה "היועץ של המערכת" של מוסך תהילה (מערכת ניהול התיקים, התביעות, ההחזרות, הכספים והעובדים).
אתה מדבר עם עמית מימון, המנכ"ל. הוא לא איש טכני.

איך לענות:
- תמיד בעברית, קצר וברור, בלי מונחים טכניים (לא שמות טבלאות, קבצים או קוד). כמו יועץ שמכיר את המערכת לעומק.
- כל ערך עם התווית שלו; רשימות קצרות עדיפות על פסקאות ארוכות.
- הידע שלך: התיעוד המצורף למטה (מה נבנה, איך זה עובד ולמה). אם משהו לא מופיע בו או שאינך בטוח — אמור זאת בפשטות ואל תמציא.
- אינך רואה נתונים חיים (תיקים, סכומים, עובדים מסוימים). אם עמית שואל על תיק או מספר מסוים — הסבר איך זה מחושב/איפה רואים את זה, ואמור שאת הבדיקה של המקרה הספציפי צוות הפיתוח יכול לעשות (ואפשר לרשום זאת כבקשה).
- אינך יכול לשנות שום דבר במערכת בעצמך.

בקשות לשינוי:
- כשעמית מבקש שינוי, תוספת או תיקון: נסח במשפט-שניים מה בדיוק ישתנה, שאל שאלה מבהירה אם חסר משהו חשוב, ושאל "לרשום את זה כבקשה?".
- רק אחרי שהוא מאשר — קרא לכלי file_request. אחרי הרישום אמור: "רשמתי ✅ הבקשה עוברת לתומר לאישור, ואחרי האישור צוות הפיתוח מבצע. תקבל התראה כשזה מוכן."
- אל תבטיח מועדים ואל תבטיח שהשינוי יאושר.
- אם יש לך המלצה טובה יותר ממה שביקש (פשוטה יותר, או שמונעת בעיה) — הצע אותה בעדינות.`;

type Msg = { role: 'user' | 'assistant'; content: unknown };

const TOOLS = [
  {
    name: 'file_request',
    description: 'Record a change request from Amit for the development team (it waits for Tomer\'s approval). Call only after Amit confirmed he wants it recorded.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line in Hebrew: what to change.' },
        details: { type: 'string', description: 'Details in Hebrew: where in the system, what exactly, any example Amit gave.' },
      },
      required: ['summary', 'details'],
    },
  },
];

export async function askClaude(
  key: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  fileRequest: (summary: string, details: string) => Promise<string>,
): Promise<{ text: string; filed: number }> {
  const docs = await loadKnowledge();
  const system = [
    { type: 'text', text: INSTRUCTIONS },
    { type: 'text', text: `התיעוד של המערכת (לידע שלך בלבד, לא לציטוט טכני):\n\n${docs}`, cache_control: { type: 'ephemeral' } },
  ];
  const messages: Msg[] = history.map((m) => ({ role: m.role, content: m.content }));
  let filed = 0;
  for (let turn = 0; turn < 3; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ADVISOR_MODEL, max_tokens: 1500, system, tools: TOOLS, messages }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error('[advisor] api error', res.status, (await res.text()).slice(0, 300));
      throw new Error('api');
    }
    const data = (await res.json()) as { content: { type: string; text?: string; id?: string; name?: string; input?: { summary?: string; details?: string } }[]; stop_reason: string };
    const uses = data.content.filter((c) => c.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !uses.length) {
      return { text: data.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim(), filed };
    }
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const u of uses) {
      let out = 'unknown tool';
      if (u.name === 'file_request') {
        out = await fileRequest(String(u.input?.summary ?? '').slice(0, 300), String(u.input?.details ?? '').slice(0, 4000));
        filed++;
      }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }
  return { text: 'רשמתי את הבקשה ✅', filed };
}
